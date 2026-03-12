/* eslint-disable */
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GuidePanel } from "../components/GuidePanel";
import { LABELS } from "../constants/labels";
import {
  AUDIO_REMAPPING_GUIDE_STEPS,
  buildEpisodeFolder,
  DEFAUKLT_LANGUAGE,
} from "../constants/options";
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
  episode: string;
  status: "success" | "failed";
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
  const [sheetData, setSheetData] = useState<ExcelRow[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [excelStartRow, setExcelStartRow] = useState<number | undefined>(
    undefined,
  );
  const [excelEndRow, setExcelEndRow] = useState<number | undefined>(undefined);
  const [isAllRows, setIsAllRows] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  // 성공/실패 통합 결과 리스트
  const [processResults, setProcessResults] = useState<ProcessResult[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);

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

  const REQUIRED_COLUMNS = [
    "현 데모 순위",
    "program_id",
    "rank",
    "채널명",
    "RSS",
  ];

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

        const currentHeader = rows[0].map((h) => String(h).trim());
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
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: "array" });
      setSheetNames(workbook.SheetNames);
      if (workbook.SheetNames.length > 0) {
        const firstSheet = workbook.SheetNames[0];
        setSelectedSheet(firstSheet);
        updateRangeAutomatically(file, firstSheet);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setIsAllRows(false); // 시트 변경 시 항상 해제
    if (excelFile) {
      updateRangeAutomatically(excelFile, sheetName);
    }
  };

  const handleRemapAll = useCallback(async () => {
    if (isProcessing) return;
    // sheetData는 이미 최신 범위로 반영된 상태에서 작업 시작
    setIsProcessing(true);
    setProcessResults([]); // 이전 결과 초기화
    setLogs([
      {
        message: "🚀 자동 리매핑 및 경로 최적화 작업을 시작합니다.",
        type: "info",
      },
    ]);
    // 작업 시작 시 excelFile, rawRows, sheetData 등은 초기화하지 않음 (상태 유지)

    const language = sheetData[0]?.language || DEFAUKLT_LANGUAGE;
    let totalEpisodesCount = 0;
    let processedEpisodesCount = 0;
    const currentResults: ProcessResult[] = [];

    try {
      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const channelName = String(row["채널명"] || "").trim();
        const rssUrl = String(row["RSS"] || "").trim();
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
            setLogs((prev) => [
              ...prev,
              {
                message: `❌ ${channelName} 프로그램 에러: 프로그램 찾기 실패`,
                type: "error",
              },
            ]);
            currentResults.push({
              program: channelName,
              episode: "-",
              status: "failed",
              reason: "프로그램 찾기 실패",
            });
            return; // 이 row는 스킵
          }

          const { data: episodes } = await supabase
            .from("episodes")
            .select("id, title, audio_file, date")
            .eq("program_id", prog.id);
          if (!episodes) throw new Error("에피소드 목록 조회 실패");

          const rssRes = await fetch(
            `/api/rss?url=${encodeURIComponent(rssUrl)}`,
          );
          const rssText = await rssRes.text();
          const { items: rssItems } = parseRss(
            rssText,
            1000,
            prog.id,
            "ko",
          ) as { items: ParsedItem[] };

          totalEpisodesCount += episodes.length;

          let episodeProcessed = 0;
          await Promise.all(
            episodes.map(async (episode, j) => {
              const epTitle = episode.title || "Unknown Title";
              const episodeIdx = j + 1;
              const episodeTotal = episodes.length;
              try {
                const epNorm = normalizeTitle(epTitle);
                const epDate = formatDate(episode.date);
                const matchedRss = rssItems.find((item) => {
                  const rssNorm = normalizeTitle(item.title);
                  const rssDate = formatDate(item.date || item.pubDate);
                  return rssNorm === epNorm || (epDate && epDate === rssDate);
                });

                if (!matchedRss) {
                  throw new Error("RSS 매칭 실패");
                }

                // 폴더 경로 최적화
                let r2Folder = buildEpisodeFolder(String(language));
                if (episode.audio_file?.startsWith("http")) {
                  try {
                    const urlPath = new URL(episode.audio_file).pathname;
                    let pathParts = urlPath.split("/").filter((p) => p);
                    pathParts.pop();
                    const lastPart = decodeURIComponent(
                      pathParts[pathParts.length - 1],
                    );
                    if (lastPart === channelName) pathParts.pop();
                    r2Folder = pathParts.join("/");
                  } catch (e) {}
                }

                const epSafeTitle = epTitle.replace(/[/\\?%*:|"<>]/g, "-");
                const m4aFilename = `${epSafeTitle}.m4a`;
                const mp3Filename = `${epSafeTitle}.mp3`;

                const convResult = await convertAll([
                  { ...matchedRss, filename: mp3Filename } as any,
                ]);
                const rawResult = convResult[mp3Filename];
                const base64 =
                  typeof rawResult === "object" && rawResult !== null
                    ? (rawResult as any).file
                    : rawResult;

                if (!base64) throw new Error("오디오 변환 실패");

                const uploadResult = await uploadAll(
                  [{ ...matchedRss, filename: m4aFilename } as any],
                  {
                    [mp3Filename]: {
                      status: "done",
                      file: base64,
                      progress: 100,
                    },
                  },
                  r2Folder,
                  channelName,
                );

                const r2Url = uploadResult.urlMap[m4aFilename];
                if (!r2Url) throw new Error("업로드 실패");

                const finalUrl = r2Url.replace(/#/g, "%23");
                const { error: updateErr } = await supabase
                  .from("episodes")
                  .update({ audio_file: finalUrl })
                  .eq("id", episode.id);

                if (updateErr) throw updateErr;

                processedEpisodesCount++;
                episodeProcessed++;
                setLogs((prev) => [
                  ...prev,
                  {
                    message: `[${programIdx}-${episodeIdx}][P ${programIdx}/${programTotal}][E ${episodeProcessed}/${episodeTotal}] ✅ [${epTitle}] 완료`,
                    type: "success",
                  },
                ]);
                currentResults.push({
                  program: channelName,
                  episode: epTitle,
                  status: "success",
                });
              } catch (err: any) {
                processedEpisodesCount++;
                episodeProcessed++;
                setLogs((prev) => [
                  ...prev,
                  {
                    message: `[${programIdx}-${episodeIdx}][P ${programIdx}/${programTotal}][E ${episodeProcessed}/${episodeTotal}] ❌ [${epTitle}] 실패: ${err.message}`,
                    type: "error",
                  },
                ]);
                currentResults.push({
                  program: channelName,
                  episode: epTitle,
                  status: "failed",
                  reason: err.message,
                });
              }
            }),
          );
        } catch (err: any) {
          setLogs((prev) => [
            ...prev,
            {
              message: `❌ ${channelName} 프로그램 에러: ${err.message}`,
              type: "error",
            },
          ]);
        }
      }
    } finally {
      setIsProcessing(false);
      setLogs((prev) => [
        ...prev,
        {
          message: `🎉 작업 종료 (성공: ${processedEpisodesCount}/${totalEpisodesCount})`,
          type: "success",
        },
      ]);
      setProcessResults(currentResults);
      // 작업 종료 후에도 excelFile, rawRows, sheetData 등은 초기화하지 않음 (상태 유지)
    }
  }, [sheetData, convertAll, uploadAll, isProcessing]);

  useEffect(() => {
    if (excelFile && selectedSheet) {
      parseSheetData(excelFile, selectedSheet, excelStartRow ?? 4, excelEndRow);
    }
  }, [excelFile, selectedSheet, excelStartRow, excelEndRow, parseSheetData]);

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
            <>
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
                            key={col}
                            className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-left"
                            style={{
                              position: "sticky",
                              top: 0,
                              background: "#f8fafc",
                            }}
                          >
                            {col}
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
                              key={col}
                              className="px-4 py-2 text-slate-800 border-r border-slate-100 group-last:border-r-0 group-hover:bg-yellow-50"
                              style={{
                                maxWidth: 180,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={String(row[col] || "")}
                            >
                              {row[col]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className={fieldClass}>
                <button
                  onClick={handleRemapAll}
                  disabled={isProcessing}
                  className={ghostButtonClass + " px-8 py-2"}
                >
                  {isProcessing ? "처리 중..." : "작업 시작"}
                </button>
              </div>
            </>
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
                        채널명
                      </th>
                      <th
                        className="px-4 py-2 font-bold text-slate-700 bg-slate-100 border-b border-slate-200 text-left"
                        style={{
                          position: "sticky",
                          top: 0,
                          background: "#f8fafc",
                        }}
                      >
                        에피소드명
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
                        </td>
                        <td className="px-4 py-2 border-r border-slate-100 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${res.status === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}
                          >
                            {res.status === "success" ? "SUCCESS" : "FAILED"}
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
        </div>
      </section>
    </>
  );
};

export default AudioRemappingPage;
