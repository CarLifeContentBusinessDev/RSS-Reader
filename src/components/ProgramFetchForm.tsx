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
} from "../constants/style";

interface ProgramFetchFormProps {
  rssUrl: string;
  type: string;
  language: string;
  categoryId: number | "";
  broadcastingId: number | "";
  categoryOptions: CategoryOption[];
  broadcastingOptions: BroadcastingOption[];
  optionsLoading: boolean;
  isLoading: boolean;
  onRssUrlChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onCategoryChange: (v: number | "") => void;
  onBroadcastingChange: (v: number | "") => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}

export function ProgramFetchForm({
  rssUrl,
  type,
  language,
  categoryId,
  broadcastingId,
  categoryOptions,
  broadcastingOptions,
  optionsLoading,
  isLoading,
  onRssUrlChange,
  onTypeChange,
  onLanguageChange,
  onCategoryChange,
  onBroadcastingChange,
  onSubmit,
  onReset,
}: ProgramFetchFormProps) {
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
