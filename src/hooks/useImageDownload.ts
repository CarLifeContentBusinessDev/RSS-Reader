import { useState } from "react";
import type { ToastTone } from "../types";
import { sanitizePathSegment } from "../utils/r2";

interface UseImageDownloadOptions {
  showToast: (message: string, tone?: ToastTone) => void;
}

export function useImageDownload({ showToast }: UseImageDownloadOptions) {
  const [isDownloading, setIsDownloading] = useState(false);

  const SIZE_THRESHOLD = 30 * 1024;

  const triggerDownload = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const compressToWebP = async (
    blob: Blob,
  ): Promise<{ blob: Blob; reachedLimit: boolean }> => {
    // ...existing code...
    // 1. quality만 반복적으로 낮추며 압축
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("이미지 로드 실패."));
      img.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    let width = img.naturalWidth;
    let height = img.naturalHeight;

    const compressWithQuality = async (
      canvas: HTMLCanvasElement,
      width: number,
      height: number,
    ) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context 생성 실패.");
      ctx.drawImage(img, 0, 0, width, height);
      let bestBlob: Blob | null = null;
      let bestSize = Infinity;
      for (
        let quality = 0.9;
        quality >= 0.01;
        quality = Math.round((quality - 0.05) * 100) / 100
      ) {
        const compressed = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error("이미지 압축 실패."))),
            "image/webp",
            quality,
          ),
        );
        if (compressed.size < bestSize) {
          bestBlob = compressed;
          bestSize = compressed.size;
        }
        if (compressed.size <= SIZE_THRESHOLD) {
          return { blob: compressed, reachedLimit: false };
        }
      }
      return { blob: bestBlob!, reachedLimit: true };
    };

    // quality 반복 압축
    let canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    let qualityResult = await compressWithQuality(canvas, width, height);
    if (!qualityResult.reachedLimit) {
      return qualityResult;
    }

    // 2. 그래도 30KB 이하가 안 되면 해상도 줄여서 다시 quality 반복 압축
    for (let i = 0; i < 5; i++) {
      width = Math.max(1, Math.round(width / 2));
      height = Math.max(1, Math.round(height / 2));
      canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      qualityResult = await compressWithQuality(canvas, width, height);
      if (!qualityResult.reachedLimit) {
        return qualityResult;
      }
    }
    // 최종 결과 반환
    return qualityResult;
  };

  const downloadImage = async (url: string, programTitle: string) => {
    if (!url || isDownloading) return;

    setIsDownloading(true);

    try {
      const response = await fetch(url);
      if (!response.ok)
        throw new Error(`다운로드 실패: 상태 코드 ${response.status}.`);

      const fallbackName = "channel-image";
      const safeTitle = sanitizePathSegment(programTitle) || fallbackName;
      const filename = `${safeTitle}.webp`;

      const blob = await response.blob();

      if (blob.size <= SIZE_THRESHOLD) {
        triggerDownload(blob, filename);
        return;
      }

      const { blob: compressed, reachedLimit } = await compressToWebP(blob);

      if (reachedLimit) {
        const sizeKb = (compressed.size / 1024).toFixed(1);
        showToast(
          `최대 압축해도 ${sizeKb}KB입니다. 그대로 다운로드합니다.`,
          "error",
        );
      }

      triggerDownload(compressed, filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패.";
      showToast(message, "error");
    } finally {
      setIsDownloading(false);
    }
  };

  return { downloadImage, isDownloading };
}
