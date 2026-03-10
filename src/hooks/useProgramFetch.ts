import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { LogTone, ParsedProgram, ToastTone } from "../types";
import type { ProcessTone } from "./useProcessLog";
import { buildR2ImageUrl } from "../utils/r2";
import { parseProgramRss } from "../utils/rss";
import { buildProgramSqlText, parseProgramSqlToRows } from "../utils/sql";
import { BASE_URL } from "../constants/options";

// 이미지 URL에서 확장자 추출 (없으면 "webp")
function extractExt(imgUrl: string): string {
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
