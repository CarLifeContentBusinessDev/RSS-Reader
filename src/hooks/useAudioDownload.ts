import { useState } from "react";
import type { LogTone, ParsedItem } from "../types";
import type { ProcessTone } from "./useProcessLog";

interface UseDownloadOptions {
  items: ParsedItem[];
  addLog: (message: string, tone?: LogTone) => void;
  setProcess: (label: string, tone: ProcessTone) => void;
}

export function useAudioDownload({
  items,
  addLog,
  setProcess,
}: UseDownloadOptions) {
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number | null>
  >({});
  const [downloadSummary, setDownloadSummary] = useState({
    total: 0,
    completed: 0,
  });

  const updateProgress = (filename: string, value: number | null) => {
    setDownloadProgress((prev) => ({ ...prev, [filename]: value }));
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      setProcess("다운로드 중", "working");
      addLog(`다운로드 시작: ${filename}`, "action");
      updateProgress(filename, 0);

      // blob URL이면 서버 프록시 없이 직접 다운로드
      if (url.startsWith("blob:")) {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        updateProgress(filename, 100);
        addLog(`다운로드 완료: ${filename}`, "success");
        setProcess("다운로드 완료", "success");
        return true;
      }

      const response = await fetch(
        `/api/download?url=${encodeURIComponent(url)}`,
      );
      if (!response.ok) {
        throw new Error(`다운로드 실패: 상태 코드 ${response.status}.`);
      }

      const totalBytes = Number(response.headers.get("content-length") || 0);

      if (!response.body || !totalBytes) {
        const blob = await response.blob();
        triggerBlobDownload(blob, filename);
        updateProgress(filename, 100);
        addLog(`다운로드 완료: ${filename}`, "success");
        setProcess("다운로드 완료", "success");
        return true;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          const percent = Math.min(
            100,
            Math.round((receivedBytes / totalBytes) * 100),
          );
          updateProgress(filename, percent);
        }
      }

      const blobParts: BlobPart[] = chunks.map(
        (chunk) => chunk.slice().buffer as ArrayBuffer,
      );
      triggerBlobDownload(new Blob(blobParts), filename);
      addLog(`다운로드 완료: ${filename}`, "success");
      updateProgress(filename, 100);
      setProcess("다운로드 완료", "success");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패.";
      addLog(`다운로드 실패: ${filename} - ${message}`, "error");
      updateProgress(filename, null);
      setProcess("다운로드 실패", "error");
      return false;
    }
  };

  const handleDownloadAll = async () => {
    if (!items.length) return;
    setProcess("전체 다운로드 중", "working");
    addLog(`전체 다운로드 시작 (${items.length}개)`, "action");
    setDownloadSummary({ total: items.length, completed: 0 });

    let hasError = false;
    for (const item of items) {
      if (!item.audioUrl) {
        hasError = true;
        addLog(`다운로드 실패: ${item.filename} - 오디오 URL 없음`, "error");
        continue;
      }
      const ok = await downloadFile(item.audioUrl, item.filename);
      setDownloadSummary((prev) => ({
        total: prev.total,
        completed: prev.completed + 1,
      }));
      if (!ok) hasError = true;
    }

    addLog("전체 다운로드 완료", hasError ? "error" : "success");
    setProcess(
      hasError ? "다운로드 일부 실패" : "전체 다운로드 완료",
      hasError ? "error" : "success",
    );
  };

  return {
    downloadProgress,
    downloadSummary,
    downloadFile,
    handleDownloadAll,
  };
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
