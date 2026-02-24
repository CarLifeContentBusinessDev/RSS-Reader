// 공통 타입 분리 (리팩토링용)

export type ToastTone = "info" | "success" | "error";

export interface ParsedProgram {
  title: string;
  subtitle: string;
  imgUrl: string;
}

export interface CategoryOption {
  value: string;
  label: string;
}

export interface BroadcastingOption {
  value: string;
  label: string;
}

export interface LogEntry {
  id: string;
  message: string;
  tone: "info" | "action" | "success" | "error";
}
