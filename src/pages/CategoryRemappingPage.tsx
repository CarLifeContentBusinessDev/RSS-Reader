/* eslint-disable */
import React, { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { GuidePanel } from "../components/GuidePanel";
import { LABELS } from "../constants/labels";
import {
  CATEGORY_REMAPPING_GUIDE_STEPS,
  DEFAUKLT_LANGUAGE,
} from "../constants/options";
import {
  COUNTRY_OPTIONS,
  detectCountryFromSheetName,
  detectLanguageFromSheetName,
  LANGUAGE_OPTIONS,
  type CountryCode,
} from "../constants/language";
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
  categoryId?: number;
  status: "inserted" | "updated" | "skipped" | "failed";
  reason?: string;
}

// "글로벌" 카테고리 ID - 국가별 시트 매핑과 무관하게 의도적으로 지정된 값이라
// 기존에 이 값으로 매핑된 행은 시트 내용이 달라도 덮어쓰지 않고 보호한다.
const GLOBAL_CATEGORY_ID = 65;

// 팀 공유 엑셀 템플릿은 항상 헤더가 3행(0-indexed 2)에 고정되어 있다
// (BulkEpisodeAddPage/AudioRemappingPage와 동일). 자동 탐지 대신 고정값을
// 쓰면, 업로드 직후 상태가 아직 갱신되기 전에 잘못된 위치로 먼저 파싱되는
// 타이밍 문제 없이 항상 올바른 헤더 위치를 즉시 사용할 수 있다.
const HEADER_ROW_OFFSET = 2;

interface CategoryRemappingPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

const CategoryRemappingPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: CategoryRemappingPageProps) => {
  useAuthGuard({ authUserEmail, onRequireLogin, showToast });

  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] =
    useState<string>(DEFAUKLT_LANGUAGE);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>("KR");
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
  const [processResults, setProcessResults] = useState<ProcessResult[]>([]);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 실제 팀 공유 엑셀 템플릿 헤더명 (프로그램 일괄 추가와 동일 시트 재사용)
  const REQUIRED_COLUMNS: { key: string; label: string }[] = [
    { key: "program_id", label: "program_id" },
    { key: "채널명", label: "채널명" },
    { key: "픽클 카테고리 id", label: "픽클 카테고리 ID" },
  ];

  const appendLog = (message: string, type: LogEntry["type"] = "info") => {
    setLogs((prev) => [...prev, { message, type }]);
    const prefix = `[CategoryRemap][${type.toUpperCase()}]`;
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

  // 일부 xlsx 파일은 워크시트의 사용된 범위(!ref)가 실제 데이터보다 짧게
  // 기록되어 있어, sheet_to_json이 그 범위를 넘는 행을 조용히 누락시킨다.
  // 실제 셀 주소를 스캔해서 !ref를 다시 계산해 이 문제를 우회한다.
  const fixWorksheetRange = (ws: XLSX.WorkSheet) => {
    let maxRow = 0;
    let maxCol = 0;
    let found = false;

    for (const key in ws) {
      if (key.startsWith("!")) continue;
      if (!/^[A-Z]+[0-9]+$/.test(key)) continue;
      const decoded = XLSX.utils.decode_cell(key);
      found = true;
      if (decoded.r > maxRow) maxRow = decoded.r;
      if (decoded.c > maxCol) maxCol = decoded.c;
    }
    if (!found) return;

    const existing = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (existing && existing.e.r >= maxRow && existing.e.c >= maxCol) return;

    ws["!ref"] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRow, c: maxCol },
    });
  };

  // 병합된 셀은 왼쪽 위(anchor) 셀에만 실제 값이 저장되고, 병합 범위의 나머지
  // 행/열은 화면에는 값이 이어져 보이지만 실제로는 빈 셀이다. sheet_to_json은
  // 이 빈 셀을 그대로 읽으므로, 병합 범위 전체에 anchor 값을 복사해 채워준다.
  const fillMergedCells = (ws: XLSX.WorkSheet) => {
    const merges = ws["!merges"];
    if (!merges || merges.length === 0) return;

    for (const merge of merges) {
      const anchorAddr = XLSX.utils.encode_cell(merge.s);
      const anchorCell = ws[anchorAddr];
      if (!anchorCell) continue;

      for (let r = merge.s.r; r <= merge.e.r; r += 1) {
        for (let c = merge.s.c; c <= merge.e.c; c += 1) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (addr === anchorAddr) continue;
          ws[addr] = { ...anchorCell };
        }
      }
    }
  };

  const parseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseSheetData = useCallback(
    (file: File, sheetName: string, start: number, end: number | undefined) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = evt.target?.result;
        if (!data) return;
        const workbook = XLSX.read(data, { type: "array" });
        const ws = workbook.Sheets[sheetName];
        if (!ws) return;
        fixWorksheetRange(ws);
        fillMergedCells(ws);
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          defval: "",
          range: HEADER_ROW_OFFSET,
        });
        if (rows.length === 0) return;

        const currentHeader = rows[0].map((h) => String(h).trim().toLowerCase());
        setRawRows(rows);

        const finalEndRow = end ?? rows.length + HEADER_ROW_OFFSET;

        const dataRows = rows
          .slice(start - HEADER_ROW_OFFSET - 1, finalEndRow - HEADER_ROW_OFFSET)
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
    (file: File, sheet: string, start: number, end: number | undefined) => {
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
      fixWorksheetRange(ws);
      fillMergedCells(ws);
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
        header: 1,
        defval: "",
        range: HEADER_ROW_OFFSET,
      });

      if (rows.length > 0) {
        const lastRow = rows.length + HEADER_ROW_OFFSET;
        setExcelStartRow(HEADER_ROW_OFFSET + 2);
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
        setSelectedCountry((prev) =>
          detectCountryFromSheetName(firstSheet, prev),
        );
        updateRangeAutomatically(file, firstSheet);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    setSelectedLanguage((prev) => detectLanguageFromSheetName(sheetName, prev));
    setSelectedCountry((prev) => detectCountryFromSheetName(sheetName, prev));
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

  // Supabase/PostgREST는 명시적 range 없이 select하면 기본 최대 행 수(보통 1000)로
  // 잘려서 반환된다. programs 테이블이 그보다 크면 일부 program_id가 누락되어
  // "프로그램 찾기 실패"가 발생하므로, 끝까지 페이지네이션해서 전부 가져온다.
  const fetchAllPrograms = async (): Promise<
    { id: number; title: string }[]
  > => {
    const PAGE_SIZE = 1000;
    const all: { id: number; title: string }[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("programs")
        .select("id, title")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;

      all.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return all;
  };

  const handleCategoryRemapAll = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setHasCompletedRun(false);
    setProcessResults([]);
    const startMessage = "🚀 카테고리 매핑 확인/수정 작업을 시작합니다.";
    setLogs([{ message: startMessage, type: "info" }]);
    console.info(`[CategoryRemap][INFO] ${startMessage}`);

    const defaultLanguage = selectedLanguage;
    const currentResults: ProcessResult[] = [];

    try {
      const allPrograms = await fetchAllPrograms();

      for (let i = 0; i < sheetData.length; i++) {
        const row = sheetData[i];
        const rowIdx = i + 1;
        const rowTotal = sheetData.length;
        const rowLanguage = getRowLanguage(row, defaultLanguage);
        const channelName = String(row["채널명"] || "").trim();
        const programIdCell = String(row["program_id"] || "").trim();
        const categoryIdRaw = String(row["픽클 카테고리 id"] || "").trim();
        const rowLabel = channelName || programIdCell || `행 ${rowIdx}`;

        try {
          // 1. 프로그램 매칭 - program_id 우선, 실패 시 채널명(정규화) 매칭
          let prog = programIdCell
            ? allPrograms.find((p) => String(p.id) === programIdCell)
            : undefined;
          if (!prog && channelName) {
            const normChannel = normalizeTitle(channelName);
            prog = allPrograms.find(
              (p) => normalizeTitle(p.title) === normChannel,
            );
          }
          if (!prog) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [${rowLabel}] ❌ 프로그램 찾기 실패 (program_id/채널명 불일치)`,
              "error",
            );
            currentResults.push({
              title: rowLabel,
              status: "failed",
              reason: "프로그램 찾기 실패",
            });
            continue;
          }

          // 2. 카테고리 ID 파싱 (이 페이지는 텍스트 폴백 없이 ID 컬럼이 유일한 소스)
          const parsedCategoryId = categoryIdRaw ? Number(categoryIdRaw) : NaN;
          if (
            !categoryIdRaw ||
            !Number.isFinite(parsedCategoryId) ||
            parsedCategoryId <= 0
          ) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [채널(${prog.id}): ${rowLabel}] ❌ 픽클 카테고리 ID 누락/유효하지 않음`,
              "error",
            );
            currentResults.push({
              title: channelName || prog.title,
              programId: prog.id,
              status: "failed",
              reason: "카테고리 ID 누락/유효하지않음",
            });
            continue;
          }

          // 글로벌(65)은 이 도구가 아니라 별도로 관리되는 값이라, 시트에 65가
          // 적혀 있어도 이 페이지에서는 추가/수정 어느 쪽도 하지 않는다.
          if (parsedCategoryId === GLOBAL_CATEGORY_ID) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [채널(${prog.id}): ${rowLabel}] ⏭️ 글로벌 카테고리(${GLOBAL_CATEGORY_ID})는 별도 관리 대상이라 스킵`,
              "info",
            );
            currentResults.push({
              title: channelName || prog.title,
              programId: prog.id,
              categoryId: parsedCategoryId,
              status: "skipped",
            });
            continue;
          }

          // 3. 기존 매핑 조회 - (program_id, country) 기준
          const { data: existingRows, error: selErr } = await supabase
            .from("programs_categories")
            .select("id, category_id")
            .eq("program_id", prog.id)
            .eq("country", selectedCountry)
            .order("id");
          if (selErr) throw selErr;

          const rows = existingRows ?? [];

          // 시트가 요구하는 카테고리가 이미 매핑되어 있으면 (글로벌 포함) 할 일 없음
          const alreadyMapped = rows.find(
            (r) => r.category_id === parsedCategoryId,
          );
          if (alreadyMapped) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [채널(${prog.id}): ${rowLabel}] ⏭️ 이미 일치 (category_id: ${parsedCategoryId}) - 스킵`,
              "info",
            );
            currentResults.push({
              title: channelName || prog.title,
              programId: prog.id,
              categoryId: parsedCategoryId,
              status: "skipped",
            });
            continue;
          }

          // 글로벌(65) 매핑은 그대로 두고, 그 외의(국가별) 매핑만 갱신 대상으로 본다.
          const globalRow = rows.find(
            (r) => r.category_id === GLOBAL_CATEGORY_ID,
          );
          const otherRows = rows.filter(
            (r) => r.category_id !== GLOBAL_CATEGORY_ID,
          );

          if (otherRows.length === 0) {
            // 국가별 매핑이 없음 (글로벌만 있거나 매핑이 아예 없음) - 시트 기준 카테고리를 추가로 삽입
            const { error: insertErr } = await supabase
              .from("programs_categories")
              .insert({
                category_id: parsedCategoryId,
                program_id: prog.id,
                language: rowLanguage.toLowerCase(),
                country: selectedCountry,
              });
            if (insertErr) throw insertErr;

            appendLog(
              `[R ${rowIdx}/${rowTotal}] [채널(${prog.id}): ${rowLabel}] ✅ 신규 매핑 추가 (category_id: ${parsedCategoryId})${globalRow ? ` - 글로벌(${GLOBAL_CATEGORY_ID})은 유지` : ""}`,
              "success",
            );
            currentResults.push({
              title: channelName || prog.title,
              programId: prog.id,
              categoryId: parsedCategoryId,
              status: "inserted",
            });
            continue;
          }

          if (otherRows.length > 1) {
            appendLog(
              `[R ${rowIdx}/${rowTotal}] [채널(${prog.id}): ${rowLabel}] ⚠️ (program_id, country) 국가별 매핑 중복 ${otherRows.length}건 발견 - id가 가장 작은 행만 처리`,
              "info",
            );
          }

          const target = otherRows[0];
          const { data: updatedRows, error: updateErr } = await supabase
            .from("programs_categories")
            .update({
              category_id: parsedCategoryId,
              language: rowLanguage.toLowerCase(),
            })
            .eq("id", target.id)
            .select("id");
          if (updateErr) throw updateErr;
          // Postgres UPDATE는 WHERE/RLS로 대상 행이 0건이어도 에러 없이 성공 응답을 준다.
          // .select()로 실제 반영된 행을 돌려받아 확인하지 않으면 "성공"으로 오판된다.
          if (!updatedRows || updatedRows.length === 0) {
            throw new Error(
              "업데이트가 반영되지 않음 (RLS 정책 등 권한 문제로 추정)",
            );
          }

          appendLog(
            `[R ${rowIdx}/${rowTotal}] [채널(${prog.id}): ${rowLabel}] ✅ 카테고리 변경 (${target.category_id} → ${parsedCategoryId})`,
            "success",
          );
          currentResults.push({
            title: channelName || prog.title,
            programId: prog.id,
            categoryId: parsedCategoryId,
            status: "updated",
          });
        } catch (err: any) {
          const failReason = err?.message || "오류 발생";
          appendLog(
            `[R ${rowIdx}/${rowTotal}] [${rowLabel}] ❌ 실패: ${failReason}`,
            "error",
          );
          currentResults.push({
            title: rowLabel,
            status: "failed",
            reason: failReason,
          });
        }
      }
    } finally {
      setIsProcessing(false);
      setHasCompletedRun(true);
      const insertedCount = currentResults.filter(
        (result) => result.status === "inserted",
      ).length;
      const updatedCount = currentResults.filter(
        (result) => result.status === "updated",
      ).length;
      const skippedCount = currentResults.filter(
        (result) => result.status === "skipped",
      ).length;
      const failedCount = currentResults.filter(
        (result) => result.status === "failed",
      ).length;
      const totalCount = currentResults.length;
      appendLog(
        failedCount > 0
          ? `⚠️ 작업 종료 (추가: ${insertedCount}건, 수정: ${updatedCount}건, 스킵: ${skippedCount}건, 실패: ${failedCount}건, 전체: ${totalCount}건)`
          : `🎉 작업 종료 (추가: ${insertedCount}건, 수정: ${updatedCount}건, 스킵: ${skippedCount}건, 전체: ${totalCount}건)`,
        failedCount > 0 ? "error" : "success",
      );
      setProcessResults(currentResults);
    }
  }, [sheetData, selectedLanguage, selectedCountry, isProcessing]);

  const isRangeInvalid =
    excelEndRow !== undefined &&
    excelEndRow < (excelStartRow ?? HEADER_ROW_OFFSET + 2);

  useEffect(() => {
    if (excelFile && selectedSheet) {
      const startRow = excelStartRow ?? HEADER_ROW_OFFSET + 2;
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
            {LABELS.PAGE.CATEGORY_REMAPPING.TITLE}
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            {LABELS.PAGE.CATEGORY_REMAPPING.DESCRIPTION}
          </p>
        </div>
        <GuidePanel guide_steps={CATEGORY_REMAPPING_GUIDE_STEPS} />
      </header>

      <section className={panelClass}>
        <div className="flex flex-col gap-6">
          {/* 엑셀 파일 업로드 섹션 */}
          <div className={fieldClass}>
            <span className={fieldLabelClass}>엑셀 파일 업로드</span>
            <div className="flex items-center gap-3">
              <label
                htmlFor="category-remap-excel-upload"
                className={`${ghostButtonClass} cursor-pointer px-4 py-2 text-sm inline-block`}
              >
                파일 선택
              </label>
              <input
                id="category-remap-excel-upload"
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

          {/* 시트 선택 및 국가/언어 설정 */}
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
                <span className={fieldLabelClass}>Country</span>
                <select
                  value={selectedCountry}
                  onChange={(e) =>
                    setSelectedCountry(e.target.value as CountryCode)
                  }
                  className={inputClass}
                >
                  {COUNTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

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
                        setExcelStartRow(HEADER_ROW_OFFSET + 2);
                        setExcelEndRow(HEADER_ROW_OFFSET + rawRows.length);
                      } else {
                        setIsAllRows(false);
                      }
                    }}
                    className="mr-2"
                    id="categoryRemapAllRowsCheckbox"
                  />
                  <label
                    htmlFor="categoryRemapAllRowsCheckbox"
                    className={fieldLabelClass}
                  >
                    전체 (모든 행)
                  </label>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <input
                  type="number"
                  min={HEADER_ROW_OFFSET + 2}
                  value={excelStartRow ?? ""}
                  onChange={(e) => {
                    const newStart = e.target.value
                      ? Number(e.target.value)
                      : undefined;
                    setExcelStartRow(newStart);
                    setIsAllRows(false);
                  }}
                  className={inputClass + " w-24"}
                  placeholder={String(HEADER_ROW_OFFSET + 2)}
                  disabled={isAllRows}
                />
                <span>~</span>
                <input
                  type="number"
                  max={HEADER_ROW_OFFSET + rawRows.length}
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
                      ? String(HEADER_ROW_OFFSET + rawRows.length)
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
                대상 매핑 미리보기 (상위 10행)
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
                onClick={handleCategoryRemapAll}
                disabled={
                  isProcessing || isRangeInvalid || sheetData.length === 0
                }
                className={ghostButtonClass + " px-8 py-2"}
              >
                {isProcessing ? "처리 중..." : "매핑 확인/수정 시작"}
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
                          width: "110px",
                        }}
                      >
                        카테고리 ID
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
                        <td className="px-4 py-2 border-r border-slate-100 text-center text-slate-600">
                          {typeof res.categoryId === "number"
                            ? res.categoryId
                            : "-"}
                        </td>
                        <td className="px-4 py-2 border-r border-slate-100 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              res.status === "inserted"
                                ? "bg-emerald-100 text-emerald-700"
                                : res.status === "updated"
                                  ? "bg-sky-100 text-sky-700"
                                  : res.status === "skipped"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-rose-100 text-rose-700"
                            }`}
                          >
                            {res.status === "inserted"
                              ? "INSERTED"
                              : res.status === "updated"
                                ? "UPDATED"
                                : res.status === "skipped"
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

export default CategoryRemappingPage;
