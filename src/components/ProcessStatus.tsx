import { useState } from "react";
import type { LogEntry } from "../types";
import type { ProcessTone } from "../hooks/useProcessLog";

interface ProcessStatusProps {
  logs: LogEntry[];
  processState: { label: string; tone: ProcessTone };
  error?: string;
  successInfo?: string;
}

const LOG_DOT_COLOR: Record<string, string> = {
  action: "bg-accent-strong",
  success: "bg-[rgba(120,210,160,0.9)]",
  error: "bg-[rgba(255,120,120,0.9)]",
  info: "bg-[rgba(16,35,35,0.35)]",
};

const PROCESS_STYLE: Record<
  Exclude<ProcessTone, "idle">,
  { border: string; bg: string; text: string }
> = {
  success: {
    border: "border-[rgba(120,210,160,0.45)]",
    bg: "bg-[rgba(120,210,160,0.2)]",
    text: "text-[#245c3d]",
  },
  error: {
    border: "border-[rgba(255,120,120,0.4)]",
    bg: "bg-[rgba(255,120,120,0.18)]",
    text: "text-[#742b2b]",
  },
  working: {
    border: "border-[rgba(242,201,76,0.4)]",
    bg: "bg-[rgba(242,201,76,0.2)]",
    text: "text-[#6b4d00]",
  },
};

const PROCESS_ICON: Record<Exclude<ProcessTone, "idle">, string> = {
  success: "✓ 완료",
  error: "✗ 실패",
  working: "처리 중...",
};

export function ProcessStatus({
  logs,
  processState,
  error,
  successInfo,
}: ProcessStatusProps) {
  const [showLogs, setShowLogs] = useState(false);
  const effectiveTone: Exclude<ProcessTone, "idle"> | null =
    processState.tone !== "idle" ? processState.tone : error ? "error" : null;
  const failureReason =
    effectiveTone === "error" ? error || processState.label : "";

  return (
    <>
      {/* 프로세스 상태 배너 */}
      {effectiveTone && (
        <div
          className={`mt-4 rounded-2xl border p-4 flex items-center justify-between gap-4 ${
            PROCESS_STYLE[effectiveTone]?.border
          } ${PROCESS_STYLE[effectiveTone]?.bg} ${
            PROCESS_STYLE[effectiveTone]?.text
          }`}
        >
          <div className="flex-1 flex items-center gap-2">
            <div>{PROCESS_ICON[effectiveTone]}</div>
            {effectiveTone === "error" && failureReason && (
              <div className="text-sm opacity-95">{failureReason}</div>
            )}
            {successInfo && effectiveTone === "success" && (
              <div className="text-sm opacity-90">{successInfo}</div>
            )}
          </div>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="text-xs opacity-70 hover:opacity-100 transition-opacity"
            >
              {showLogs ? "▲ 숨기기" : "▼ 상세"}
            </button>
          )}
        </div>
      )}

      {/* 로그 패널 */}
      {logs.length > 0 && showLogs && (
        <div className="mt-3 grid gap-3 rounded-[18px] border border-panel-border bg-surface p-5">
          <div
            className="max-h-65 overflow-y-auto rounded-2xl border border-[rgba(16,35,35,0.08)] bg-[#f6f4ef] p-4"
            aria-live="polite"
          >
            <div className="grid gap-2.5">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[14px_1fr] items-start gap-2.5 rounded-xl border border-[rgba(16,35,35,0.08)] bg-white p-3 shadow-[0_8px_16px_rgba(16,35,35,0.06)]"
                >
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 rounded-full ${
                      LOG_DOT_COLOR[entry.tone] ?? LOG_DOT_COLOR.info
                    }`}
                  />
                  <p className="m-0 text-[0.9rem] text-ink">{entry.message}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
