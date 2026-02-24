import type { ToastTone } from "../types";
import { sanitizePathSegment } from "../utils/r2";

interface UseImageDownloadOptions {
  showToast: (message: string, tone?: ToastTone) => void;
}

export function useImageDownload({ showToast }: UseImageDownloadOptions) {
  const downloadImage = async (url: string, programTitle: string) => {
    if (!url) return;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`다운로드 실패: 상태 코드 ${response.status}.`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");

      const fallbackName = "channel-image";
      const urlName = url.split("/").pop()?.split("?")[0] || fallbackName;
      const ext = urlName.split(".").pop() || "webp";
      const safeTitle = sanitizePathSegment(programTitle) || fallbackName;
      const filename = safeTitle ? `${safeTitle}.${ext}` : urlName;

      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패.";
      showToast(message, "error");
    }
  };

  return { downloadImage };
}
