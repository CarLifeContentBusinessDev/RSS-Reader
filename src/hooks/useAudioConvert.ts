import { useState } from "react";
import type { ParsedItem, LogTone } from "../types";
import type { ProcessTone } from "./useProcessLog";

export type ConvertStatus = "idle" | "converting" | "done" | "error";

export interface ConvertState {
  status: ConvertStatus;
  progress: number;
  file?: string;
  fileSize?: number;
  error?: string;
}

interface UseAudioConvertOptions {
  addLog: (message: string, tone?: LogTone) => void;
  setProcess: (label: string, tone: ProcessTone) => void;
  onItemConverted?: (filename: string, base64: string) => void;
}

export function useAudioConvert({
  addLog,
  setProcess,
  onItemConverted,
}: UseAudioConvertOptions) {
  const [convertStates, setConvertStates] = useState<
    Record<string, ConvertState>
  >({});

  const updateState = (filename: string, patch: Partial<ConvertState>) => {
    setConvertStates((prev) => ({
      ...prev,
      [filename]: {
        ...(prev[filename] ?? { status: "idle", progress: 0 }),
        ...patch,
      },
    }));
  };

  /**
   * 변환 실행. 완료 시 { filename → base64 } 맵 반환.
   * EpisodesPage에서 이 결과로 즉시 audioUrl + filename 교체 가능.
   */
  const CONCURRENCY = 5;

  const convertAll = async (
    items: ParsedItem[],
  ): Promise<Record<string, string>> => {
    if (!items.length) return {};

    const initial: Record<string, ConvertState> = {};
    for (const item of items) {
      initial[item.filename] = { status: "idle", progress: 0 };
    }
    setConvertStates(initial);

    setProcess("변환 중", "working");
    addLog(`m4a 변환 시작 (${items.length}개)`, "action");

    const fileMap: Record<string, string> = {};
    const queue = [...items];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift()!;

        if (!item.audioUrl) {
          updateState(item.filename, {
            status: "error",
            error: "audioUrl 없음",
          });
          addLog(`변환 건너뜀: ${item.filename} - audioUrl 없음`, "error");
          continue;
        }

        updateState(item.filename, { status: "converting", progress: 10 });
        addLog(`변환 중: ${item.filename}`, "action");

        try {
          const res = await fetch("/api/convertAudio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: item.audioUrl,
              filename: item.filename.replace(/\.mp3$/i, ".m4a"),
            }),
          });

          updateState(item.filename, { progress: 80 });

          if (!res.ok) {
            // 504 Gateway Timeout 특별 처리
            if (res.status === 504) {
              throw new Error(
                "변환 시간 초과 (10초 제한). 파일이 너무 큽니다. 더 작은 파일로 시도하거나 Pro 플랜이 필요합니다.",
              );
            }
            const err = await res.json().catch(() => ({
              error: `변환 실패 (${res.status})`,
            }));
            throw new Error(
              err.details || err.error || `변환 실패 (${res.status})`,
            );
          }

          const data = await res.json();
          updateState(item.filename, {
            status: "done",
            progress: 100,
            file: data.file,
            fileSize: data.fileSize,
          });
          fileMap[item.filename] = data.file;
          onItemConverted?.(item.filename, data.file);
          addLog(`변환 완료: ${item.filename}`, "success");
        } catch (err) {
          const message = err instanceof Error ? err.message : "변환 실패";
          updateState(item.filename, {
            status: "error",
            error: message,
            progress: 0,
          });
          addLog(`변환 실패: ${item.filename} - ${message}`, "error");
        }
      }
    };

    // 워커 5개 동시 실행 — 각 워커는 queue가 빌 때까지 계속 꺼내서 처리
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    const hasError = items.some(
      (item) => !fileMap[item.filename] && item.audioUrl,
    );

    addLog(
      hasError ? "일부 변환 실패" : "전체 변환 완료",
      hasError ? "error" : "success",
    );
    setProcess(
      hasError ? "변환 일부 실패" : "변환 완료",
      hasError ? "error" : "success",
    );

    return fileMap;
  };

  const resetConvertStates = () => setConvertStates({});

  const getConvertSummary = (items: ParsedItem[]) => ({
    total: items.length,
    completed: items.filter((item) => {
      const key = item.filename.replace(/\.m4a$/i, ".mp3");
      return (
        convertStates[key]?.status === "done" ||
        convertStates[item.filename]?.status === "done"
      );
    }).length,
    failed: items.filter((item) => {
      const key = item.filename.replace(/\.m4a$/i, ".mp3");
      return (
        convertStates[key]?.status === "error" ||
        convertStates[item.filename]?.status === "error"
      );
    }).length,
  });

  const isAllConverted = (items: ParsedItem[]) =>
    items.length > 0 &&
    items.every((item) => {
      const key = item.filename.replace(/\.m4a$/i, ".mp3");
      return (
        convertStates[key]?.status === "done" ||
        convertStates[item.filename]?.status === "done"
      );
    });

  return {
    convertStates,
    convertAll,
    resetConvertStates,
    isAllConverted,
    getConvertSummary,
  };
}
