/* eslint-disable */
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GuidePanel } from "../components/GuidePanel";
import { LABELS } from "../constants/labels";
import {
  buildEpisodeFolder,
  DEFAUKLT_LANGUAGE,
  EPISODE_BULK_GUIDE_STEPS,
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
import type { EpisodeRow, ParsedItem, ToastTone } from "../types";
import { supabase } from "../lib/supabaseClient";
import { parseRss } from "../utils/rss";

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

interface ProgressInfo {
  programIndex: number;
  programTotal: number;
  channelName: string;
  stage: string;
  episodeIndex?: number;
  episodeTotal?: number;
  episodeTitle?: string;
}

interface BulkEpisodeAddPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

const BulkEpisodeAddPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: BulkEpisodeAddPageProps) => {
  useAuthGuard({ authUserEmail, onRequireLogin, showToast });

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] =
    useState<string>(DEFAUKLT_LANGUAGE);
  const [latestCount, setLatestCount] = useState<number>(4);
  const [sheetData, setSheetData] = useState<ExcelRow[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [excelStartRow, setExcelStartRow] = useState<number | undefined>(
    undefined,
  );
  const [excelEndRow, setExcelEndRow] = useState<number | undefined>(undefined);
  const [isAllRows, setIsAllRows] = useState(false);
  const [rowSelectionMode, setRowSelectionMode] = useState<"range" | "list">(
    "range",
  );
  const [excelRowListInput, setExcelRowListInput] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasCompletedRun, setHasCompletedRun] = useState(false);
  const [processResults, setProcessResults] = useState<ProcessResult[]>([]);
  const [progress, setProgress] = useState<ProgressInfo | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const prefix = `[EpisodeBulk][${type.toUpperCase()}]`;
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
      .replace(/[\s　]+/g, "")
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

  type RowSelection =
    | { mode: "range"; start: number; end?: number }
    | { mode: "list"; rows: number[] };

  const parseRowListInput = (input: string): number[] => {
    return Array.from(
      new Set(
        input
          .split(/[,\s]+/)
          .map((token) => token.trim())
          .filter(Boolean)
          .map((token) => Number(token))
          .filter((n) => Number.isInteger(n) && n >= 4),
      ),
    ).sort((a, b) => a - b);
  };

  const parseSheetData = useCallback(
    (file: File, sheetName: string, selection: RowSelection) => {
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

        const buildRowObj = (row: string[]): ExcelRow => {
          const obj: ExcelRow = {};
          currentHeader.forEach((h, i) => {
            if (h) obj[h] = row[i];
          });
          return obj;
        };

        const dataRows =
          selection.mode === "list"
            ? selection.rows
                .map((rowNum) => rows[rowNum - 3])
                .filter((row): row is string[] => Boolean(row))
                .map(buildRowObj)
            : rows
                .slice(
                  selection.start - 3,
                  (selection.end ?? rows.length + 2) - 2,
                )
                .map(buildRowObj);
        setSheetData([...dataRows]);
      };
      reader.readAsArrayBuffer(file);
    },
    [],
  );

  const scheduleParse = useCallback(
    (file: File, sheet: string, selection: RowSelection) => {
      if (parseDebounceRef.current) clearTimeout(parseDebounceRef.current);
      if (
        selection.mode === "range" &&
        selection.end !== undefined &&
        selection.end < selection.start
      )
        return;
      if (selection.mode === "list" && selection.rows.length === 0) return;
      parseDebounceRef.current = setTimeout(() => {
        parseSheetData(file, sheet, selection);
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
        setIsAllRows(false);
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
        setRowSelectionMode("range");
        setExcelRowListInput("");
        updateRangeAutomatically(file, firstSheet);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedLanguage((prev) => detectLanguageFromSheetName(sheetName, prev));
    setIsAllRows(false);
    setRowSelectionMode("range");
    setExcelRowListInput("");
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
    setRowSelectionMode("range");
    setExcelRowListInput("");
    setLogs([]);
    setProcessResults([]);
    setHasCompletedRun(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleBulkAddAll = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setHasCompletedRun(false);
    setProcessResults([]);
    const startMessage = "🚀 에피소드 일괄 추가 작업을 시작합니다.";
    setLogs([{ message: startMessage, type: "info" }]);
    console.info(`[EpisodeBulk][INFO] ${startMessage}`);

    const defaultLanguage = selectedLanguage;
    const limitCount = Math.max(1, Number(latestCount) || 5);
    const currentResults: ProcessResult[] = [];
    const pushResult = (result: ProcessResult) => {
      currentResults.push(result);
      setProcessResults([...currentResults]);
    };

    setProgress({
      programIndex: 0,
      programTotal: sheetData.length,
      channelName: "",
      stage: "준비 중",
    });

    try {
      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const rowLanguage = getRowLanguage(row, defaultLanguage);
        const channelName = String(row["채널명"] || "").trim();
        const rssUrl = String(row["rss"] || row["RSS"] || "").trim();
        const programIdx = i + 1;
        const programTotal = sheetData.length;

        setProgress({
          programIndex: programIdx,
          programTotal,
          channelName: channelName || rssUrl || `행 ${programIdx}`,
          stage: "프로그램 확인 중",
        });

        try {
          if (!rssUrl) throw new Error("RSS 정보 부족");

          const { data: allPrograms, error: progListErr } = await supabase
            .from("programs")
            .select("id, title");
          if (progListErr || !allPrograms)
            throw new Error("프로그램 목록 조회 실패");

          const normChannel = normalizeTitle(channelName);
          let prog = allPrograms.find(
            (p: any) => normChannel && normalizeTitle(p.title) === normChannel,
          );
          if (!prog && row["program_id"]) {
            prog = allPrograms.find(
              (p: any) => String(p.id) === String(row["program_id"]),
            );
          }
          if (!prog) {
            appendLog(
              `[P ${programIdx}/${programTotal}] [채널: ${channelName}] ❌ 프로그램 찾기 실패`,
              "error",
            );
            pushResult({
              program: channelName || "-",
              programId: undefined,
              episode: "-",
              episodeId: undefined,
              status: "failed",
              reason: "프로그램 찾기 실패",
            });
            continue;
          }

          setProgress({
            programIndex: programIdx,
            programTotal,
            channelName,
            stage: "기존 에피소드 조회 중",
          });

          const { data: existingEpisodes, error: epListErr } = await supabase
            .from("episodes")
            .select("id, title")
            .eq("program_id", prog.id);
          if (epListErr) throw new Error("기존 에피소드 조회 실패");
          const existingTitleSet = new Set(
            (existingEpisodes ?? []).map((ep: any) => normalizeTitle(ep.title)),
          );

          setProgress({
            programIndex: programIdx,
            programTotal,
            channelName,
            stage: "RSS 요청 중",
          });

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
          const r2Folder = buildEpisodeFolder(rowLanguage);
          const { channelTitle, items: rssItems } = parseRss(
            rssText,
            limitCount,
            prog.id,
            rowLanguage,
            r2Folder,
          ) as { channelTitle: string; items: ParsedItem[] };

          setProgress({
            programIndex: programIdx,
            programTotal,
            channelName: channelTitle,
            stage: "중복 에피소드 확인 중",
          });

          const targetItems = rssItems.filter(
            (item) => !existingTitleSet.has(normalizeTitle(item.title)),
          );
          const skippedItems = rssItems.filter((item) =>
            existingTitleSet.has(normalizeTitle(item.title)),
          );
          if (skippedItems.length > 0) {
            appendLog(
              `[P ${programIdx}/${programTotal}] [채널(${prog.id}): ${channelTitle}] ⏭️ 이미 존재하는 에피소드 ${skippedItems.length}건 스킵`,
              "info",
            );
            skippedItems.forEach((item) => {
              pushResult({
                program: channelTitle,
                programId: prog.id,
                episode: item.title,
                episodeId: undefined,
                status: "pass",
              });
            });
          }

          if (targetItems.length === 0) {
            if (skippedItems.length === 0) {
              const emptyReason =
                rssItems.length === 0
                  ? "RSS에서 가져온 항목 없음"
                  : "추가할 새 에피소드 없음";
              appendLog(
                `[P ${programIdx}/${programTotal}] [채널(${prog.id}): ${channelTitle}] ℹ️ ${emptyReason}`,
                "info",
              );
              pushResult({
                program: channelTitle,
                programId: prog.id,
                episode: "-",
                episodeId: undefined,
                status: "pass",
                reason: emptyReason,
              });
            }
            continue;
          }

          const episodeTotal = targetItems.length;
          let episodeCompleted = 0;
          const rowsToInsert: EpisodeRow[] = [];

          const processItem = async (item: ParsedItem) => {
            const epTitle = item.title;
            try {
              setProgress({
                programIndex: programIdx,
                programTotal,
                channelName: channelTitle,
                stage: "변환 + 업로드 진행 중",
                episodeIndex: episodeCompleted,
                episodeTotal,
                episodeTitle: epTitle,
              });

              if (!item.audioUrl) throw new Error("오디오 URL 없음");

              const m4aFilename = item.filename.replace(/\.mp3$/i, ".m4a");
              const folder = `${r2Folder.replace(/^\/+/, "")}/${channelTitle}`;
              const logContext = {
                channelName: channelTitle,
                episodeTitle: epTitle,
                programId: prog.id,
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeCompleted,
                episodeTotal,
              };
              // 진행 중 로그용 프리픽스: 지금까지 완료된 개수를 보여준다 (아직 이 항목은 미포함)
              const stagePrefix = formatContextPrefix({
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeCompleted,
                episodeTotal,
                channelName: channelTitle,
                programId: prog.id,
                episodeTitle: epTitle,
              });

              // 변환 + R2 업로드 (서버에서 직접 처리, 브라우저 왕복 없음)
              appendLog(`${stagePrefix} 🔄 변환 + 업로드 진행 중`, "info");
              const convertUploadRes = await fetch(
                "/api/convertAndUploadAudio",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: item.audioUrl,
                    filename: m4aFilename,
                    folder,
                    logContext,
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
              if (!r2Url) throw new Error("변환/업로드 실패");

              rowsToInsert.push({
                title: epTitle,
                program_id: prog.id,
                audio_file: (r2Url as string).replace(/#/g, "%23"),
                date: item.date,
                duration: item.duration,
                language: [rowLanguage],
              });

              episodeCompleted++;
              const donePrefix = formatContextPrefix({
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeCompleted,
                episodeTotal,
                channelName: channelTitle,
                programId: prog.id,
                episodeTitle: epTitle,
              });
              appendLog(`${donePrefix} ✅ 업로드 완료`, "success");
            } catch (err: any) {
              episodeCompleted++;
              const failReason = err?.message || "오류 발생";
              const failPrefix = formatContextPrefix({
                programIndex: programIdx,
                programTotal,
                episodeIndex: episodeCompleted,
                episodeTotal,
                channelName: channelTitle,
                programId: prog.id,
                episodeTitle: epTitle,
              });
              appendLog(`${failPrefix} ❌ 실패: ${failReason}`, "error");
              pushResult({
                program: channelTitle,
                programId: prog.id,
                episode: epTitle,
                episodeId: undefined,
                status: "failed",
                reason: failReason,
              });
            }
          };

          for (
            let startIdx = 0;
            startIdx < targetItems.length;
            startIdx += MAX_EPISODE_CONCURRENCY
          ) {
            const batch = targetItems.slice(
              startIdx,
              startIdx + MAX_EPISODE_CONCURRENCY,
            );
            await Promise.all(batch.map((item) => processItem(item)));
          }

          if (rowsToInsert.length > 0) {
            setProgress({
              programIndex: programIdx,
              programTotal,
              channelName: channelTitle,
              stage: "DB 저장 중",
              episodeTotal: rowsToInsert.length,
            });

            const { data: insertedRows, error: insertErr } = await supabase
              .from("episodes")
              .insert(rowsToInsert)
              .select("id, title");

            if (insertErr) {
              appendLog(
                `[P ${programIdx}/${programTotal}] [채널(${prog.id}): ${channelTitle}] ❌ Supabase 전송 실패: ${insertErr.message}`,
                "error",
              );
              rowsToInsert.forEach((insertedRow) => {
                pushResult({
                  program: channelTitle,
                  programId: prog.id,
                  episode: insertedRow.title,
                  episodeId: undefined,
                  status: "failed",
                  reason: insertErr.message,
                });
              });
            } else {
              (insertedRows ?? []).forEach((insertedRow: any) => {
                pushResult({
                  program: channelTitle,
                  programId: prog.id,
                  episode: insertedRow.title,
                  episodeId: insertedRow.id,
                  status: "success",
                });
              });
              appendLog(
                `[P ${programIdx}/${programTotal}] [채널(${prog.id}): ${channelTitle}] ✅ Supabase에 ${rowsToInsert.length}건 추가 완료`,
                "success",
              );
            }
          }
        } catch (err: any) {
          const failReason = err?.message || "오류 발생";
          appendLog(
            `[P ${programIdx}/${programTotal}] [채널: ${channelName}] ❌ 프로그램 에러: ${failReason}`,
            "error",
          );
          pushResult({
            program: channelName || rssUrl || `행 ${programIdx}`,
            programId: undefined,
            episode: "-",
            episodeId: undefined,
            status: "failed",
            reason: failReason,
          });
        }
      }
    } finally {
      setIsProcessing(false);
      setHasCompletedRun(true);
      setProgress(null);
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
          ? `⚠️ 작업 종료 (성공: ${successCount}건, 스킵: ${passCount}건, 실패: ${failedCount}건, 전체: ${totalCount}건)`
          : `🎉 작업 종료 (성공: ${successCount}건, 스킵: ${passCount}건, 전체: ${totalCount}건)`,
        failedCount > 0 ? "error" : "success",
      );
      setProcessResults(currentResults);
    }
  }, [sheetData, selectedLanguage, latestCount, isProcessing]);

  const isRangeInvalid =
    excelEndRow !== undefined && excelEndRow < (excelStartRow ?? 4);

  const parsedRowList = parseRowListInput(excelRowListInput);
  const isListInvalid =
    excelRowListInput.trim() !== "" && parsedRowList.length === 0;

  const isSelectionInvalid =
    rowSelectionMode === "range" ? isRangeInvalid : isListInvalid;

  useEffect(() => {
    if (!excelFile || !selectedSheet) return;

    if (rowSelectionMode === "list") {
      if (parsedRowList.length > 0) {
        scheduleParse(excelFile, selectedSheet, {
          mode: "list",
          rows: parsedRowList,
        });
      } else {
        setSheetData([]);
      }
      return;
    }

    const startRow = excelStartRow ?? 4;
    scheduleParse(excelFile, selectedSheet, {
      mode: "range",
      start: startRow,
      end: excelEndRow,
    });
  }, [
    excelFile,
    selectedSheet,
    excelStartRow,
    excelEndRow,
    rowSelectionMode,
    excelRowListInput,
    scheduleParse,
  ]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <>
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            {LABELS.PAGE.EPISODE_BULK.TITLE}
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            {LABELS.PAGE.EPISODE_BULK.DESCRIPTION}
          </p>
        </div>
        <GuidePanel guide_steps={EPISODE_BULK_GUIDE_STEPS} />
      </header>

      <section className={panelClass}>
        <div className="flex flex-col gap-6">
          {/* 엑셀 파일 업로드 섹션 */}
          <div className={fieldClass}>
            <span className={fieldLabelClass}>엑셀 파일 업로드</span>
            <div className="flex items-center gap-3">
              <label
                htmlFor="episode-bulk-excel-upload"
                className={`${ghostButtonClass} cursor-pointer px-4 py-2 text-sm inline-block`}
              >
                파일 선택
              </label>
              <input
                id="episode-bulk-excel-upload"
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

              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
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
                <div>
                  <span className={fieldLabelClass}>
                    최신 몇 개까지 추가할지
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={latestCount}
                    onChange={(e) =>
                      setLatestCount(
                        e.target.value ? Number(e.target.value) : 1,
                      )
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {rawRows.length > 1 && (
            <div className={fieldClass}>
              <div className="mb-2 flex flex-wrap items-center gap-5">
                <span className={fieldLabelClass}>
                  적용 범위 (엑셀 행 번호)
                </span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="episodeBulkRowSelectionMode"
                      checked={rowSelectionMode === "range"}
                      onChange={() => setRowSelectionMode("range")}
                    />
                    범위로 선택
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="episodeBulkRowSelectionMode"
                      checked={rowSelectionMode === "list"}
                      onChange={() => setRowSelectionMode("list")}
                    />
                    행 번호 직접 입력
                  </label>
                </div>
                {rowSelectionMode === "range" && (
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
                      id="episodeBulkAllRowsCheckbox"
                    />
                    <label
                      htmlFor="episodeBulkAllRowsCheckbox"
                      className={fieldLabelClass}
                    >
                      전체 (모든 행)
                    </label>
                  </div>
                )}
              </div>

              {rowSelectionMode === "range" ? (
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
              ) : (
                <div>
                  <input
                    type="text"
                    value={excelRowListInput}
                    onChange={(e) => setExcelRowListInput(e.target.value)}
                    className={inputClass}
                    placeholder="예: 4, 10, 15"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    쉼표(,) 또는 공백으로 구분해 원하는 엑셀 행 번호를 입력하세요.
                    (예: 4, 10, 15)
                  </p>
                  {isListInvalid && (
                    <p className="mt-1 text-sm text-rose-500">
                      올바른 행 번호를 입력해 주세요. (4 이상의 숫자를 쉼표나
                      공백으로 구분)
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 미리보기 테이블 */}
          {sheetData.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>
                대상 프로그램 미리보기 (상위 10행)
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

          {/* 작업 시작 버튼 */}
          {rawRows.length > 1 && (
            <div className={fieldClass}>
              {rowSelectionMode === "range" && isRangeInvalid && (
                <p className="mb-2 text-sm text-rose-500">
                  끝 행이 시작 행보다 작습니다. 범위를 올바르게 입력해 주세요.
                </p>
              )}
              <button
                onClick={handleBulkAddAll}
                disabled={
                  isProcessing || isSelectionInvalid || sheetData.length === 0
                }
                className={ghostButtonClass + " px-8 py-2"}
              >
                {isProcessing ? "처리 중..." : "일괄 추가 시작"}
              </button>
            </div>
          )}

          {/* 진행 상황 */}
          {progress && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>진행 상황</span>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[rgba(242,201,76,0.15)] px-3 py-2 text-sm font-semibold text-ink">
                  <span>
                    [프로그램 {progress.programIndex}/{progress.programTotal}]
                  </span>
                  {typeof progress.episodeIndex === "number" &&
                    typeof progress.episodeTotal === "number" && (
                      <span>
                        [에피소드 {progress.episodeIndex}/
                        {progress.episodeTotal}]
                      </span>
                    )}
                  <span className="text-ink-muted">
                    {progress.channelName || "-"}
                    {progress.episodeTitle ? ` · ${progress.episodeTitle}` : ""}
                  </span>
                  <span className="ml-auto rounded-full bg-white/70 px-2.5 py-0.5 text-xs text-ink-muted">
                    {progress.stage}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (progress.programIndex /
                            Math.max(1, progress.programTotal)) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
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

          {/* 작업 결과 요약 테이블 */}
          {processResults.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>
                {isProcessing
                  ? `실시간 처리 현황 (진행 중, 지금까지 ${processResults.length}건)`
                  : `작업 결과 요약 (완료, ${processResults.length}건)`}
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
                                ? "SKIP"
                                : "FAILED"}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-2 ${res.status === "failed" ? "text-rose-500 italic" : "text-slate-400"}`}
                        >
                          {res.reason ?? "-"}
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

export default BulkEpisodeAddPage;
