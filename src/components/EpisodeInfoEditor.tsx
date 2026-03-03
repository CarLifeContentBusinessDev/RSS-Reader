import { EpisodeCard } from "./EpisodeCard";
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
} from "../constants/style";
import type { ParsedItem } from "../types";
import type { ConvertState } from "../hooks/useAudioConvert";
import type { UploadState } from "../hooks/useAudioUpload";

interface EpisodeInfoEditorProps {
  channelTitle: string;
  channelOverride: string;
  onChannelOverrideChange: (v: string) => void;
  items: ParsedItem[];
  originalItems: ParsedItem[];
  downloadProgress: Record<string, number | null | undefined>;
  downloadSummary: { total: number; completed: number };
  convertStates: Record<string, ConvertState>;
  convertSummary: { total: number; completed: number; failed: number };
  uploadStates: Record<string, UploadState>;
  uploadSummary: { total: number; completed: number; failed: number };
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
  convertStates,
  convertSummary,
  uploadStates,
  uploadSummary,
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

      {/* 진행 현황 배지 */}
      <div className="flex flex-wrap gap-2">
        {downloadSummary.total > 0 && (
          <div className="rounded-full bg-[rgba(16,35,35,0.08)] px-3 py-1 text-[0.85rem] font-semibold text-ink w-fit">
            다운로드 {downloadSummary.completed}/{downloadSummary.total}
          </div>
        )}
        {convertSummary.total > 0 && (
          <div
            className={`rounded-full px-3 py-1 text-[0.85rem] font-semibold w-fit ${
              convertSummary.failed > 0
                ? "bg-red-100 text-red-700"
                : convertSummary.completed === convertSummary.total
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
            }`}
          >
            변환 {convertSummary.completed}/{convertSummary.total}
            {convertSummary.failed > 0 && ` (실패 ${convertSummary.failed})`}
          </div>
        )}
        {uploadSummary.total > 0 && (
          <div
            className={`rounded-full px-3 py-1 text-[0.85rem] font-semibold w-fit ${
              uploadSummary.failed > 0
                ? "bg-red-100 text-red-700"
                : uploadSummary.completed === uploadSummary.total
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
            }`}
          >
            R2업로드 {uploadSummary.completed}/{uploadSummary.total}
            {uploadSummary.failed > 0 && ` (실패 ${uploadSummary.failed})`}
          </div>
        )}
      </div>

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
              convertState={
                convertStates[item.filename] ??
                convertStates[item.filename.replace(/\.m4a$/i, ".mp3")]
              }
              uploadState={
                uploadStates[item.filename] ??
                uploadStates[item.filename.replace(/\.m4a$/i, ".mp3")]
              }
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
