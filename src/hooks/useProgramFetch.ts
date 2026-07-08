import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { LogTone, ParsedProgram, ToastTone } from "../types";
import type { ProcessTone } from "./useProcessLog";
import { buildR2ImageUrl } from "../utils/r2";
import { parseProgramRss } from "../utils/rss";
import { buildProgramSqlText, parseProgramSqlToRows } from "../utils/sql";
import { BASE_URL } from "../constants/options";

// 이미지 URL에서 확장자 추출 (없으면 "webp")
export function extractExt(imgUrl: string): string {
  const urlName = imgUrl.split("/").pop()?.split("?")[0] ?? "";
  const candidate = urlName.split(".").pop();
  return candidate && candidate.length <= 5 ? candidate : "webp";
}

function toErrorMessage(err: unknown, fallback = "오류 발생"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    const parts = [
      e.message,
      e.details && `(${e.details})`,
      e.hint && `[${e.hint}]`,
    ]
      .filter(Boolean)
      .join(" ");
    if (parts) return parts;
  }
  return fallback;
}

type CountryCode = "KR" | "US" | "JP" | "GB" | "DE";

export function mapLanguageToCountry(languageCode: string): CountryCode {
  const normalized = languageCode.toLowerCase();
  const countryMap: Record<string, CountryCode> = {
    ko: "KR",
    en: "US",
    jp: "JP",
    uk: "GB",
    de: "DE",
  };

  const mapped = countryMap[normalized];
  if (!mapped) {
    throw new Error(
      `지원하지 않는 language입니다: ${languageCode} (가능: ko, en, jp, uk, de)`,
    );
  }

  return mapped;
}

interface UseProgramFetchOptions {
  language: string;
  imageFolder: string;
  type: string;
  categoryId: number | "";
  broadcastingId: number | "";
  addLog: (message: string, tone?: LogTone) => void;
  setProcess: (label: string, tone: ProcessTone) => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

export function useProgramFetch({
  language,
  imageFolder,
  type,
  categoryId,
  broadcastingId,
  addLog,
  setProcess,
  showToast,
}: UseProgramFetchOptions) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [imgUrl, setImgUrl] = useState("");
  const [sourceImgUrl, setSourceImgUrl] = useState("");
  const [sqlText, setSqlText] = useState("");
  const [originalSql, setOriginalSql] = useState("");
  const [original, setOriginal] = useState<ParsedProgram | null>(null);
  const [insertResult, setInsertResult] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // RSS 로드 + 파싱
  const fetchProgram = async (rssUrl: string) => {
    setError("");
    setInsertResult("");
    setProcess("RSS 요청 중", "working");
    setIsLoading(true);

    try {
      addLog("RSS 요청 중...", "action");
      const response = await fetch(
        `/api/rss?url=${encodeURIComponent(rssUrl)}`,
      );
      if (!response.ok) {
        throw new Error(`요청 실패: 상태 코드 ${response.status}.`);
      }

      const xmlText = await response.text();
      setProcess("RSS 파싱 중", "working");
      addLog("RSS 수신 완료. 파싱 중...", "info");

      const parsed = parseProgramRss(xmlText);
      const ext = extractExt(parsed.imgUrl);
      const nextImgUrl = buildR2ImageUrl(
        parsed.title,
        BASE_URL,
        imageFolder,
        ext,
        language,
      );

      setTitle(parsed.title);
      setSubtitle(parsed.subtitle);
      setSourceImgUrl(parsed.imgUrl);
      setImgUrl(nextImgUrl);
      setOriginal(parsed);

      const sql = buildProgramSqlText(
        { ...parsed, imgUrl: nextImgUrl },
        type,
        language,
        categoryId || undefined,
        broadcastingId || undefined,
      );
      setSqlText(sql);
      setOriginalSql(sql);

      addLog(`프로그램 '${parsed.title}' 파싱 완료.`, "success");
      addLog("SQL 생성 완료.", "success");
      setProcess("SQL 생성 완료", "success");
    } catch (err) {
      const message = toErrorMessage(err);
      setError(message);
      addLog(`오류: ${message}`, "error");
      setProcess("오류 발생", "error");
      resetFields();
    } finally {
      setIsLoading(false);
    }
  };

