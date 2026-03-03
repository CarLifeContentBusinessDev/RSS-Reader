import { inputClass, textButtonClass } from "../constants/style";
import type { ConvertState } from "../hooks/useAudioConvert";
import type { UploadState } from "../hooks/useAudioUpload";
import type { ParsedItem } from "../types";

interface EpisodeCardProps {
  item: ParsedItem;
  originalDuration?: string;
  downloadProgress: number | null | undefined;
  convertState?: ConvertState;
  uploadState?: UploadState;
  onDownload: (url: string, filename: string) => void;
  onStartEditDuration: (filename: string) => void;
  onUpdateEditingDuration: (filename: string, value: string) => void;
  onConfirmEditDuration: (filename: string) => void;
  onCancelEditDuration: (filename: string) => void;
}

export function EpisodeCard({
  item,
  originalDuration,
  downloadProgress,
  convertState,
  uploadState,
  onDownload,
  onStartEditDuration,
  onUpdateEditingDuration,
  onConfirmEditDuration,
  onCancelEditDuration,
}: EpisodeCardProps) {
  const durationChanged =
    originalDuration !== undefined && originalDuration !== item.duration;

  return (
    <article className="grid gap-4 rounded-[18px] border border-panel-border bg-surface p-5 animate-fadeInUp">
      <h3 className="text-[1.05rem] font-semibold">{item.title}</h3>
      <dl className="grid gap-2.5">
        {/* 날짜 */}
        <div>
          <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted">
            날짜
          </dt>
          <dd className="mt-1 font-semibold">{item.date}</dd>
        </div>

        {/* 길이 */}
        <div>
          <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted flex items-center gap-2">
            길이
            {durationChanged && (
              <span className="text-ink-muted text-xs font-semibold">
                수정됨
              </span>
            )}
          </dt>
          <dd className="mt-1 font-semibold flex items-center gap-2">
            {item._editingDuration ? (
              <>
                <input
                  type="text"
                  className={`${inputClass} w-24 min-w-0 max-w-1/2 px-2 text-base`}
                  value={item._editingDurationValue ?? item.duration}
                  autoFocus
                  onChange={(e) =>
                    onUpdateEditingDuration(item.filename, e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onCancelEditDuration(item.filename);
                    if (e.key === "Enter") onConfirmEditDuration(item.filename);
                  }}
                />
                <button
                  type="button"
                  className={textButtonClass}
                  style={{ padding: 0, fontSize: "0.95em" }}
                  onClick={() => onConfirmEditDuration(item.filename)}
                >
                  확인
                </button>
              </>
            ) : (
              <>
                <span>{item.duration}</span>
                <button
                  type="button"
                  className={textButtonClass}
                  style={{ padding: 0, fontSize: "0.95em" }}
                  onClick={() => onStartEditDuration(item.filename)}
                >
                  편집
                </button>
              </>
            )}
          </dd>
        </div>

        {/* 변환 상태 바 */}

        {/* 파일명 */}
        <div>
          <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted">
            파일명
          </dt>
          <dd className="mt-1 font-semibold">{item.filename}</dd>
        </div>
      </dl>
      {/* 링크 / 다운로드 */}
      <div className="flex flex-wrap items-center gap-4 text-[0.9rem]">
        <a
          className={textButtonClass}
          href={item.audioUrl}
          target="_blank"
          rel="noreferrer"
        >
          원본 오디오
        </a>
        <a
          className={textButtonClass}
          href={item.r2Url}
          target="_blank"
          rel="noreferrer"
        >
          R2 확인
        </a>
        <button
          className={textButtonClass}
          type="button"
          onClick={() => onDownload(item.audioUrl, item.filename)}
          disabled={!item.audioUrl}
        >
          {downloadProgress != null
            ? `다운로드 ${downloadProgress}%`
            : "다운로드"}
        </button>
      </div>
      <ConvertProgressBar state={convertState} />
      <UploadStatusBadge state={uploadState} />
      {/* 진행률 바 */}
      {downloadProgress != null && (
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(16,35,35,0.1)]">
            <span
              className="block h-full bg-linear-to-br from-accent to-accent-strong transition-[width] duration-200"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
          <span className="min-w-10.5 text-right text-[0.8rem] text-ink-muted">
            {downloadProgress}%
          </span>
        </div>
      )}
    </article>
  );
}

// 변환 상태 바
function ConvertProgressBar({ state }: { state?: ConvertState }) {
  if (!state || state.status === "idle") return null;

  const label =
    state.status === "converting"
      ? `변환 중... ${state.progress}%`
      : state.status === "done"
        ? "✓ 변환 완료"
        : `✗ 변환 실패${state.error ? `: ${state.error}` : ""}`;

  const barColor =
    state.status === "done"
      ? "bg-green-500"
      : state.status === "error"
        ? "bg-red-400"
        : "bg-yellow-400";

  return (
    <div className="mt-2">
      <div className="flex justify-between text-[0.75rem] text-ink-muted mb-1">
        <span>{label}</span>
      </div>
      {state.status === "converting" && (
        <div className="h-1.5 w-full rounded-full bg-panel-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${state.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

// 업로드 상태
function UploadStatusBadge({ state }: { state?: UploadState }) {
  if (!state || state.status === "idle") return null;

  const label =
    state.status === "uploading"
      ? "R2 업로드 중..."
      : state.status === "done"
        ? "✓ R2 업로드 완료"
        : `✗ 업로드 실패${state.error ? `: ${state.error}` : ""}`;

  const color =
    state.status === "done"
      ? "text-green-600"
      : state.status === "error"
        ? "text-red-500"
        : "text-blue-500";

  return <p className={`mt-1 text-[0.75rem] font-medium ${color}`}>{label}</p>;
}
