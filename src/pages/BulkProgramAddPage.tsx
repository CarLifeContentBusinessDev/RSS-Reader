/* eslint-disable */
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GuidePanel } from "../components/GuidePanel";
import { LABELS } from "../constants/labels";
import {
  BASE_URL,
  buildImageFolder,
  DEFAUKLT_LANGUAGE,
  PROGRAM_BULK_GUIDE_STEPS,
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
import { useImageDownload } from "../hooks/useImageDownload";
import { mapLanguageToCountry } from "../hooks/useProgramFetch";
import type { ToastTone } from "../types";
import { supabase } from "../lib/supabaseClient";
import { buildR2ImageUrl } from "../utils/r2";
import { parseProgramRss } from "../utils/rss";

// 타입 정의
interface ExcelRow {
  [key: string]: string | number | undefined;
}

interface LogEntry {
  message: string;
  type: "info" | "success" | "error";
}

interface ProcessResult {
  title: string;
  programId?: number;
  status: "success" | "failed" | "pass";
  reason?: string;
}

interface BulkProgramAddPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

const BulkProgramAddPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: BulkProgramAddPageProps) => {
  useAuthGuard({ authUserEmail, onRequireLogin, showToast });
  const { compressToWebP, uploadImageToR2 } = useImageDownload({ showToast });

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] =
    useState<string>(DEFAUKLT_LANGUAGE);
  const [sheetData, setSheetData] = useState<ExcelRow[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  // 헤더가 위치한 행의 0-indexed 오프셋 (예: 헤더가 엑셀 1행이면 0, 3행이면 2)
  const [headerOffset, setHeaderOffset] = useState<number>(0);
  const [excelStartRow, setExcelStartRow] = useState<number | undefined>(
    undefined,
  );
  const [excelEndRow, setExcelEndRow] = useState<number | undefined>(undefined);
  const [isAllRows, setIsAllRows] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasCompletedRun, setHasCompletedRun] = useState(false);
  const [processResults, setProcessResults] = useState<ProcessResult[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 실제 팀 공유 엑셀 템플릿 헤더명 (AudioRemappingPage/에피소드 일괄 추가와 동일 시트 사용)
  const REQUIRED_COLUMNS: { key: string; label: string }[] = [
    { key: "현 데모 순위", label: "현 데모 순위" },
    { key: "program_id", label: "program_id" },
    { key: "채널명", label: "채널명" },
    { key: "제작사", label: "제작사(방송사)" },
    { key: "픽클 카테고리", label: "픽클 카테고리" },
    { key: "rss", label: "RSS" },
  ];

  // 엑셀 파일마다 헤더 행 위치가 다를 수 있어("RSS" 컬럼이 1행에 있는 경우 /
  // 기존 팀 템플릿처럼 3행에 있는 경우 모두 지원), 헤더 셀 값으로 자동 탐색한다.
  const findHeaderRowIndex = (matrix: string[][]): number => {
    const maxScan = Math.min(matrix.length, 10);
    for (let i = 0; i < maxScan; i += 1) {
      const cells = (matrix[i] || []).map((cell) =>
        String(cell ?? "")
          .trim()
          .toLowerCase(),
      );
      if (cells.includes("rss")) return i;
    }
    return 0;
  };

  const appendLog = (message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { message, type }]);
    const prefix = `[ProgramBulk][${type.toUpperCase()}]`;
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
    (
      file: File,
      sheetName: string,
      start: number,
      end: number | undefined,
      offset: number,
    ) => {
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
          range: offset,
        });
        if (rows.length === 0) return;

        const currentHeader = rows[0].map((h) => String(h).trim());
        setRawRows(rows);

        const finalEndRow = end ?? rows.length + offset;

        const dataRows = rows
          .slice(start - offset - 1, finalEndRow - offset)
          .map((row) => {
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

  const scheduleParse = useCallback(
    (
      file: File,
      sheet: string,
      start: number,
      end: number | undefined,
      offset: number,
    ) => {
      if (parseDebounceRef.current) clearTimeout(parseDebounceRef.current);
      if (end !== undefined && end < start) return;
      parseDebounceRef.current = setTimeout(() => {
        parseSheetData(file, sheet, start, end, offset);
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
      const fullMatrix = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        defval: "",
      });
      const detectedOffset = findHeaderRowIndex(fullMatrix);
      const rows = fullMatrix.slice(detectedOffset);

      if (rows.length > 0) {
        const lastRow = detectedOffset + rows.length;
        setHeaderOffset(detectedOffset);
        setExcelStartRow(detectedOffset + 2);
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
        updateRangeAutomatically(file, firstSheet);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedLanguage((prev) => detectLanguageFromSheetName(sheetName, prev));
    setIsAllRows(false);
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
    setHeaderOffset(0);
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

  const handleBulkProgramAddAll = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setHasCompletedRun(false);
    setProcessResults([]);
    const startMessage = "🚀 프로그램 일괄 추가 작업을 시작합니다.";
    setLogs([{ message: startMessage, type: "info" }]);
    console.info(`[ProgramBulk][INFO] ${startMessage}`);

    const defaultLanguage = selectedLanguage;
    const currentResults: ProcessResult[] = [];

    try {
      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const rowIdx = i + 1;
        const rowTotal = sheetData.length;
        const rowLanguage = getRowLanguage(row, defaultLanguage);
        const channelName = String(row["채널명"] || "").trim();
        const existingProgramId = String(row["program_id"] || "").trim();
        const rssUrl = String(row["rss"] || row["RSS"] || "").trim();
        const typeValue =
          String(row["type"] || row["Type"] || "podcast").trim() ||
          "podcast";
        const categoryText = String(
          row["픽클 카테고리"] || row["카테고리"] || "",
        ).trim();
        const broadcastingText = String(
          row["제작사"] || row["방송사"] || "",
        ).trim();

        try {
          if (existingProgramId) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [${channelName || rssUrl}] ⏭️ 이미 program_id(${existingProgramId})가 있어 스킵`,
              "info",
            );
            currentResults.push({
              title: channelName || rssUrl || `행 ${rowIdx}`,
              programId: Number(existingProgramId) || undefined,
              status: "pass",
            });
            continue;
          }

          if (!rssUrl) throw new Error("RSS 정보 부족");

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
          const parsed = parseProgramRss(rssText);

          // 중복 프로그램 체크 (같은 language 내 제목 정규화 일치)
          const { data: existingPrograms, error: existingErr } =
            await supabase
              .from("programs")
              .select("id, title")
              .contains("language", [rowLanguage]);
          if (existingErr) throw new Error("기존 프로그램 조회 실패");

          const normTitle = normalizeTitle(parsed.title);
          const duplicate = (existingPrograms ?? []).find(
            (p: any) => normalizeTitle(p.title) === normTitle,
          );
          if (duplicate) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [${parsed.title}] ⏭️ 이미 등록된 프로그램 (ID: ${duplicate.id}) - 스킵`,
              "info",
            );
            currentResults.push({
              title: parsed.title,
              programId: duplicate.id,
              status: "pass",
            });
            continue;
          }

          // 카테고리 텍스트 매칭
          let categoryId: number | undefined;
          if (categoryText) {
            const { data: cats } = await supabase
              .from("categories")
              .select("id, title")
              .contains("language", [rowLanguage]);
            const normCat = normalizeTitle(categoryText);
            const foundCat = (cats ?? []).find(
              (c: any) => normalizeTitle(c.title) === normCat,
            );
            if (foundCat) {
              categoryId = foundCat.id;
            } else {
              appendLog(
                `[R ${rowIdx}/${rowTotal}] [${parsed.title}] ⚠️ 카테고리 '${categoryText}' 매칭 실패 - NULL로 진행`,
                "info",
              );
            }
          }

          // 방송사 텍스트 매칭
          let broadcastingId: number | undefined;
          if (broadcastingText) {
            const { data: broads } = await supabase
              .from("broadcastings")
              .select("id, title")
              .contains("language", [rowLanguage]);
            const normBroad = normalizeTitle(broadcastingText);
            const foundBroad = (broads ?? []).find(
              (b: any) => normalizeTitle(b.title) === normBroad,
            );
            if (foundBroad) {
              broadcastingId = foundBroad.id;
            } else {
              appendLog(
                `[R ${rowIdx}/${rowTotal}] [${parsed.title}] ⚠️ 방송사 '${broadcastingText}' 매칭 실패 - NULL로 진행`,
                "info",
              );
            }
          }

          // 이미지 다운로드 → webp 압축 → R2 업로드
          const imageFolder = buildImageFolder(rowLanguage);
          let finalImgUrl = "";
          if (parsed.imgUrl) {
            try {
              const downloadRes = await fetch(
                `/api/download?url=${encodeURIComponent(parsed.imgUrl)}`,
              );
              if (!downloadRes.ok) {
                throw new Error(`이미지 다운로드 실패 (${downloadRes.status})`);
              }
              const blob = await downloadRes.blob();
              const { blob: compressed } = await compressToWebP(blob);
              const uploadResult = await uploadImageToR2(
                compressed,
                imageFolder,
                `${parsed.title}.webp`,
              );
              if (!uploadResult) throw new Error("이미지 업로드 실패");
              finalImgUrl = buildR2ImageUrl(
                parsed.title,
                BASE_URL,
                imageFolder,
                "webp",
                rowLanguage,
              );
            } catch (imgErr: any) {
              appendLog(
                `[R ${rowIdx}/${rowTotal}] [${parsed.title}] ⚠️ 이미지 처리 실패: ${imgErr?.message || imgErr} - img_url 없이 진행`,
                "info",
              );
            }
          }

          const { data: inserted, error: insertErr } = await supabase
            .from("programs")
            .insert({
              title: parsed.title,
              subtitle: broadcastingText || parsed.subtitle,
              img_url: finalImgUrl,
              type: typeValue,
              language: [rowLanguage],
              category_id: categoryId ?? null,
              broadcasting_id: broadcastingId ?? null,
            })
            .select("id")
            .single();

          if (insertErr || !inserted) {
            throw new Error(insertErr?.message || "프로그램 추가 실패");
          }

          if (categoryId) {
            try {
              const country = mapLanguageToCountry(rowLanguage);
              const { error: catInsertErr } = await supabase
                .from("programs_categories")
                .insert({
                  category_id: categoryId,
                  program_id: inserted.id,
                  language: rowLanguage.toLowerCase(),
                  country,
                });
              if (catInsertErr) throw catInsertErr;
            } catch (catErr: any) {
              appendLog(
                `[R ${rowIdx}/${rowTotal}] [채널(${inserted.id}): ${parsed.title}] ⚠️ programs_categories 추가 실패: ${catErr?.message || catErr}`,
                "error",
              );
            }
          }

          appendLog(
            `[R ${rowIdx}/${rowTotal}] [채널(${inserted.id}): ${parsed.title}] ✅ 추가 완료`,
            "success",
          );
          currentResults.push({
            title: parsed.title,
            programId: inserted.id,
            status: "success",
          });
        } catch (err: any) {
          const failReason = err?.message || "오류 발생";
          appendLog(
            `[R ${rowIdx}/${rowTotal}] [RSS: ${rssUrl || "-"}] ❌ 실패: ${failReason}`,
            "error",
          );
          currentResults.push({
            title: rssUrl || `행 ${rowIdx}`,
            programId: undefined,
            status: "failed",
            reason: failReason,
          });
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
          ? `⚠️ 작업 종료 (성공: ${successCount}건, 스킵: ${passCount}건, 실패: ${failedCount}건, 전체: ${totalCount}건)`
          : `🎉 작업 종료 (성공: ${successCount}건, 스킵: ${passCount}건, 전체: ${totalCount}건)`,
        failedCount > 0 ? "error" : "success",
      );
      setProcessResults(currentResults);
    }
  }, [sheetData, selectedLanguage, isProcessing, compressToWebP, uploadImageToR2]);

  const isRangeInvalid =
    excelEndRow !== undefined &&
    excelEndRow < (excelStartRow ?? headerOffset + 2);

  useEffect(() => {
    if (excelFile && selectedSheet) {
      const startRow = excelStartRow ?? headerOffset + 2;
      scheduleParse(excelFile, selectedSheet, startRow, excelEndRow, headerOffset);
    }
  }, [
    excelFile,
    selectedSheet,
    excelStartRow,
    excelEndRow,
    headerOffset,
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
            {LABELS.PAGE.PROGRAM_BULK.TITLE}
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            {LABELS.PAGE.PROGRAM_BULK.DESCRIPTION}
          </p>
        </div>
        <GuidePanel guide_steps={PROGRAM_BULK_GUIDE_STEPS} />
      </header>

      <section className={panelClass}>
        <div className="flex flex-col gap-6">
          {/* 엑셀 파일 업로드 섹션 */}
          <div className={fieldClass}>
            <span className={fieldLabelClass}>엑셀 파일 업로드</span>
            <div className="flex items-center gap-3">
              <label
                htmlFor="program-bulk-excel-upload"
                className={`${ghostButtonClass} cursor-pointer px-4 py-2 text-sm inline-block`}
              >
                파일 선택
              </label>
              <input
                id="program-bulk-excel-upload"
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
                        setExcelStartRow(headerOffset + 2);
                        setExcelEndRow(headerOffset + rawRows.length);
                      } else {
                        setIsAllRows(false);
                      }
                    }}
                    className="mr-2"
                    id="programBulkAllRowsCheckbox"
                  />
                  <label
                    htmlFor="programBulkAllRowsCheckbox"
                    className={fieldLabelClass}
                  >
                    전체 (모든 행)
                  </label>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <input
                  type="number"
                  min={headerOffset + 2}
                  value={excelStartRow ?? ""}
                  onChange={(e) => {
                    const newStart = e.target.value
                      ? Number(e.target.value)
                      : undefined;
                    setExcelStartRow(newStart);
                    setIsAllRows(false);
                  }}
                  className={inputClass + " w-24"}
                  placeholder={String(headerOffset + 2)}
                  disabled={isAllRows}
                />
                <span>~</span>
                <input
                  type="number"
                  max={headerOffset + rawRows.length}
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
                    rawRows.length > 0
                      ? String(headerOffset + rawRows.length)
                      : "끝행"
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
                              maxWidth: 220,
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
              {isRangeInvalid && (
                <p className="mb-2 text-sm text-rose-500">
                  끝 행이 시작 행보다 작습니다. 범위를 올바르게 입력해 주세요.
                </p>
              )}
              <button
                onClick={handleBulkProgramAddAll}
                disabled={
                  isProcessing || isRangeInvalid || sheetData.length === 0
                }
                className={ghostButtonClass + " px-8 py-2"}
              >
                {isProcessing ? "처리 중..." : "일괄 추가 시작"}
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

          {/* 작업 결과 요약 테이블 */}
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
                        프로그램명(ID)
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
                        <td
                          className="px-4 py-2 text-slate-800 border-r border-slate-100 font-medium"
                          style={{
                            maxWidth: 300,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={res.title}
                        >
                          {res.title}
                          {typeof res.programId === "number"
                            ? ` (${res.programId})`
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

export default BulkProgramAddPage;
