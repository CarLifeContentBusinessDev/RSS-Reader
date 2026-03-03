import { useState } from "react";
import type { ParsedItem, LogTone } from "../types";
import type { ProcessTone } from "./useProcessLog";
import type { ConvertState } from "./useAudioConvert";

export type UploadStatus = "idle" | "uploading" | "done" | "error";

export interface UploadState {
  status: UploadStatus;
  url?: string;
  error?: string;
}

interface UseAudioUploadOptions {
  addLog: (message: string, tone?: LogTone) => void;
  setProcess: (label: string, tone: ProcessTone) => void;
}

export function useAudioUpload({ addLog, setProcess }: UseAudioUploadOptions) {
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>(
    {},
  );

  const updateState = (filename: string, patch: Partial<UploadState>) => {
    setUploadStates((prev) => ({
      ...prev,
      [filename]: { ...(prev[filename] ?? { status: "idle" }), ...patch },
    }));
  };

  /**
   * items, convertStates, r2Folder, channelTitle을 직접 받아 업로드
   * — stale closure 없이 항상 최신 값 사용
   */
  const uploadAll = async (
    items: ParsedItem[],
    convertStates: Record<string, ConvertState>,
    r2Folder: string,
    channelTitle: string,
  ): Promise<Record<string, string>> => {
    setProcess("R2 업로드 중", "working");
    addLog(`R2 업로드 시작 (${items.length}개)`, "action");

    // 업로드 상태 초기화
    const initial: Record<string, UploadState> = {};
    for (const item of items) {
      initial[item.filename] = { status: "idle" };
    }
    setUploadStates(initial);

    const urlMap: Record<string, string> = {};
    let hasError = false;

    for (const item of items) {
      const m4aFilename = item.filename.replace(/\.mp3$/i, ".m4a");
      const convertState = convertStates[item.filename];

      if (!convertState?.file) {
        updateState(item.filename, {
          status: "error",
          error: "변환 데이터 없음",
        });
        addLog(`업로드 건너뜀: ${item.filename} - 변환 데이터 없음`, "error");
        hasError = true;
        continue;
      }

      updateState(item.filename, { status: "uploading" });
      addLog(`업로드 중: ${m4aFilename}`, "action");

      const folder = `${r2Folder.replace(/^\/+/, "")}/${channelTitle}`;

      try {
        const res = await fetch("/api/uploadAudio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder,
            filename: m4aFilename,
            file: convertState.file,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "업로드 실패" }));
          throw new Error(err.error || "업로드 실패");
        }

        const data = await res.json();
        updateState(item.filename, { status: "done", url: data.url });
        // 키는 원본 mp3 filename으로 저장 (applyAudioUrls에서 매칭)
        urlMap[item.filename] = data.url;
        addLog(`업로드 완료: ${m4aFilename}`, "success");
      } catch (err) {
        const message = err instanceof Error ? err.message : "업로드 실패";
        updateState(item.filename, { status: "error", error: message });
        addLog(`업로드 실패: ${m4aFilename} - ${message}`, "error");
        hasError = true;
      }
    }

    addLog(
      hasError ? "일부 업로드 실패" : "전체 업로드 완료",
      hasError ? "error" : "success",
    );
    setProcess(
      hasError ? "업로드 일부 실패" : "R2 업로드 완료",
      hasError ? "error" : "success",
    );

    return urlMap;
  };

  const getUploadSummary = (items: ParsedItem[]) => ({
    total: items.length,
    completed: items.filter((item) => {
      const key = item.filename.replace(/\.m4a$/i, ".mp3");
      return (
        uploadStates[key]?.status === "done" ||
        uploadStates[item.filename]?.status === "done"
      );
    }).length,
    failed: items.filter((item) => {
      const key = item.filename.replace(/\.m4a$/i, ".mp3");
      return (
        uploadStates[key]?.status === "error" ||
        uploadStates[item.filename]?.status === "error"
      );
    }).length,
  });

  const isAllUploaded = (items: ParsedItem[]) =>
    items.length > 0 &&
    items.every((item) => {
      const key = item.filename.replace(/\.m4a$/i, ".mp3");
      return (
        uploadStates[key]?.status === "done" ||
        uploadStates[item.filename]?.status === "done"
      );
    });

  return {
    uploadStates,
    uploadAll,
    isAllUploaded,
    getUploadSummary,
  };
}
