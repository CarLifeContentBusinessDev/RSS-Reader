import { ghostButtonClass } from "../constants/style";

interface EpisodeSqlEditorProps {
  sqlText: string;
  originalSqlText: string;
  onChange: (value: string) => void;
  onRestore: () => void;
}

export function EpisodeSqlEditor({
  sqlText,
  originalSqlText,
  onChange,
  onRestore,
}: EpisodeSqlEditorProps) {
  return (
    <div className="grid gap-3 rounded-[18px] border border-panel-border bg-surface p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h3>SQL 출력</h3>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className={ghostButtonClass}
            type="button"
            onClick={onRestore}
            disabled={!originalSqlText}
          >
            원본으로 되돌리기
          </button>
          <span className="text-ink-muted">복사 전 편집 가능</span>
        </div>
      </div>
      <textarea
        className="min-h-55 rounded-[14px] border border-panel-border bg-[#0f1515] p-4 font-mono text-[0.9rem] text-[#e6f4f1]"
        value={sqlText}
        onChange={(e) => onChange(e.target.value)}
        placeholder="SQL이 여기에 표시됩니다."
      />
      <p className="m-0 text-[0.85rem] text-ink-muted">
        SQL 편집 내용이 Supabase 전송 데이터에 반영됩니다.
      </p>
    </div>
  );
}
