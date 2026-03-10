import type { FormEvent } from "react";
import SelectField from "./SelectField";
import { LANGUAGE_OPTIONS } from "../constants/language";
import { TYPE_OPTIONS } from "../constants/options";
import type { BroadcastingOption, CategoryOption } from "../types";
import {
  fieldClass,
  formClass,
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  fieldLabelClass,
} from "../constants/style";

interface ProgramFetchFormProps {
  rssUrl: string;
  type: string;
  language: string;
  imageFolder: string;
  categoryId: number | "";
  broadcastingId: number | "";
  categoryOptions: CategoryOption[];
  broadcastingOptions: BroadcastingOption[];
  optionsLoading: boolean;
  isLoading: boolean;
  autoUploadToR2: boolean;
  autoSendToSupabase: boolean;
  hasProgram: boolean;
  onRssUrlChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onImageFolderChange: (v: string) => void;
  onCategoryChange: (v: number | "") => void;
  onBroadcastingChange: (v: number | "") => void;
  onAutoUploadChange: (v: boolean) => void;
  onAutoSendChange: (v: boolean) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}

export function ProgramFetchForm({
  rssUrl,
  type,
  language,
  imageFolder,
  categoryId,
  broadcastingId,
  categoryOptions,
  broadcastingOptions,
  optionsLoading,
  isLoading,
  autoUploadToR2,
  autoSendToSupabase,
  hasProgram,
  onRssUrlChange,
  onTypeChange,
  onLanguageChange,
  onImageFolderChange,
  onCategoryChange,
  onBroadcastingChange,
  onAutoUploadChange,
  onAutoSendChange,
  onSubmit,
  onReset,
}: ProgramFetchFormProps) {
  const defaultFolder =
    language === "en" ? "/eng_images/program" : `/${language}_images/program`;
  return (
    <form className={formClass} onSubmit={onSubmit}>
      {/* RSS URL */}
      <label className={fieldClass}>
        <span className="text-[0.9rem] text-ink-muted">RSS URL</span>
        <input
          type="url"
          value={rssUrl}
          onChange={(e) => onRssUrlChange(e.target.value)}
          placeholder="https://example.com/feed.rss"
          required
          className={inputClass}
        />
      </label>

      {/* Type / Language / Category / Broadcasting */}
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <SelectField
          label="Type"
          value={type}
          options={TYPE_OPTIONS}
          onChange={onTypeChange}
        />
        <SelectField
          label="Language"
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={onLanguageChange}
        />
        <SelectField
          label={`Category ID${optionsLoading ? " (로딩 중...)" : ""}`}
          value={categoryId === "" ? "" : String(categoryId)}
          options={[{ value: "", label: "선택 안 함" }, ...categoryOptions]}
          onChange={(val) => onCategoryChange(val === "" ? "" : Number(val))}
        />
        <SelectField
          label={`Broadcasting ID${optionsLoading ? " (로딩 중...)" : ""}`}
          value={broadcastingId === "" ? "" : String(broadcastingId)}
          options={[{ value: "", label: "선택 안 함" }, ...broadcastingOptions]}
          onChange={(val) =>
            onBroadcastingChange(val === "" ? "" : Number(val))
          }
        />
      </div>

      {/* R2 폴더 */}
      <div className={fieldClass}>
        <span className={fieldLabelClass}>R2 폴더</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={imageFolder}
            onChange={(e) => onImageFolderChange(e.target.value)}
            placeholder={defaultFolder}
            className={inputClass}
          />
          <button
            className={`${ghostButtonClass} whitespace-nowrap px-3 py-3 flex items-center justify-center text-sm`}
            type="button"
            onClick={() => {
              const url =
                imageFolder === "/eng_images/program"
                  ? "https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=eng_images%2Fprogram%2F"
                  : `https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
                      imageFolder.replace(/^\//, ""),
                    )}%2F`;
              window.open(url, "_blank");
            }}
          >
            바로가기
          </button>
        </div>
      </div>

      {/* 자동화 설정 */}
      <div className={fieldClass}>
        <span className={fieldLabelClass}>자동 진행 설정</span>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoUploadToR2}
              onChange={(e) => onAutoUploadChange(e.target.checked)}
              disabled={hasProgram}
              className="w-5 h-5 rounded-lg border-2 border-panel-border bg-surface checked:bg-accent checked:border-accent transition-all accent-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              className={`text-[0.95rem] transition-colors ${hasProgram ? "text-ink-muted" : "text-ink group-hover:text-accent-strong"}`}
            >
              R2 업로드
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={autoSendToSupabase}
              onChange={(e) => onAutoSendChange(e.target.checked)}
              disabled={hasProgram}
              className="w-5 h-5 rounded-lg border-2 border-panel-border bg-surface checked:bg-accent checked:border-accent transition-all accent-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span
              className={`text-[0.95rem] transition-colors ${hasProgram ? "text-ink-muted" : "text-ink group-hover:text-accent-strong"}`}
            >
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
          {isLoading ? "처리 중..." : "프로그램 불러오기"}
        </button>
        <button className={ghostButtonClass} type="button" onClick={onReset}>
          초기화
        </button>
      </div>
    </form>
  );
}
