/* eslint-disable */
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GuidePanel } from "../components/GuidePanel";
import { LABELS } from "../constants/labels";
import {
  AUDIO_REMAPPING_GUIDE_STEPS,
  BASE_URL,
  DEFAUKLT_LANGUAGE,
} from "../constants/options";
import { LANGUAGE_OPTIONS } from "../constants/language";
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  panelClass,
} from "../constants/style";
import { useAuthGuard } from "../hooks/useAuthGuard";
import type { ToastTone } from "../types";
import { supabase } from "../lib/supabaseClient";
import { useAudioConvert } from "../hooks/useAudioConvert";
import { useAudioUpload } from "../hooks/useAudioUpload";
import { formatDuration } from "../utils/format";
import { parseRss } from "../utils/rss";

// 타입 정의
interface ExcelRow {
  [key: string]: string | number | undefined;
}

interface LogEntry {
  message: string;
  type: "info" | "success" | "error";
}

interface ProcessResult {
  program: string;
  programId?: number;
  episode: string;
  episodeId?: number;
  status: "success" | "failed" | "pass";
  reason?: string;
}

interface ParsedItem {
  title: string;
  link?: string;
  date?: string;
  pubDate?: string;
  audioUrl?: string;
  [key: string]: any;
}

interface AudioRemappingPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

const AudioRemappingPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: AudioRemappingPageProps) => {
  useAuthGuard({ authUserEmail, onRequireLogin, showToast });

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] =
    useState<string>(DEFAUKLT_LANGUAGE);
  const [sheetData, setSheetData] = useState<ExcelRow[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [excelStartRow, setExcelStartRow] = useState<number | undefined>(
    undefined,
  );
  const [excelEndRow, setExcelEndRow] = useState<number | undefined>(undefined);
  const [isAllRows, setIsAllRows] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasCompletedRun, setHasCompletedRun] = useState(false);
  // 성공/실패 통합 결과 리스트
  const [processResults, setProcessResults] = useState<ProcessResult[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { convertAll } = useAudioConvert({
    addLog: (msg) =>
      setLogs((prev) => [...prev, { message: msg, type: "info" }]),
    setProcess: () => {},
  });

  const { uploadAll } = useAudioUpload({
    addLog: (msg) =>
      setLogs((prev) => [...prev, { message: msg, type: "info" }]),
    setProcess: () => {},
  });

  const REQUIRED_COLUMNS: { key: string; label: string }[] = [
    { key: "현 데모 순위", label: "현 데모 순위" },
    { key: "program_id", label: "program_id" },
    { key: "rank", label: "rank" },
    { key: "채널명", label: "채널명" },
    { key: "rss", label: "RSS" },
  ];
  const MAX_EPISODE_CONCURRENCY = import.meta.env.PROD ? 1 : 5;

  const appendLog = (message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { message, type }]);
    const prefix = `[AudioRemap][${type.toUpperCase()}]`;
    if (type === "error") {
      console.error(`${prefix} ${message}`);
      return;
    }
    if (type === "success") {
      console.log(`${prefix} ${message}`);
      return;
    }
    console.info(`${prefix} ${message}`);
  };

  const normalizeTitle = (title: string) => {
    if (!title) return "";
    return title
      .replace(/^#?\d+\s*/g, "")
      .replace(/[\[\]\(\)【】「」『』]/g, "")
      .replace(/[\s\u3000]+/g, "")
      .replace(/[!！?？,.、。・：:;；]/g, "")
      .toLowerCase()
      .trim();
  };

  const formatContextPrefix = (context: {
    programIndex?: number;
    programTotal?: number;
    episodeIndex?: number;
    episodeTotal?: number;
    channelName?: string;
    programId?: number;
    episodeTitle?: string;
    episodeId?: number;
  }) => {
    const toText = (value?: number) =>
      typeof value === "number" ? String(value) : "--";

    const p = `[P ${toText(context.programIndex)}/${toText(context.programTotal)}]`;
    const e = `[E ${toText(context.episodeIndex)}/${toText(context.episodeTotal)}]`;
    const channel =
      typeof context.programId === "number"
        ? `[채널(${context.programId}): ${context.channelName || ""}]`
        : `[채널: ${context.channelName || ""}]`;
    const episode =
      typeof context.episodeId === "number"
        ? `[에피(${context.episodeId}): ${context.episodeTitle || ""}]`
        : `[에피: ${context.episodeTitle || ""}]`;

    return `${p}${e} ${channel} ${episode}`;
  };

  const resolveR2Folder = (targetLanguage: string) => {
    const normalizedLanguage = String(targetLanguage || "").toLowerCase();

    // 경로 일관성을 위해 언어별 고정 폴더를 사용
    if (normalizedLanguage === "ko" || normalizedLanguage === "kr") {
      return "/episodes-audio/m4a";
    }

    if (normalizedLanguage === "en") {
      return "/en-episodes-audio/m4a";
    }

    return `/${normalizedLanguage}-episodes-audio/m4a`;
  };

  const formatDate = (dateInput: string | Date | undefined) => {
    if (!dateInput) return "";
    try {
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return "";
      return d.toISOString().split("T")[0];
    } catch {
      return "";
    }
  };

  const normalizeDuration = (duration: string | number | undefined) =>
    formatDuration(duration ?? null);

  const getRowLanguage = (row: ExcelRow, fallback = DEFAUKLT_LANGUAGE) => {
    const raw =
      row["language"] ??
      row["Language"] ??
      row["LANGUAGE"] ??
      row["lang"] ??
      row["Lang"] ??
      row["언어"] ??
      fallback;

    const normalized = String(raw || "")
      .trim()
      .toLowerCase();
    return normalized || String(fallback).trim().toLowerCase();
  };

  const detectLanguageFromSheetName = (
    sheetName: string,
    fallback = DEFAUKLT_LANGUAGE,
  ) => {
    const normalized = String(sheetName || "")
      .trim()
      .toLowerCase();
    if (!normalized) return fallback;

    const prefix = normalized.split(/[_\-\s]+/)[0];
    const codeMap: Record<string, string> = {
      ko: "ko",
      kr: "ko",
      en: "en",
      us: "en",
      de: "de",
      jp: "jp",
      ja: "jp",
      in: "in",
      uk: "uk",
      fr: "fr",
      es: "es",
      it: "it",
    };
    if (codeMap[prefix]) return codeMap[prefix];

    if (normalized.includes("미국") || normalized.includes("english"))
      return "en";
    if (normalized.includes("한국") || normalized.includes("korea"))
      return "ko";
    if (normalized.includes("독일") || normalized.includes("german"))
      return "de";
    if (normalized.includes("일본") || normalized.includes("japan"))
      return "jp";
    if (normalized.includes("인도") || normalized.includes("india"))
      return "in";
    if (normalized.includes("영국") || normalized.includes("britain"))
      return "uk";
    if (normalized.includes("프랑스") || normalized.includes("france"))
      return "fr";
    if (normalized.includes("스페인") || normalized.includes("spain"))
      return "es";
    if (normalized.includes("이탈리아") || normalized.includes("italy"))
      return "it";

    return fallback;
  };

  const parseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseSheetData = useCallback(
    (file: File, sheetName: string, start: number, end?: number) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = evt.target?.result;
        if (!data) return;
        const workbook = XLSX.read(data, { type: "array" });
        const ws = workbook.Sheets[sheetName];
        if (!ws) return;
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          defval: "",
          range: 2,
        });
        if (rows.length === 0) return;

        const currentHeader = rows[0].map((h) =>
          String(h).trim().toLowerCase(),
        );
        setRawRows(rows);

        const finalEndRow = end ?? rows.length + 2;

        const dataRows = rows.slice(start - 3, finalEndRow - 2).map((row) => {
          const obj: ExcelRow = {};
          currentHeader.forEach((h, i) => {
            if (h) obj[h] = row[i];
          });
          return obj;
        });
        setSheetData([...dataRows]);
      };
      reader.readAsArrayBuffer(file);
    },
    [],
  );

  // useEffect 의존성 배열의 cleanup 누락 문제를 우회하기 위해 직접 호출 방식 사용
  const scheduleParse = useCallback(
    (file: File, sheet: string, start: number, end?: number) => {
      if (parseDebounceRef.current) clearTimeout(parseDebounceRef.current);
      if (end !== undefined && end < start) return;
      parseDebounceRef.current = setTimeout(() => {
        parseSheetData(file, sheet, start, end);
      }, 200);
    },
    [parseSheetData],
  );

  const updateRangeAutomatically = (file: File, sheetName: string) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: "array" });
      const ws = workbook.Sheets[sheetName];
      if (!ws) return;
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        defval: "",
        range: 2,
      });

      if (rows.length > 0) {
        const lastRow = rows.length + 2;
        setExcelStartRow(4);
        setExcelEndRow(lastRow);
        setIsAllRows(false); // 항상 해제
        setRawRows(rows);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setExcelFile(file);
    setHasCompletedRun(false);
    setProcessResults([]);
    setLogs([]);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: "array" });
      setSheetNames(workbook.SheetNames);
      if (workbook.SheetNames.length > 0) {
        const firstSheet = workbook.SheetNames[0];
        setSelectedSheet(firstSheet);
        setSelectedLanguage((prev) =>
          detectLanguageFromSheetName(firstSheet, prev),
        );
        updateRangeAutomatically(file, firstSheet);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedLanguage((prev) => detectLanguageFromSheetName(sheetName, prev));
    setIsAllRows(false); // 시트 변경 시 항상 해제
    if (excelFile) {
      updateRangeAutomatically(excelFile, sheetName);
    }
  };

  const handleResetForReupload = () => {
    setExcelFile(null);
    setSheetNames([]);
    setSelectedSheet("");
    setSheetData([]);
    setRawRows([]);
    setExcelStartRow(undefined);
    setExcelEndRow(undefined);
    setIsAllRows(false);
    setLogs([]);
    setProcessResults([]);
    setHasCompletedRun(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemapAll = useCallback(async () => {
    if (isProcessing) return;
    // sheetData는 이미 최신 범위로 반영된 상태에서 작업 시작
    setIsProcessing(true);
    setHasCompletedRun(false);
    setProcessResults([]); // 이전 결과 초기화
    const startMessage = "🚀 자동 리매핑 및 경로 최적화 작업을 시작합니다.";
    setLogs([{ message: startMessage, type: "info" }]);
    console.info(`[AudioRemap][INFO] ${startMessage}`);
    // 작업 시작 시 excelFile, rawRows, sheetData 등은 초기화하지 않음 (상태 유지)

    const defaultLanguage = selectedLanguage;
    const currentResults: ProcessResult[] = [];

    try {
      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const rowLanguage = getRowLanguage(row, defaultLanguage);
        const channelName = String(row["채널명"] || "").trim();
        const rssUrl = String(row["rss"] || "").trim();
        const programIdx = i + 1;
        const programTotal = sheetData.length;

        try {
          if (!channelName || !rssUrl) throw new Error("데이터 부족");

          // 프로그램명 normalize 비교로 변경
          const { data: allPrograms, error: progListErr } = await supabase
            .from("programs")
            .select("id, title");
          if (progListErr || !allPrograms)
            throw new Error("프로그램 목록 조회 실패");
          const normChannel = normalizeTitle(channelName);
          let prog = allPrograms.find(
            (p: any) => normalizeTitle(p.title) === normChannel,
          );
          // 타이틀로 못 찾으면 program_id(C열)로 재시도
          if (!prog && row["program_id"]) {
            prog = allPrograms.find(
              (p: any) => String(p.id) === String(row["program_id"]),
            );
          }
          if (!prog) {
            // 실패도 결과 요약에 추가
            const contextPrefix = formatContextPrefix({
              programIndex: programIdx,
              programTotal,
              episodeIndex: 0,
              episodeTotal: 0,
              channelName,
            });
            appendLog(
              `${contextPrefix} ❌ 프로그램 에러: 프로그램 찾기 실패`,
              "error",
            );
            currentResults.push({
              program: channelName,
              programId: undefined,
              episode: "-",
              episodeId: undefined,
              status: "failed",
              reason: "프로그램 찾기 실패",
            });
            continue; // 이 row는 스킵하고 다음 프로그램으로 진행
          }

          const { data: episodes } = await supabase
            .from("episodes")
            .select("id, title, audio_file, date, duration")
            .eq("program_id", prog.id);
          if (!episodes) throw new Error("에피소드 목록 조회 실패");

          const rssRes = await fetch(
            `/api/rss?url=${encodeURIComponent(rssUrl)}`,
          );
          if (!rssRes.ok) {
            const failureText = await rssRes.text();
            const failurePreview = failureText
              .slice(0, 180)
              .replace(/\s+/g, " ")
              .trim();
            throw new Error(
              `RSS 요청 실패 (${rssRes.status}): ${failurePreview || rssRes.statusText}`,
            );
          }
          const rssText = await rssRes.text();
          const { items: rssItems } = parseRss(
            rssText,
            1000,
            prog.id,
            rowLanguage,
          ) as { items: ParsedItem[] };

          let episodeProcessed = 0;
          const processEpisode = async (episode: any) => {
            const epTitle = episode.title || "Unknown Title";
            const episodeTotal = episodes.length;
            try {
              const episodeProgressHint = episodeProcessed + 1;
              const contextPrefix = formatContextPrefix({
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeProgressHint,
                episodeTotal,
                channelName,
                programId: prog.id,
                episodeTitle: epTitle,
                episodeId: episode.id,
              });

              const epNorm = normalizeTitle(epTitle);
              const epDate = formatDate(episode.date);
              const epDuration = normalizeDuration(episode.duration);
              const matchedRssByDate = rssItems.find((item) => {
                const rssPubDate = formatDate(item.pubDate);
                const rssDate = formatDate(item.date || item.pubDate);
                return epDate && (epDate === rssPubDate || epDate === rssDate);
              });

              const matchedRssByDateAndDuration = rssItems.find((item) => {
                const rssPubDate = formatDate(item.pubDate);
                const rssDate = formatDate(item.date || item.pubDate);
                const rssDuration = normalizeDuration(item.duration);
                return (
                  epDate &&
                  (epDate === rssPubDate || epDate === rssDate) &&
                  epDuration &&
                  epDuration === rssDuration
                );
              });

              const matchedRss =
                matchedRssByDateAndDuration ??
                matchedRssByDate ??
                rssItems.find((item) => {
                  const rssNorm = normalizeTitle(item.title);
                  const rssItunesNorm = normalizeTitle(item.itunesTitle || "");
                  const rssDate = formatDate(item.date || item.pubDate);
                  const titleIncludedByRss =
                    Boolean(epNorm) &&
                    Boolean(rssNorm) &&
                    rssNorm.includes(epNorm);
                  const titleIncludedByItunes =
                    Boolean(epNorm) &&
                    Boolean(rssItunesNorm) &&
                    rssItunesNorm.includes(epNorm);
                  return (
                    rssNorm === epNorm ||
                    (rssItunesNorm && rssItunesNorm === epNorm) ||
                    titleIncludedByRss ||
                    titleIncludedByItunes ||
                    (epDate && epDate === rssDate)
                  );
                });

              if (!matchedRss) {
                throw new Error("RSS 매칭 실패");
              }

              const r2Folder = resolveR2Folder(rowLanguage);
              appendLog(
                `${contextPrefix} 업로드 경로 기준 언어: ${rowLanguage}, 폴더: ${r2Folder}`,
                "info",
              );

              const epSafeTitle = epTitle.replace(/[/\\?%*:|"<>]/g, "-");
              const m4aFilename = `${epSafeTitle}.m4a`;

              // 최종 URL을 미리 계산해서 변환 전에 확인
              const trimmedFolder = r2Folder.trim().replace(/^\/+|\/+$/g, "");
              const folderPath = trimmedFolder
                ? `${trimmedFolder
                    .split("/")
                    .map((seg) => encodeURIComponent(seg))
                    .join("/")}/`
                : "";
              const expectedFinalUrl =
                `${BASE_URL}/${folderPath}${encodeURIComponent(
                  channelName,
                )}/${encodeURIComponent(m4aFilename)}`.replace(/#/g, "%23");

              // 이미 성공한 경로인지 확인 (변환 전 스킵 로직)
              if (episode.audio_file === expectedFinalUrl) {
                episodeProcessed++;
                const skipPrefix = formatContextPrefix({
                  programIndex: programIdx,
                  programTotal,
                  episodeIndex: episodeProcessed,
                  episodeTotal,
                  channelName,
                  programId: prog.id,
                  episodeTitle: epTitle,
                  episodeId: episode.id,
                });
                appendLog(
                  `${skipPrefix} ⏭️ 스킵: 이미 성공한 경로입니다`,
                  "info",
                );
                currentResults.push({
                  program: channelName,
                  programId: prog.id,
                  episode: epTitle,
                  episodeId: episode.id,
                  status: "pass",
                });
                return;
              }

              const folder = `${r2Folder.replace(/^\/+/, "")}/${channelName}`;
              const convertUploadRes = await fetch(
                "/api/convertAndUploadAudio",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: matchedRss.audioUrl,
                    filename: m4aFilename,
                    folder,
                    logContext: {
                      channelName,
                      episodeTitle: epTitle,
                      programId: prog.id,
                      episodeId: episode.id,
                      programIndex: programIdx,
                      programTotal,
                      episodeIndex: episodeProgressHint,
                      episodeTotal,
                    },
                  }),
                },
              );

              if (!convertUploadRes.ok) {
                const errData = await convertUploadRes.json().catch(() => ({
                  error: `변환/업로드 실패 (${convertUploadRes.status})`,
                }));
                throw new Error(
                  errData.details ||
                    errData.error ||
                    `변환/업로드 실패 (${convertUploadRes.status})`,
                );
              }

              const { url: r2Url } = await convertUploadRes.json();
              if (!r2Url) throw new Error("업로드 실패");

              const finalUrl = (r2Url as string).replace(/#/g, "%23");

              const { error: updateErr } = await supabase
                .from("episodes")
                .update({ audio_file: finalUrl })
                .eq("id", episode.id);

              if (updateErr) throw updateErr;

              episodeProcessed++;
              await fetch("/api/logProgress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  stage: "supabase-apply-done",
                  logContext: {
                    channelName,
                    episodeTitle: epTitle,
                    programId: prog.id,
                    episodeId: episode.id,
                    programIndex: programIdx,
                    programTotal,
                    episodeIndex: episodeProcessed,
                    episodeTotal,
                  },
                }),
              }).catch(() => {
                // 터미널 로그 전용 호출 실패는 메인 흐름을 막지 않음
              });

              const donePrefix = formatContextPrefix({
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeProcessed,
                episodeTotal,
                channelName,
                programId: prog.id,
                episodeTitle: epTitle,
                episodeId: episode.id,
              });
              appendLog(`${donePrefix} ✅ 완료`, "success");
              currentResults.push({
                program: channelName,
                programId: prog.id,
                episode: epTitle,
                episodeId: episode.id,
                status: "success",
              });
            } catch (err: any) {
              episodeProcessed++;
              const failReason = err?.message || "오류 발생";
              await fetch("/api/logProgress", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  stage: "supabase-apply-failed",
                  reason: failReason,
                  logContext: {
                    channelName,
                    episodeTitle: epTitle,
                    programId: prog.id,
                    episodeId: episode.id,
                    programIndex: programIdx,
                    programTotal,
                    episodeIndex: episodeProcessed,
                    episodeTotal,
                  },
                }),
              }).catch(() => {
                // 터미널 로그 전용 호출 실패는 메인 흐름을 막지 않음
              });

              const failPrefix = formatContextPrefix({
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeProcessed,
                episodeTotal,
                channelName,
                programId: prog.id,
                episodeTitle: epTitle,
                episodeId: episode.id,
              });
              appendLog(`${failPrefix} ❌ 실패: ${failReason}`, "error");
              currentResults.push({
                program: channelName,
                programId: prog.id,
                episode: epTitle,
                episodeId: episode.id,
                status: "failed",
                reason: failReason,
              });
            }
          };

          for (
            let startIdx = 0;
            startIdx < episodes.length;
            startIdx += MAX_EPISODE_CONCURRENCY
          ) {
            const batch = episodes.slice(
              startIdx,
              startIdx + MAX_EPISODE_CONCURRENCY,
            );
            await Promise.all(batch.map((episode) => processEpisode(episode)));
          }
        } catch (err: any) {
          const contextPrefix = formatContextPrefix({
            programIndex: programIdx,
            programTotal,
            episodeIndex: 0,
            episodeTotal: 0,
            channelName,
          });
          appendLog(
            `${contextPrefix} ❌ 프로그램 에러: ${err.message}`,
            "error",
          );
        }
      }
    } finally {
      setIsProcessing(false);
      setHasCompletedRun(true);
      const successCount = currentResults.filter(
        (result) => result.status === "success",
      ).length;
      const passCount = currentResults.filter(
        (result) => result.status === "pass",
      ).length;
      const failedCount = currentResults.filter(
        (result) => result.status === "failed",
      ).length;
      const totalCount = currentResults.length;
      appendLog(
        failedCount > 0
          ? `⚠️ 작업 종료 (성공: ${successCount}건, 패스: ${passCount}건, 실패: ${failedCount}건, 전체: ${totalCount}건)`
          : `🎉 작업 종료 (성공: ${successCount}건, 패스: ${passCount}건, 전체: ${totalCount}건)`,
        failedCount > 0 ? "error" : "success",
      );
      setProcessResults(currentResults);
      // 작업 종료 후에도 excelFile, rawRows, sheetData 등은 초기화하지 않음 (상태 유지)
    }
  }, [sheetData, selectedLanguage, convertAll, uploadAll, isProcessing]);

  const isRangeInvalid =
    excelEndRow !== undefined && excelEndRow < (excelStartRow ?? 4);

  // 파일/시트/범위 변경 시 재파싱
  useEffect(() => {
    if (excelFile && selectedSheet) {
      const startRow = excelStartRow ?? 4;
      scheduleParse(excelFile, selectedSheet, startRow, excelEndRow);
    }
  }, [excelFile, selectedSheet, excelStartRow, excelEndRow, scheduleParse]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <>
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            {LABELS.PAGE.AUDIO_REMAPPING.TITLE}
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            {LABELS.PAGE.AUDIO_REMAPPING.DESCRIPTION}
          </p>
        </div>
        <GuidePanel guide_steps={AUDIO_REMAPPING_GUIDE_STEPS} />
      </header>

      <section className={panelClass}>
        <div className="flex flex-col gap-6">
          {/* 엑셀 파일 업로드 섹션 */}
          <div className={fieldClass}>
            <span className={fieldLabelClass}>엑셀 파일 업로드</span>
            <div className="flex items-center gap-3">
              <label
                htmlFor="excel-upload"
                className={`${ghostButtonClass} cursor-pointer px-4 py-2 text-sm inline-block`}
              >
                파일 선택
              </label>
              <input
                id="excel-upload"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleExcelChange}
                className="hidden"
              />
              {excelFile ? (
                <span className="text-emerald-600 font-medium flex items-center gap-1 animate-in fade-in">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {excelFile.name}
                </span>
              ) : (
                <span className="text-slate-400 text-sm italic">
                  선택된 파일 없음
                </span>
              )}
            </div>
          </div>

          {/* 시트 선택 및 범위 설정 */}
          {sheetNames.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>시트 선택</span>
              <select
                value={selectedSheet}
                onChange={(e) => handleSheetChange(e.target.value)}
                className={inputClass}
              >
                {sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>

              <div className="mt-3">
                <span className={fieldLabelClass}>Language</span>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className={inputClass}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {rawRows.length > 1 && (
            <div className={fieldClass}>
              <div className="mb-2 flex items-center gap-5">
                <span className={fieldLabelClass}>
                  적용 범위 (엑셀 행 번호)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isAllRows}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setIsAllRows(true);
                        setExcelStartRow(4);
                        setExcelEndRow(rawRows.length + 2);
                      } else {
                        setIsAllRows(false);
                      }
                    }}
                    className="mr-2"
                    id="allRowsCheckbox"
                  />
                  <label htmlFor="allRowsCheckbox" className={fieldLabelClass}>
                    전체 (모든 행)
                  </label>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <input
                  type="number"
                  min={4}
                  value={excelStartRow ?? ""}
                  onChange={(e) => {
                    const newStart = e.target.value
                      ? Number(e.target.value)
                      : undefined;
                    setExcelStartRow(newStart);
                    setIsAllRows(false);
                  }}
                  className={inputClass + " w-24"}
                  placeholder="4"
                  disabled={isAllRows}
                />
                <span>~</span>
                <input
                  type="number"
                  max={rawRows.length + 2}
                  value={excelEndRow ?? ""}
                  onChange={(e) => {
                    const newEnd = e.target.value
                      ? Number(e.target.value)
                      : undefined;
                    setExcelEndRow(newEnd);
                    setIsAllRows(false);
                  }}
                  className={inputClass + " w-24"}
                  placeholder={
                    rawRows.length > 0 ? String(rawRows.length + 2) : "끝행"
                  }
                  disabled={isAllRows}
                />
              </div>
            </div>
          )}

          {/* 미리보기 테이블 */}
          {sheetData.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>
                매핑 데이터 미리보기 (상위 10행)
              </span>
              <div className="overflow-x-auto rounded shadow border bg-linear-to-br from-white to-slate-50">
                <table className="min-w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {REQUIRED_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-left"
                          style={{
                            position: "sticky",
                            top: 0,
                            background: "#f8fafc",
                          }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetData.slice(0, 10).map((row, i) => (
                      <tr
                        key={i}
                        className={
                          "transition-colors border-b border-slate-100 " +
                          (i % 2 === 0 ? "bg-white" : "bg-slate-50") +
                          " hover:bg-yellow-50 group"
                        }
                      >
                        {REQUIRED_COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className="px-4 py-2 text-slate-800 border-r border-slate-100 group-last:border-r-0 group-hover:bg-yellow-50"
                            style={{
                              maxWidth: 180,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={String(row[col.key] || "")}
                          >
                            {row[col.key]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 작업 시작 버튼 - 파일이 로드된 경우 항상 표시 */}
          {rawRows.length > 1 && (
            <div className={fieldClass}>
              {isRangeInvalid && (
                <p className="mb-2 text-sm text-rose-500">
                  끝 행이 시작 행보다 작습니다. 범위를 올바르게 입력해 주세요.
                </p>
              )}
              <button
                onClick={handleRemapAll}
                disabled={
                  isProcessing || isRangeInvalid || sheetData.length === 0
                }
                className={ghostButtonClass + " px-8 py-2"}
              >
                {isProcessing ? "처리 중..." : "작업 시작"}
              </button>
            </div>
          )}

          {/* 진행 로그 */}
          <div className={fieldClass}>
            <span className={fieldLabelClass}>진행 로그</span>
            <div className="bg-slate-900 text-slate-200 rounded p-4 h-64 overflow-y-auto font-mono text-[11px]">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.type === "error"
                      ? "text-rose-400"
                      : log.type === "success"
                        ? "text-emerald-400"
                        : "text-slate-300"
                  }
                >
                  <span className="opacity-50 mr-2">
                    [{new Date().toLocaleTimeString()}]
                  </span>
                  {log.message}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>

          {/* 작업 결과 요약 테이블 (신규 스타일 적용) */}
          {processResults.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>
                작업 결과 요약 ({processResults.length}건)
              </span>
              <div className="overflow-x-auto rounded shadow border bg-linear-to-br from-white to-slate-50 max-h-100">
                <table className="min-w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th
                        className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-left"
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f8fafc",
                        }}
                      >
                        채널명(ID)
                      </th>
                      <th
                        className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-left"
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f8fafc",
                        }}
                      >
                        에피소드명(ID)
                      </th>
                      <th
                        className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-center"
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f8fafc",
                          width: "100px",
                        }}
                      >
                        상태
                      </th>
                      <th
                        className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-left"
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f8fafc",
                        }}
                      >
                        비고(실패 사유)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {processResults.map((res, i) => (
                      <tr
                        key={i}
                        className={
                          "transition-colors border-b border-slate-100 " +
                          (i % 2 === 0 ? "bg-white" : "bg-slate-50") +
                          " hover:bg-yellow-50 group"
                        }
                      >
                        <td className="px-4 py-2 text-slate-800 border-r border-slate-100 font-medium">
                          {res.program}
                          {typeof res.programId === "number"
                            ? ` (${res.programId})`
                            : ""}
                        </td>
                        <td
                          className="px-4 py-2 text-slate-800 border-r border-slate-100"
                          style={{
                            maxWidth: 250,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={res.episode}
                        >
                          {res.episode}
                          {typeof res.episodeId === "number"
                            ? ` (${res.episodeId})`
                            : ""}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-100 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              res.status === "success"
                                ? "bg-emerald-100 text-emerald-700"
                                : res.status === "pass"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {res.status === "success"
                              ? "SUCCESS"
                              : res.status === "pass"
                                ? "PASS"
                                : "FAILED"}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-2 ${res.status === "failed" ? "text-rose-500 italic" : "text-slate-400"}`}
                        >
                          {res.status === "failed" ? res.reason : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 작업 후 선택 */}
          {hasCompletedRun && !isProcessing && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>작업 후 선택</span>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleResetForReupload}
                  className={ghostButtonClass + " px-5 py-2"}
                >
                  파일 다시 업로드
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default AudioRemappingPage;
