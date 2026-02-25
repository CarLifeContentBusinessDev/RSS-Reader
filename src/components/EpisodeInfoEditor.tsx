import { EpisodeCard } from "./EpisodeCard";
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
} from "../constants/style";
import type { ParsedItem } from "../types";

interface EpisodeInfoEditorProps {
  channelTitle: string;
  channelOverride: string;
  onChannelOverrideChange: (v: string) => void;
  items: ParsedItem[];
  originalItems: ParsedItem[];
  downloadProgress: Record<string, number | null | undefined>;
  downloadSummary: { total: number; completed: number };
  onDownload: (url: string, filename: string) => void;
  onStartEditDuration: (filename: string) => void;
  onUpdateEditingDuration: (filename: string, value: string) => void;
  onConfirmEditDuration: (filename: string) => void;
  onCancelEditDuration: (filename: string) => void;
  r2Folder: string;
  onR2FolderChange: (v: string) => void;
  onResetToOriginal: () => void;
  onApplyChanges: () => void;
}

export function EpisodeInfoEditor({
  channelTitle,
  channelOverride,
  onChannelOverrideChange,
  items,
  originalItems,
  downloadProgress,
  downloadSummary,
  onDownload,
  onStartEditDuration,
  onUpdateEditingDuration,
  onConfirmEditDuration,
  onCancelEditDuration,
  r2Folder,
  onR2FolderChange,
  onResetToOriginal,
  onApplyChanges,
}: EpisodeInfoEditorProps) {
  return (
    <>
      {/* 채널명 편집 */}
      <div className="mt-4 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-[min(320px,100%)] items-center gap-2">
          <span className="text-[0.9rem] font-semibold text-ink-muted">
            채널 :
          </span>
          <input
            className={`${inputClass} flex-1 min-w-60 md:min-w-100`}
            type="text"
            value={channelOverride}
            onChange={(e) => onChannelOverrideChange(e.target.value)}
            placeholder={channelTitle || "채널명"}
          />
        </div>
      </div>

      {/* 다운로드 진행 요약 */}
      {downloadSummary.total > 0 && (
        <div className="rounded-full bg-[rgba(16,35,35,0.08)] px-3 py-1 text-[0.85rem] font-semibold text-ink w-fit">
          다운로드 {downloadSummary.completed}/{downloadSummary.total}
        </div>
      )}

      {/* 에피소드 카드 목록 */}
      <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {items.map((item) => {
          const originalItem = originalItems.find(
            (ori) => ori.filename === item.filename,
          );
          return (
            <EpisodeCard
              key={item.filename}
              item={item}
              originalDuration={originalItem?.duration}
              downloadProgress={downloadProgress[item.filename]}
              onDownload={onDownload}
              onStartEditDuration={onStartEditDuration}
              onUpdateEditingDuration={onUpdateEditingDuration}
              onConfirmEditDuration={onConfirmEditDuration}
              onCancelEditDuration={onCancelEditDuration}
            />
          );
        })}
      </div>

      {/* R2 폴더 설정 */}
      <div className="grid gap-4">
        <label className={`${fieldClass} max-w-125`}>
          <span className={fieldLabelClass}>R2 폴더</span>
          <input
            type="text"
            value={r2Folder}
            onChange={(e) => onR2FolderChange(e.target.value)}
            placeholder="/de-episodes-audio/program"
            className={inputClass}
          />
        </label>
        <div className="col-span-full flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <a
              className={ghostButtonClass}
              href={`https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
                r2Folder.replace(/^\/+/, ""),
              )}%2F${encodeURIComponent(channelOverride || channelTitle)}%2F`}
              target="_blank"
              rel="noopener noreferrer"
            >
              폴더 바로가기
            </a>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={onResetToOriginal}
              disabled={!originalItems.length}
            >
              원래대로
            </button>
          </div>
          <button
            className={primaryButtonClass}
            type="button"
            onClick={onApplyChanges}
          >
            변경 반영
          </button>
        </div>
      </div>
    </>
  );
}
