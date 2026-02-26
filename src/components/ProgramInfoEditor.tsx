import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  textButtonClass,
} from "../constants/style";

interface ProgramInfoEditorProps {
  title: string;
  subtitle: string;
  sourceImgUrl: string;
  imgUrl: string;
  imageFolder: string;
  language: string;
  isDownloading: boolean;
  uploadDone: boolean;
  hasCompressed: boolean;
  onTitleChange: (v: string) => void;
  onSubtitleChange: (v: string) => void;
  onImageFolderChange: (v: string) => void;
  onApply: () => void;
  onDownloadImage: () => void;
  onRetryUpload: () => void;
}

/** Cloudflare R2 대시보드 URL 생성 */
function buildR2DashboardUrl(imageFolder: string): string {
  if (imageFolder === "/eng_images/program") {
    return "https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=eng_images%2Fprogram%2F";
  }
  return `https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
    imageFolder.replace(/^\//, ""),
  )}%2F`;
}

export function ProgramInfoEditor({
  title,
  subtitle,
  sourceImgUrl,
  imgUrl,
  imageFolder,
  language,
  isDownloading,
  uploadDone,
  onTitleChange,
  onSubtitleChange,
  onImageFolderChange,
  onApply,
  onDownloadImage,
  onRetryUpload,
  hasCompressed,
}: ProgramInfoEditorProps) {
  const defaultFolder =
    language === "en" ? "/eng_images/program" : `/${language}_images/program`;

  return (
    <div className="grid gap-4">
      {/* 제목 / 부제 */}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={fieldClass}>
          <span className={fieldLabelClass}>제목</span>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={fieldClass}>
          <span className={fieldLabelClass}>부제</span>
          <input
            type="text"
            value={subtitle}
            onChange={(e) => onSubtitleChange(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {/* 원본 이미지 URL (읽기 전용) */}
      <div className="col-span-full grid gap-2">
        <span className="text-[0.9rem] font-semibold text-ink-muted">
          원본 이미지 URL
        </span>
        <span className="rounded-xl border border-panel-border bg-surface p-3.5 text-[0.95rem] text-ink">
          {sourceImgUrl || "-"}
        </span>
      </div>

      {/* R2 폴더 */}
      <label className={fieldClass}>
        <span className={fieldLabelClass}>R2 폴더</span>
        <input
          type="text"
          value={imageFolder}
          onChange={(e) => onImageFolderChange(e.target.value)}
          placeholder={defaultFolder}
          className={inputClass}
        />
      </label>

      {/* 액션 버튼 행 */}
      <div className="col-span-full flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <a
            className={ghostButtonClass}
            href={buildR2DashboardUrl(imageFolder)}
            target="_blank"
            rel="noreferrer"
          >
            R2 폴더 바로가기
          </a>
          {!uploadDone && !hasCompressed ? (
            // 압축 전: "이미지 압축 및 업로드" 버튼
            <button
              className={ghostButtonClass}
              type="button"
              onClick={onDownloadImage}
              disabled={!sourceImgUrl || isDownloading}
            >
              {isDownloading ? "압축 중..." : "이미지 압축 및 업로드"}
            </button>
          ) : uploadDone ? (
            // 업로드 완료
            <>
              <button
                className={
                  primaryButtonClass + " bg-green-500 hover:bg-green-600"
                }
                type="button"
                disabled
              >
                업로드 완료
              </button>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={onRetryUpload}
              >
                다시시도
              </button>
            </>
          ) : (
            // 압축됐지만 아직 업로드 안됨 (모달 닫은 상태)
            <>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={onRetryUpload}
              >
                업로드하기
              </button>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={onDownloadImage}
                disabled={isDownloading}
              >
                재압축
              </button>
            </>
          )}
          {sourceImgUrl && (
            <a
              className={textButtonClass}
              href={sourceImgUrl}
              target="_blank"
              rel="noreferrer"
            >
              원본 보기
            </a>
          )}
          {imgUrl && (
            <a
              className={textButtonClass}
              href={(() => {
                try {
                  const url = new URL(imgUrl);
                  const parts = url.pathname.split("/");
                  if (parts.length > 0) {
                    const last = parts[parts.length - 1];
                    if (!last.endsWith(".webp")) {
                      const base = last.replace(/\.[^.]+$/, "");
                      parts[parts.length - 1] = base + ".webp";
                      url.pathname = parts.join("/");
                      return url.toString();
                    }
                  }
                } catch (err) {
                  console.error("R2 URL 변환 오류:", err);
                }
                return imgUrl;
              })()}
              target="_blank"
              rel="noreferrer"
            >
              R2 확인
            </a>
          )}
        </div>
        <button
          className={primaryButtonClass}
          type="button"
          onClick={onApply}
          disabled={!title}
        >
          변경 반영
        </button>
      </div>

      {/* 압축 이미지 정보 및 업로드 확인 UI는 모달로 이동 */}
    </div>
  );
}
