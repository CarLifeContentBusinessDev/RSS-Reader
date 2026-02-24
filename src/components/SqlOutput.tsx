import React from "react";

interface SqlOutputProps {
  value: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}

const SqlOutput: React.FC<SqlOutputProps> = ({
  value,
  onChange,
  placeholder,
}) => (
  <div className="grid gap-3 rounded-[18px] border border-panel-border bg-surface p-6">
    <textarea
      className="min-h-55 rounded-[14px] border border-panel-border bg-[#0f1515] p-4 font-mono text-[0.9rem] text-[#e6f4f1]"
      value={value}
      onChange={onChange}
      placeholder={placeholder || "SQL이 여기에 표시됩니다."}
    />
    <p className="m-0 text-[0.85rem] text-ink-muted">
      SQL 편집 내용이 Supabase 전송 데이터에 반영됩니다.
    </p>
  </div>
);

export default SqlOutput;
