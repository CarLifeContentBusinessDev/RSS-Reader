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
  isCompressing: boolean;
  isUploading: boolean;
  uploadDone: boolean;
  compressedBlob: Blob | null;
  compressedFilename: string;
  compressedSize: number;
  onTitleChange: (v: string) => void;
  onSubtitleChange: (v: string) => void;
  onImageFolderChange: (v: string) => void;
  onApply: () => void;
  onUpload: () => void;
  onRetryUpload: () => void;
}

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
  isCompressing,
  isUploading,
  uploadDone,
  compressedBlob,
  compressedFilename,
  compressedSize,
  onTitleChange,
  onSubtitleChange,
  onImageFolderChange,
  onApply,
  onUpload,
  onRetryUpload,
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

      {/* 원본 이미지 URL + 원본 보기 버튼 */}
      <div className="col-span-full grid gap-2">
        <span className="text-[0.9rem] font-semibold text-ink-muted">
          원본 이미지 URL
        </span>
        <div className="w-full">
          <div className="inline-flex items-center min-w-0">
            <span className="min-w-0 rounded-xl border border-panel-border bg-surface p-3.5 text-[0.95rem] text-ink truncate">
              {sourceImgUrl || "-"}
            </span>
            {sourceImgUrl && (
              <a
                className={textButtonClass + " ml-2"}
                href={sourceImgUrl}
                target="_blank"
                rel="noreferrer"
              >
                원본 보기
              </a>
            )}
          </div>
        </div>
      </div>

      {/* 압축 이미지 미리보기 */}
      {(isCompressing || compressedBlob) && (
        <div className="flex items-center gap-4 rounded-xl border border-panel-border bg-surface p-4">
          {isCompressing ? (
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <span>⏳</span>
              이미지 압축 중...
            </div>
          ) : compressedBlob ? (
            <>
              <img
                src={URL.createObjectURL(compressedBlob)}
                alt="압축 이미지"
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 8,
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
              <div className="text-sm text-ink-muted">
                <div className="font-medium text-ink">{compressedFilename}</div>
                <div>{(compressedSize / 1024).toFixed(1)} KB</div>
              </div>
            </>
          ) : null}
        </div>
      )}

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

          {isCompressing ? (
            <button className={ghostButtonClass} type="button" disabled>
              압축 중...
            </button>
          ) : !compressedBlob ? null : !uploadDone ? (
            <button
              className={primaryButtonClass}
              type="button"
              onClick={onUpload}
              disabled={isUploading}
            >
              {isUploading ? "업로드 중..." : "R2에 업로드"}
            </button>
          ) : (
            <>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={onRetryUpload}
              >
                다시시도
              </button>
              <button
                className={
                  primaryButtonClass + " bg-green-500 hover:bg-green-600"
                }
                type="button"
                disabled
              >
                업로드 완료
              </button>
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
            </>
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
    </div>
  );
}
