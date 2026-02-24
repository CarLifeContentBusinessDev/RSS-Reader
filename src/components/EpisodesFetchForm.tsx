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
  programOptions: { value: string; label: string }[];
  programSearched: boolean;
  programInputMode: "input" | "select";
  isProgramSearching: boolean;
  isLoading: boolean;
  onRssUrlChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onProgramIdChange: (v: string) => void;
  onLimitChange: (v: string) => void;
  onProgramSearch: () => void;
  onToggleInputMode: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}

export function EpisodesFetchForm({
  rssUrl,
  language,
  programId,
  limit,
  programOptions,
  programSearched,
  programInputMode,
  isProgramSearching,
  isLoading,
  onRssUrlChange,
  onLanguageChange,
  onProgramIdChange,
  onLimitChange,
  onProgramSearch,
  onToggleInputMode,
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
