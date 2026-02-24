import React from "react";
import type { LogEntry } from "../types";

interface LogListProps {
  logs: LogEntry[];
}

const LogList: React.FC<LogListProps> = ({ logs }) => {
  if (!logs.length) return null;
  return (
    <div className="mt-6 grid gap-3 rounded-[18px] border border-panel-border bg-surface p-5">
      <div
        className="max-h-65 overflow-y-auto rounded-2xl border border-[rgba(16,35,35,0.08)] bg-[#f6f4ef] p-4"
        aria-live="polite"
      >
        <div className="grid gap-2.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className="grid grid-cols-[14px_1fr] items-start gap-2.5 rounded-xl border border-[rgba(16,35,35,0.08)] bg-white p-3 shadow-[0_8px_16px_rgba(16,35,35,0.06)]"
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                  log.tone === "action"
                    ? "bg-accent-strong"
                    : log.tone === "success"
                      ? "bg-[rgba(120,210,160,0.9)]"
                      : log.tone === "error"
                        ? "bg-[rgba(255,120,120,0.9)]"
                        : "bg-[rgba(16,35,35,0.35)]"
                }`}
              />
              <span className="text-[0.95rem] text-ink break-all">
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LogList;
