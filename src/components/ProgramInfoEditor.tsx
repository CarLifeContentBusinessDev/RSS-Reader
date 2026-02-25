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
  onTitleChange: (v: string) => void;
  onSubtitleChange: (v: string) => void;
  onImageFolderChange: (v: string) => void;
  onApply: () => void;
  onDownloadImage: () => void;
}

/** Cloudflare R2 대시보드 URL 생성 */
function buildR2DashboardUrl(imageFolder: string): string {
  if (imageFolder === "/eng_images/program") {
    return "https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=eng_images%2Fprogram%2F";
  }
  return `https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
    imageFolder.replace(/^\//, ""),
  )}`;
}

export function ProgramInfoEditor({
  title,
  subtitle,
  sourceImgUrl,
  imgUrl,
  imageFolder,
  language,
  onTitleChange,
  onSubtitleChange,
  onImageFolderChange,
  onApply,
  onDownloadImage,
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
          <button
            className={ghostButtonClass}
            type="button"
            onClick={onDownloadImage}
            disabled={!sourceImgUrl}
          >
            이미지 다운로드
          </button>
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
              href={imgUrl}
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
    </div>
  );
}
