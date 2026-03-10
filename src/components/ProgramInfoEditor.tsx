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
  isCompressing: boolean;
  isUploading: boolean;
  uploadDone: boolean;
  compressedBlob: Blob | null;
  compressedFilename: string;
  compressedSize: number;
  sqlText: string;
  isSending: boolean;
  insertResult: string;
  onTitleChange: (v: string) => void;
  onSubtitleChange: (v: string) => void;
  onImgUrlChange: (v: string) => void;
  onUpload: () => void;
  onRetryUpload: () => void;
  onSendToSupabase: () => void;
  onRetrySend?: () => void;
}

export function ProgramInfoEditor({
  title,
  subtitle,
  sourceImgUrl,
  imgUrl,
  isCompressing,
  isUploading,
  uploadDone,
  compressedBlob,
  compressedFilename,
  compressedSize,
  sqlText,
  isSending,
  insertResult,
  onTitleChange,
  onSubtitleChange,
  onImgUrlChange,
  onUpload,
  onRetryUpload,
  onSendToSupabase,
  onRetrySend,
}: ProgramInfoEditorProps) {
  return (
    <div className="grid gap-4 min-w-0">
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
      <div className="col-span-full grid gap-2 min-w-0">
        <div className="flex gap-2">
          <span className="text-[0.9rem] font-semibold text-ink-muted">
            압축 이미지
          </span>
          {sourceImgUrl && (
            <a
              className={textButtonClass + " ml-2 shrink-0"}
              href={sourceImgUrl}
              target="_blank"
              rel="noreferrer"
            >
              원본 보기
            </a>
          )}
        </div>

        <div className="w-full min-w-0">
          <div className="flex items-center min-w-0">
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
                      <div className="font-medium text-ink">
                        {compressedFilename}
                      </div>
                      <div>{(compressedSize / 1024).toFixed(1)} KB</div>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* R2 이미지 URL (수정 가능) */}
      <label className={fieldClass}>
        <span className={fieldLabelClass}>R2 이미지 URL</span>
        <input
          type="text"
          value={imgUrl}
          onChange={(e) => onImgUrlChange(e.target.value)}
          placeholder="압축 실패 시 직접 입력 가능"
          className={inputClass}
        />
      </label>

      {/* R2 업로드 후 이미지 프리뷰 */}
      {uploadDone && imgUrl && (
        <div className="rounded-xl border border-green-500/30 bg-green-50 dark:bg-green-950/20 p-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-green-600 dark:text-green-400 text-sm font-medium">
              ✓ R2 업로드 완료
            </span>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={(() => {
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
              alt="R2 업로드된 이미지"
              style={{
                width: 120,
                height: 120,
                borderRadius: 8,
                objectFit: "cover",
                flexShrink: 0,
              }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            <div className="text-sm text-ink-muted">
              <div className="font-medium text-ink mb-1">업로드된 이미지</div>
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
                새 탭에서 열기
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 액션 버튼 행 */}
      <div className="col-span-full flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
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
            <button
              className={ghostButtonClass}
              type="button"
              onClick={onRetryUpload}
            >
              다시 업로드
            </button>
          )}
        </div>

        {/* Supabase 전송 버튼 */}
        <div className="flex justify-end pt-2 ">
          {isSending ? (
            <button
              className={
                primaryButtonClass +
                " bg-blue-600 hover:bg-blue-700 disabled:bg-ink-faint text-white px-8 py-3 text-base font-semibold"
              }
              type="button"
              disabled
            >
              Supabase로 전송 중...
            </button>
          ) : !insertResult ? (
            <button
              className={
                primaryButtonClass +
                " bg-blue-600 hover:bg-blue-700 disabled:bg-ink-faint text-white px-8 py-3 text-base font-semibold"
              }
              type="button"
              onClick={onSendToSupabase}
              disabled={!sqlText.trim()}
            >
              Supabase로 전송
            </button>
          ) : (
            <>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={onRetrySend}
              >
                재전송
              </button>
              <button
                className={
                  primaryButtonClass + " bg-green-500 hover:bg-green-600 ml-2"
                }
                type="button"
                disabled
              >
                전송 완료
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