  // Supabase insert
  const insertToSupabase = async () => {
    if (!sqlText.trim()) return;
    setError("");
    setInsertResult("");
    setIsSending(true);
    setProcess("Supabase 전송 중", "working");

    try {
      const rowsToInsert = parseProgramSqlToRows(sqlText);
      addLog(
        `Supabase에 ${rowsToInsert.length}개 프로그램 전송 중...`,
        "action",
      );

      const { data, error: insertError } = await supabase
        .from("programs")
        .insert(rowsToInsert)
        .select("id");
      if (insertError) throw insertError;

      // programs insert는 이미 성공했으므로, categories 매핑 실패가
      // 전체 결과를 "실패"로 덮어쓰지 않도록 별도로 처리한다.
      try {
        const categoryRows = rowsToInsert
          .map((row, index) => {
            if (!row.category_id) return null;

            const programId = data?.[index]?.id;
            if (!programId) return null;

            const rowLanguage = row.language?.[0] ?? language;
            return {
              category_id: row.category_id,
              program_id: programId,
              language: rowLanguage.toLowerCase(),
              country: mapLanguageToCountry(rowLanguage),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null);

        if (categoryRows.length) {
          const { error: categoryInsertError } = await supabase
            .from("programs_categories")
            .insert(categoryRows);

          if (categoryInsertError) throw categoryInsertError;
        }
      } catch (categoryErr) {
        const categoryMessage = toErrorMessage(
          categoryErr,
          "카테고리 매핑 실패",
        );
        addLog(
          `⚠️ 프로그램은 추가됐지만 programs_categories 매핑에 실패했습니다: ${categoryMessage}`,
          "error",
        );
        showToast(
          `프로그램은 추가됐지만 카테고리 매핑에 실패했습니다: ${categoryMessage}`,
          "error",
        );
      }

      addLog("Supabase insert 완료.", "success");
      if (data?.length) {
        const ids = data
          .map((row) => String(row.id))
          .filter((v) => v !== "undefined" && v !== "null")
          .join(", ");
        addLog(`✨ 프로그램 추가 완료 - ${title} (ID: ${ids})`, "success");
        setInsertResult(`program_id : ${ids}`);
      }
      setProcess("Supabase 전송 완료", "success");
    } catch (err) {
      const message = toErrorMessage(err, "추가 실패");
      setError(message);
      setInsertResult("");
      addLog(`Supabase insert 실패: ${message}`, "error");
      setProcess("Supabase 전송 실패", "error");
      showToast(message, "error");
    } finally {
      setIsSending(false);
    }
  };

  // SQL 재생성 (필드 편집 후 "변경 반영")
  const rebuildSql = (nextImageFolder: string) => {
    const nextImgUrl = buildR2ImageUrl(
      title,
      BASE_URL,
      nextImageFolder,
      "webp",
      language,
    );
    setImgUrl(nextImgUrl);
    setSqlText(
      buildProgramSqlText(
        {
          title: title.trim() || "제목 없음",
          subtitle: subtitle.trim(),
          imgUrl: nextImgUrl,
        },
        type,
        language,
        categoryId || undefined,
        broadcastingId || undefined,
      ),
    );
  };

  // 원본으로 복원
  const resetToOriginal = (
    nextImageFolder: string,
    onResetSelects?: () => void,
  ) => {
    if (!original) return;
    const ext = extractExt(original.imgUrl);
    const resetImgUrl = buildR2ImageUrl(
      original.title,
      BASE_URL,
      nextImageFolder,
      ext,
    );
    setTitle(original.title);
    setSubtitle(original.subtitle);
    setSourceImgUrl(original.imgUrl);
    setImgUrl(resetImgUrl);
    setSqlText(originalSql);
    onResetSelects?.();
  };

  // 전체 초기화
  const resetFields = () => {
    setTitle("");
    setSubtitle("");
    setImgUrl("");
    setSourceImgUrl("");
    setSqlText("");
    setOriginalSql("");
    setOriginal(null);
    setError("");
    setInsertResult("");
    setIsLoading(false);
    setIsSending(false);
  };

  return {
    title,
    subtitle,
    imgUrl,
    sourceImgUrl,
    sqlText,
    originalSql,
    original,
    insertResult,
    error,
    isLoading,
    isSending,
    setTitle,
    setSubtitle,
    setImgUrl,
    setSqlText,
    setInsertResult,
    fetchProgram,
    insertToSupabase,
    rebuildSql,
    resetToOriginal,
    resetFields,
  };
}
