import { EpisodeCard } from "./EpisodeCard";
import {
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
  selectedCount: number;
  totalCount: number;
  isAllSelected: boolean;
  sqlText: string;
  isSending: boolean;
  onDownload: (url: string, filename: string) => void;
  onStartEditDuration: (filename: string) => void;
  onUpdateEditingDuration: (filename: string, value: string) => void;
  onConfirmEditDuration: (filename: string) => void;
  onCancelEditDuration: (filename: string) => void;
  isEpisodeSelected: (filename: string) => boolean;
  onEpisodeSelectionChange: (filename: string, selected: boolean) => void;
  onSelectAllEpisodes: () => void;
  onClearSelectedEpisodes: () => void;
  onConvertAll: () => void;
  onUploadAll: () => void;
  isConvertDisabled: boolean;
  isUploadDisabled: boolean;
  convertButtonLabel: string;
  uploadButtonLabel: string;
  onSendToSupabase: () => void;
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
  selectedCount,
  totalCount,
  isAllSelected,
  sqlText,
  isSending,
  onDownload,
  onStartEditDuration,
  onUpdateEditingDuration,
  onConfirmEditDuration,
  onCancelEditDuration,
  isEpisodeSelected,
  onEpisodeSelectionChange,
  onSelectAllEpisodes,
  onClearSelectedEpisodes,
  onConvertAll,
  onUploadAll,
  isConvertDisabled,
  isUploadDisabled,
  convertButtonLabel,
  uploadButtonLabel,
  onSendToSupabase,
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-panel-border/70 bg-[rgba(16,35,35,0.03)] px-4 py-3">
        <p className="text-[0.9rem] font-semibold text-ink-muted">
          선택된 에피소드 {selectedCount}/{totalCount}
        </p>
        <div className="flex items-center gap-2">
          <button
            className={ghostButtonClass}
            type="button"
            onClick={
              isAllSelected ? onClearSelectedEpisodes : onSelectAllEpisodes
            }
            disabled={!totalCount}
          >
            {isAllSelected ? "전체 해제" : "전체 선택"}
          </button>
          <button
            className={ghostButtonClass}
            type="button"
            onClick={onClearSelectedEpisodes}
            disabled={!selectedCount}
          >
            선택 해제
          </button>
        </div>
      </div>

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
              selected={isEpisodeSelected(item.filename)}
              onSelectionChange={onEpisodeSelectionChange}
            />
          );
        })}
      </div>

      {/* 액션 */}
      <div className="grid gap-4">
        <div className="col-span-full flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            <button
              className={ghostButtonClass}
              type="button"
              onClick={onConvertAll}
              disabled={isConvertDisabled}
            >
              {convertButtonLabel}
            </button>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={onUploadAll}
              disabled={isUploadDisabled}
            >
              {uploadButtonLabel}
            </button>
          </div>
          <button
            className={primaryButtonClass}
            type="button"
            onClick={onSendToSupabase}
            disabled={!sqlText.trim() || isSending}
          >
            {isSending ? "Supabase 전송 중..." : "Supabase로 전송"}
          </button>
        </div>
      </div>
    </>
  );
}
