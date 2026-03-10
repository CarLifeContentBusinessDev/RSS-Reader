import { useEffect, useState } from "react";
import type { LogEntry, LogTone, ToastTone } from "../types";

export type ProcessTone = "idle" | "working" | "success" | "error";

interface ProcessState {
  label: string;
  tone: ProcessTone;
}

interface UseProcessLogOptions {
  showToast: (message: string, tone?: ToastTone) => void;
}

export function useProcessLog({ showToast }: UseProcessLogOptions) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [processState, setProcessState] = useState<ProcessState>({
    label: "대기 중",
    tone: "idle",
  });

  // 프로세스가 success / error 로 바뀌면 토스트 알림
  useEffect(() => {
    if (processState.tone === "success") {
      showToast(`✓ ${processState.label}`, "success");
    } else if (processState.tone === "error") {
      showToast(`✗ ${processState.label}`, "error");
    }
    // showToast는 안정적인 참조라고 가정 (부모에서 useCallback 권장)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processState.tone, processState.label]);

  const addLog = (message: string, tone: LogTone = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      message: `${timestamp} · ${message}`,
      tone,
    };
    setLogs((prev) => [...prev, entry]);
  };

  const setProcess = (label: string, tone: ProcessTone) => {
    setProcessState({ label, tone });
  };

  const resetProcess = () =>
    setProcessState({
      label: "대기 중",
      tone: "idle",
    });

  const clearLogs = () => {
    setLogs([]);
    resetProcess();
  };

  return { logs, processState, addLog, setProcess, clearLogs, resetProcess };
}
