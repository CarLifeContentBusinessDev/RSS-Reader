/* eslint-disable */
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GuidePanel } from "../components/GuidePanel";
import { LABELS } from "../constants/labels";
import { AUDIO_REMAPPING_GUIDE_STEPS } from "../constants/options";
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  panelClass,
} from "../constants/style";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { buildEpisodeFolder, DEFAUKLT_LANGUAGE } from "../constants/options";
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

interface ParsedItem {
  title: string;
  link?: string;
  date?: string;
  pubDate?: string;
  audioUrl?: string;
  [key: string]: any;
}

interface AudioRemappingProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  status: string;
  setStatus: (value: string) => void;
}

const AudioRemappingPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: AudioRemappingProps) => {
  useAuthGuard({ authUserEmail, onRequireLogin, showToast });

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [sheetData, setSheetData] = useState<ExcelRow[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [header, setHeader] = useState<string[]>([]);
  const [excelStartRow, setExcelStartRow] = useState(4);
  const [excelEndRow, setExcelEndRow] = useState(4);
  const [logs, setLogs] = useState<LogEntry[]>([]);

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
    "에피소드 수",
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
        setHeader(currentHeader);

        const finalEndRow = end ?? rows.length + 2;
        if (!end) setExcelEndRow(finalEndRow);

        const dataRows = rows.slice(start - 3, finalEndRow - 2).map((row) => {
          const obj: ExcelRow = {};
          currentHeader.forEach((h, i) => {
            if (h) obj[h] = row[i];
          });
          return obj;
        });
        setSheetData(dataRows);
      };
      reader.readAsArrayBuffer(file);
    },
    [],
  );

  const handleRemapAll = useCallback(async () => {
    setLogs([
      {
        message: "🚀 자동 리매핑 및 경로 최적화 작업을 시작합니다.",
        type: "info",
      },
    ]);

    // 언어 추출: sheetData에 language 필드가 있으면 사용, 없으면 기본값
    const language = sheetData[0]?.language || DEFAUKLT_LANGUAGE;

    for (let i = 0; i < sheetData.length; i++) {
      const row = sheetData[i];
      const prefix = `[${i + 1}/${sheetData.length}]`;
      const channelName = String(row["채널명"] || "").trim();
      const rssUrl = String(row["RSS"] || "").trim();

      try {
        if (!channelName || !rssUrl) throw new Error("데이터 부족");

        const { data: prog } = await supabase
          .from("programs")
          .select("id")
          .eq("title", channelName)
          .maybeSingle();
        if (!prog) throw new Error(`${channelName} 프로그램 찾기 실패`);

        const { data: episodes } = await supabase
          .from("episodes")
          .select("id, title, audio_file, date")
          .eq("program_id", prog.id);
        if (!episodes) throw new Error("에피소드 목록 조회 실패");

        const rssRes = await fetch(
          `/api/rss?url=${encodeURIComponent(rssUrl)}`,
        );
        const rssText = await rssRes.text();
        const { items: rssItems } = parseRss(rssText, 1000, prog.id, "ko") as {
          items: ParsedItem[];
        };

        for (const episode of episodes) {
          const epNorm = normalizeTitle(episode.title || "");
          const epDate = formatDate(episode.date);
          const matchedRss = rssItems.find((item) => {
            const rssNorm = normalizeTitle(item.title);
            const rssDate = formatDate(item.date || item.pubDate);
            return rssNorm === epNorm || (epDate && epDate === rssDate);
          });

          if (!matchedRss) {
            setLogs((prev) => [
              ...prev,
              {
                message: `${prefix} [${episode.title}] 매칭 실패`,
                type: "error",
              },
            ]);
            continue;
          }

          // 🌟 1. 경로 자동 추출 및 중복 방지 (Base Path: jp_episodes-audio/m4a 등)
          let r2Folder = buildEpisodeFolder(String(language));
          if (episode.audio_file && episode.audio_file.startsWith("http")) {
            try {
              const urlPath = new URL(episode.audio_file).pathname;
              let pathParts = urlPath.split("/").filter((p) => p);
              pathParts.pop(); // 파일명 제거

              // 마지막 부분이 채널명과 같으면 제거 (uploadAll에서 다시 붙임)
              const lastPart = decodeURIComponent(
                pathParts[pathParts.length - 1],
              );
              if (lastPart === channelName) {
                pathParts.pop();
              }
              r2Folder = pathParts.join("/");
            } catch (e) {}
          }

          const epSafeTitle = (episode.title || "untitled").replace(
            /[/\\?%*:|"<>]/g,
            "-",
          );
          const m4aFilename = `${epSafeTitle}.m4a`;
          const mp3Filename = `${epSafeTitle}.mp3`;

          setLogs((prev) => [
            ...prev,
            {
              message: `${prefix} [${episode.title}] 변환/업로드 중...`,
              type: "info",
            },
          ]);

          // 2. 변환 실행
          const convResult = await convertAll([
            { ...matchedRss, filename: mp3Filename } as any,
          ]);
          const rawResult = convResult[mp3Filename];
          const base64 =
            typeof rawResult === "object" && rawResult !== null
              ? (rawResult as any).file
              : rawResult;

          if (!base64) throw new Error("변환 실패");

          // 3. 업로드 실행
          const uploadResult = await uploadAll(
            [{ ...matchedRss, filename: m4aFilename } as any],
            { [mp3Filename]: { status: "done", file: base64, progress: 100 } },
            r2Folder,
            channelName,
          );

          let r2Url = uploadResult.urlMap[m4aFilename];

          if (!r2Url) throw new Error("업로드 실패");

          // 🌟 4. R2 업로드 후 URL에서 #을 %23으로 치환 (r2에서 접근 가능한 형태)
          const finalUrl = r2Url.replace(/#/g, "%23");

          // 5. DB 업데이트
          const { error: updateErr } = await supabase
            .from("episodes")
            .update({ audio_file: finalUrl })
            .eq("id", episode.id);
          if (updateErr) throw updateErr;

          setLogs((prev) => [
            ...prev,
            {
              message: `${prefix} ✅ [${episode.title}] 완료`,
              type: "success",
            },
          ]);
        }
      } catch (err: any) {
        setLogs((prev) => [
          ...prev,
          { message: `${prefix} ❌ 에러: ${err.message}`, type: "error" },
        ]);
      }
    }
    setLogs((prev) => [
      ...prev,
      { message: "🎉 전체 작업 완료", type: "success" },
    ]);
  }, [sheetData, convertAll, uploadAll]);

  const handleExcelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setExcelFile(file);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const workbook = XLSX.read(evt.target?.result, { type: "array" });
      setSheetNames(workbook.SheetNames);
      if (workbook.SheetNames.length > 0)
        setSelectedSheet(workbook.SheetNames[0]);
    };
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    if (excelFile && selectedSheet)
      parseSheetData(excelFile, selectedSheet, excelStartRow, excelEndRow);
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
          <div className={fieldClass}>
            <span className={fieldLabelClass}>엑셀 파일 업로드</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelChange}
              className={inputClass}
            />
          </div>

          {sheetNames.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>시트 선택</span>
              <select
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(e.target.value)}
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
              <span className={fieldLabelClass}>
                적용 범위 (엑셀 {excelStartRow}~{excelEndRow}행)
              </span>
              <div className="flex gap-4 items-center">
                <input
                  type="number"
                  min={4}
                  value={excelStartRow}
                  onChange={(e) => setExcelStartRow(Number(e.target.value))}
                  className={inputClass + " w-24"}
                />
                <span>~</span>
                <input
                  type="number"
                  max={rawRows.length + 2}
                  value={excelEndRow}
                  onChange={(e) => setExcelEndRow(Number(e.target.value))}
                  className={inputClass + " w-24"}
                />
              </div>
            </div>
          )}

          {sheetData.length > 0 && (
            <div className={fieldClass}>
              <span className={fieldLabelClass}>
                매핑 데이터 미리보기 (상위 10행)
              </span>
              <div className="overflow-x-auto border rounded bg-white text-xs">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      {REQUIRED_COLUMNS.map((col) => (
                        <th key={col} className="px-3 py-2 text-left font-bold">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheetData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 border-b">
                        {REQUIRED_COLUMNS.map((col) => (
                          <td key={col} className="px-3 py-2 text-ink-base">
                            {row[col] || "비어 있음"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

          <div className="flex justify-end mt-4">
            <button
              className={ghostButtonClass + " px-8 py-2"}
              onClick={handleRemapAll}
              disabled={sheetData.length === 0}
            >
              작업 시작
            </button>
          </div>
        </div>
      </section>
    </>
  );
};

export default AudioRemappingPage;
