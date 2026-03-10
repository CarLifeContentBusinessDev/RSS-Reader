import type { FormEvent } from "react";
import SelectField from "./SelectField";
import { LANGUAGE_OPTIONS } from "../constants/language";
import {
  fieldClass,
  fieldLabelClass,
  formClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  textButtonClass,
} from "../constants/style";

interface EpisodesFetchFormProps {
  rssUrl: string;
  language: string;
  programId: string;
  limit: string;
  r2Folder: string;
  programOptions: { value: string; label: string }[];
  programSearched: boolean;
  programInputMode: "input" | "select";
  isProgramSearching: boolean;
  isLoading: boolean;
  autoConvertAudio: boolean;
  autoUploadToR2: boolean;
  autoSendToSupabase: boolean;
  onRssUrlChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onProgramIdChange: (v: string) => void;
  onLimitChange: (v: string) => void;
  onR2FolderChange: (v: string) => void;
  onProgramSearch: () => void;
  onToggleInputMode: () => void;
  onAutoConvertAudioChange: (v: boolean) => void;
  onAutoUploadToR2Change: (v: boolean) => void;
  onAutoSendToSupabaseChange: (v: boolean) => void;
  automationToggleLabel: string;
  onSelectAllAutomation: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}

export function EpisodesFetchForm({
  rssUrl,
  language,
  programId,
  limit,
  r2Folder,
  programOptions,
  programSearched,
  programInputMode,
  isProgramSearching,
  isLoading,
  autoConvertAudio,
  autoUploadToR2,
  autoSendToSupabase,
  onRssUrlChange,
  onLanguageChange,
  onProgramIdChange,
  onLimitChange,
  onR2FolderChange,
  onProgramSearch,
  onToggleInputMode,
  onAutoConvertAudioChange,
  onAutoUploadToR2Change,
  onAutoSendToSupabaseChange,
  automationToggleLabel,
  onSelectAllAutomation,
  onSubmit,
  onReset,
}: EpisodesFetchFormProps) {
  return (
    <form className={formClass} onSubmit={onSubmit}>
      {/* RSS URL */}
      <label className={fieldClass}>
        <span className={fieldLabelClass}>RSS URL</span>
        <input
          type="url"
          value={rssUrl}
          onChange={(e) => onRssUrlChange(e.target.value)}
          placeholder="https://example.com/feed.rss"
          required
          className={inputClass}
        />
      </label>

      {/* Language / Program ID / Limit */}
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <SelectField
          label="Language"
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={onLanguageChange}
          className="mt-1"
        />

        {/* Program ID */}
        <div className={fieldClass}>
          <div className="flex items-center gap-2 mb-1">
            <span className={fieldLabelClass}>Program ID</span>
            {programSearched && programOptions.length > 0 && (
              <button
                type="button"
                className={textButtonClass}
                style={{ padding: 0, fontSize: "0.95em" }}
                onClick={onToggleInputMode}
              >
                {programInputMode === "select" ? "직접 입력" : "검색 결과"}
              </button>
            )}
          </div>
          <div className="flex gap-2 items-center">
            <div className="w-full">
              {programInputMode === "select" && programOptions.length > 0 ? (
                <SelectField
                  label=""
                  value={programId}
                  options={[
                    { value: "", label: "선택하세요" },
                    ...programOptions,
                  ]}
                  onChange={onProgramIdChange}
                  className="w-full"
                />
              ) : (
                <input
                  type="number"
                  value={programId}
                  onChange={(e) => onProgramIdChange(e.target.value)}
                  placeholder="직접 입력 또는 검색"
                  min={0}
                  className={`${inputClass} w-full`}
                />
              )}
            </div>
            <button
              type="button"
              className={ghostButtonClass}
              onClick={onProgramSearch}
              disabled={!rssUrl || isProgramSearching}
              style={{ whiteSpace: "nowrap" }}
            >
              {isProgramSearching ? "검색 중..." : "검색"}
            </button>
          </div>
        </div>

        {/* Limit */}
        <label className={fieldClass}>
          <span className={fieldLabelClass}>Limit</span>
          <input
            type="number"
            value={limit}
            onChange={(e) => onLimitChange(e.target.value)}
            min={1}
            max={50}
            className={inputClass}
          />
        </label>
      </div>

      {/* R2 폴더 */}
      <div className={fieldClass}>
        <span className={fieldLabelClass}>R2 폴더</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={r2Folder}
            onChange={(e) => onR2FolderChange(e.target.value)}
            placeholder="오디오 저장 폴더 경로"
            className={inputClass}
          />
          <button
            className={`${ghostButtonClass} whitespace-nowrap px-3 py-3 flex items-center justify-center text-sm`}
            type="button"
            onClick={() => {
              const url = `https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
                r2Folder.replace(/^\//, ""),
              )}%2F`;
              window.open(url, "_blank");
            }}
          >
            바로가기
          </button>
        </div>
      </div>

      {/* 자동화 옵션 */}
      <div className={fieldClass}>
        <div className="mb-1 flex items-center gap-2">
          <span className={fieldLabelClass}>자동 진행 설정</span>
          <button
            type="button"
            className={textButtonClass}
            style={{ padding: 0, fontSize: "0.95em" }}
            onClick={onSelectAllAutomation}
          >
            {automationToggleLabel}
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="inline-flex w-fit items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoConvertAudio}
              onChange={(e) => onAutoConvertAudioChange(e.target.checked)}
              className="w-5 h-5 rounded-lg border-2 border-panel-border bg-surface checked:bg-accent checked:border-accent transition-all accent-yellow-400"
            />
            <span className="text-[0.95rem] transition-colors text-ink group-hover:text-accent-strong">
              확장자 변환
            </span>
          </label>
          <label className="inline-flex w-fit items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoUploadToR2}
              onChange={(e) => onAutoUploadToR2Change(e.target.checked)}
              className="w-5 h-5 rounded-lg border-2 border-panel-border bg-surface checked:bg-accent checked:border-accent transition-all accent-yellow-400"
            />
            <span className="text-[0.95rem] transition-colors text-ink group-hover:text-accent-strong">
              R2 업로드
            </span>
          </label>
          <label className="inline-flex w-fit items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoSendToSupabase}
              onChange={(e) => onAutoSendToSupabaseChange(e.target.checked)}
              className="w-5 h-5 rounded-lg border-2 border-panel-border bg-surface checked:bg-accent checked:border-accent transition-all accent-yellow-400"
            />
            <span className="text-[0.95rem] transition-colors text-ink group-hover:text-accent-strong">
              Supabase 전송
            </span>
          </label>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex flex-wrap gap-3">
        <button
          className={primaryButtonClass}
          type="submit"
          disabled={isLoading}
        >
          {isLoading ? "처리 중..." : "에피소드 불러오기"}
        </button>
        <button className={ghostButtonClass} type="button" onClick={onReset}>
          초기화
        </button>
      </div>
    </form>
  );
}
