import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { ParsedItem, ToastTone, LogTone } from "../types";
import { buildItemsWithChannel } from "../utils/r2";
import { parseRss } from "../utils/rss";
import { buildSqlText, parseSqlToRows } from "../utils/sql";
import type { ProcessTone } from "./useProcessLog";

interface UseEpisodeFetchOptions {
  language: string;
  r2Folder: string;
  addLog: (message: string, tone?: LogTone) => void;
  setProcess: (label: string, tone: ProcessTone) => void;
  showToast: (message: string, tone?: ToastTone) => void;
  setStatus: (value: string) => void;
}

export function useEpisodeFetch({
  language,
  r2Folder,
  addLog,
  setProcess,
  setStatus,
}: UseEpisodeFetchOptions) {
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [sqlText, setSqlText] = useState("");
  const [originalSqlText, setOriginalSqlText] = useState("");
  const [originalItems, setOriginalItems] = useState<ParsedItem[]>([]);
  const [channelTitle, setChannelTitle] = useState("");
  const [channelOverride, setChannelOverride] = useState("");
  const [originalChannelTitle, setOriginalChannelTitle] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [insertResult, setInsertResult] = useState("");

  const formatInsertError = (insertError: unknown) => {
    if (!insertError || typeof insertError !== "object") {
      return "원인을 확인할 수 없는 전송 실패입니다.";
    }

    const err = insertError as {
      status?: number;
      code?: string;
      message?: string;
      details?: string;
      hint?: string;
    };

    const parts: string[] = [];

    if (err.status === 409) {
      parts.push("이미 등록된 에피소드와 중복되어 추가에 실패했습니다.");
    }
    if (err.code === "23503") {
      parts.push(
        "선택한 program_id가 programs 테이블에 없어 추가에 실패했습니다.",
      );
    }

    if (err.code) {
      parts.push(`코드: ${err.code}`);
    }
    if (err.message) {
      parts.push(`메시지: ${err.message}`);
    }
    if (err.details) {
      parts.push(`상세: ${err.details}`);
    }
    if (err.hint) {
      parts.push(`힌트: ${err.hint}`);
    }

    return parts.join(" ") || "Supabase 전송 실패(상세 사유 없음).";
  };

  /** RSS 로드 + 파싱 + SQL 생성 */
  const fetchEpisodes = async (
    rssUrl: string,
    programId: string,
    limit: string,
  ): Promise<ParsedItem[] | null> => {
    setError("");
    setStatus("");
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

      const limitNumber = Math.max(1, Number(limit) || 1);
      const trimmedProgramId = programId.trim();
      const parsedProgramId = trimmedProgramId
        ? Number(trimmedProgramId)
        : null;
      const programNumber =
        parsedProgramId !== null && Number.isFinite(parsedProgramId)
          ? parsedProgramId
          : null;
      const parsed = parseRss(
        xmlText,
        limitNumber,
        programNumber,
        language,
        r2Folder,
      );

      setChannelTitle(parsed.channelTitle);
      setChannelOverride(parsed.channelTitle);
      setItems(parsed.items);
      setSqlText(parsed.sqlText);
      setOriginalSqlText(parsed.sqlText);
      setOriginalItems(parsed.items);
      setOriginalChannelTitle(parsed.channelTitle);

      addLog(
        `'${parsed.channelTitle}' ${parsed.items.length}개 항목 파싱 완료.`,
        "success",
      );
      addLog("SQL 생성 완료.", "success");
      setProcess("SQL 생성 완료", "success");

      return parsed.items;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류입니다.";
      setError(message);
      addLog(`오류: ${message}`, "error");
      setProcess("오류 발생", "error");
      // 상태 초기화
      setChannelTitle("");
      setChannelOverride("");
      setItems([]);
      setSqlText("");
      setOriginalSqlText("");
      setOriginalItems([]);
      setOriginalChannelTitle("");

      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /** SQL 텍스트를 파싱해서 Supabase episodes 테이블에 insert */
  const insertToSupabase = async () => {
    if (!sqlText.trim()) return;
    setError("");
    setStatus("");
    setIsSending(true);

    try {
      setProcess("Supabase 전송 중", "working");
      const rowsToInsert = parseSqlToRows(sqlText);
      addLog(`Supabase에 ${rowsToInsert.length}개 항목 전송 중...`, "action");

      // FK 오류를 사용자 친화적으로 안내하기 위해 사전 검증
      const programIds = Array.from(
        new Set(
          rowsToInsert
            .map((row) => row.program_id)
            .filter((id): id is number => typeof id === "number"),
        ),
      );

      const invalidProgramIds = programIds.filter((id) => id <= 0);
      if (invalidProgramIds.length > 0) {
        const message =
          "program_id가 0 이하입니다. 프로그램 ID를 올바르게 선택한 뒤 다시 시도해주세요.";
        setError(message);
        addLog(`Supabase 전송 실패: ${message}`, "error");
        setProcess("Supabase 전송 실패", "error");
        setInsertResult("failed");
        return;
      }

      if (programIds.length > 0) {
        const { data: existingPrograms, error: programCheckError } =
          await supabase.from("programs").select("id").in("id", programIds);

        if (programCheckError) {
          throw programCheckError;
        }

        const existingProgramIds = new Set(
          (existingPrograms ?? []).map((row) => Number(row.id)),
        );
        const missingProgramIds = programIds.filter(
          (id) => !existingProgramIds.has(id),
        );

        if (missingProgramIds.length > 0) {
          const message = `program_id ${missingProgramIds.join(", ")}가 programs 테이블에 없습니다. 프로그램 조회 후 존재하는 ID로 다시 시도해주세요.`;
          setError(message);
          addLog(`Supabase 전송 실패: ${message}`, "error");
          setProcess("Supabase 전송 실패", "error");
          setInsertResult("failed");
          return;
        }
      }

      const { error: insertError } = await supabase
        .from("episodes")
        .insert(rowsToInsert);

      // 409 Conflict (중복) 포함, Supabase 상세 사유를 함께 표시
      if (insertError) {
        const message = formatInsertError(insertError);
        setError(message);
        addLog(`Supabase 전송 실패: ${message}`, "error");
        setProcess("Supabase 전송 실패", "error");
        setInsertResult("failed"); // 실패로 표시하여 재시도 방지
      } else {
        setStatus(`Supabase에 ${rowsToInsert.length}개 항목을 추가했습니다.`);
        addLog("Supabase insert 완료.", "success");
        setProcess("Supabase 전송 완료", "success");
        setInsertResult("success"); // 전송 완료 표시
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? `추가 실패: ${err.message}`
          : formatInsertError(err);
      setError(message);
      addLog(`Supabase 전송 실패: ${message}`, "error");
      setProcess("Supabase 전송 실패", "error");
      setInsertResult("failed"); // 실패로 표시하여 재시도 방지
    } finally {
      setIsSending(false);
    }
  };

  /** 변경된 채널명 / R2 폴더 / duration 편집값을 SQL에 반영 */
  const applyChanges = (programId: string) => {
    const mergedItems = items.map((item) => ({
      ...item,
      duration: item._editingDurationValue ?? item.duration,
      _editingDuration: false,
      _editingDurationValue: undefined,
      _editingFilename: false,
      _editingFilenameValue: undefined,
    }));

    const effectiveChannel = channelOverride.trim() || channelTitle;

    const itemsWithExt = mergedItems.map((item) => ({
      ...item,
      // blob URL인 경우 audioUrl을 filename 기반으로 임시 교체해서 ext 보존
      audioUrl: item.audioUrl.startsWith("blob:")
        ? `placeholder.${item.filename.split(".").pop() || "m4a"}`
        : item.audioUrl,
    }));

    const updatedItems = buildItemsWithChannel(
      itemsWithExt,
      effectiveChannel,
      r2Folder,
    ).map((item, index) => ({
      ...item,
      audioUrl: mergedItems[index].audioUrl,
    }));

    const trimmedProgramId = programId.trim();
    const parsedProgramId = trimmedProgramId ? Number(trimmedProgramId) : null;
    const programNumber =
      parsedProgramId !== null && Number.isFinite(parsedProgramId)
        ? parsedProgramId
        : null;

    setChannelTitle(effectiveChannel);
    setItems(updatedItems);
    setSqlText(buildSqlText(updatedItems, programNumber, language));
  };

  /** 원본 데이터로 복원 */
  const resetToOriginal = () => {
    if (!originalItems.length) return;
    setChannelOverride(originalChannelTitle);
    setChannelTitle(originalChannelTitle);
    setItems(originalItems);
    setSqlText(originalSqlText);
  };

  /** duration 인라인 편집 — 편집 모드 진입 */
  const startEditDuration = (filename: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.filename === filename
          ? {
              ...it,
              _editingDuration: true,
              _editingDurationValue: it.duration,
            }
          : it,
      ),
    );
  };

  /** duration 인라인 편집 — 값 변경 */
  const updateEditingDuration = (filename: string, value: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.filename === filename ? { ...it, _editingDurationValue: value } : it,
      ),
    );
  };

  /** duration 인라인 편집 — 확인 */
  const confirmEditDuration = (filename: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.filename === filename
          ? {
              ...it,
              duration: it._editingDurationValue ?? it.duration,
              _editingDuration: false,
              _editingDurationValue: undefined,
            }
          : it,
      ),
    );
  };

  /** duration 인라인 편집 — 취소 */
  const cancelEditDuration = (filename: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.filename === filename
          ? { ...it, _editingDuration: false, _editingDurationValue: undefined }
          : it,
      ),
    );
  };

  /**
   * R2 업로드 완료 후 각 item의 audioUrl을 m4a URL로 교체하고
   * SQL을 재생성합니다.
   *
   * @param urlMap  { [원본 mp3 filename]: "https://r2.../xxx.m4a" }
   * @param programId  현재 선택된 programId
   */
  const applyAudioUrls = (
    urlMap: Record<string, string>,
    programId: string,
  ) => {
    setItems((prev) => {
      const updated = prev.map((item) => {
        const newUrl = urlMap[item.filename];
        if (!newUrl) return item;
        return {
          ...item,
          audioUrl: newUrl,
          r2Url: newUrl, // ← 추가
          filename: item.filename.replace(/\.mp3$/i, ".m4a"),
        };
      });

      const trimmedProgramId = programId.trim();
      const parsedProgramId = trimmedProgramId
        ? Number(trimmedProgramId)
        : null;
      const programNumber =
        parsedProgramId !== null && Number.isFinite(parsedProgramId)
          ? parsedProgramId
          : null;
      const newSql = buildSqlText(updated, programNumber, language);
      setSqlText(newSql);

      return updated;
    });
  };

  /**
   * @param fileMap   { [원본 mp3 filename]: base64 m4a string }
   * @param sourceItems  변환 당시의 원본 items (parsedItems) — 키 매칭 보장
   */
  const applyConvertedFiles = (fileMap: Record<string, string>) => {
    setItems((prev) =>
      prev.map((item) => {
        if (!item.filename.match(/\.mp3$/i)) return item;

        const base64 = fileMap[item.filename];
        if (base64) {
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++)
            bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: "audio/mp4" });
          const blobUrl = URL.createObjectURL(blob);
          return {
            ...item,
            audioUrl: blobUrl,
            filename: item.filename.replace(/\.mp3$/i, ".m4a"),
          };
        }
        return {
          ...item,
          filename: item.filename.replace(/\.mp3$/i, ".m4a"),
        };
      }),
    );
  };

  const applyConvertedItem = (mp3Filename: string, base64: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.filename !== mp3Filename) return item;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/mp4" });
        const blobUrl = URL.createObjectURL(blob);
        return {
          ...item,
          audioUrl: blobUrl,
          filename: item.filename.replace(/\.mp3$/i, ".m4a"),
        };
      }),
    );
  };

  return {
    items,
    sqlText,
    originalSqlText,
    originalItems,
    channelTitle,
    channelOverride,
    error,
    isLoading,
    isSending,
    insertResult,
    setSqlText,
    setChannelOverride,
    setInsertResult,
    fetchEpisodes,
    insertToSupabase,
    applyChanges,
    resetToOriginal,
    startEditDuration,
    updateEditingDuration,
    confirmEditDuration,
    cancelEditDuration,
    applyAudioUrls,
    applyConvertedFiles,
    applyConvertedItem,
  };
}
