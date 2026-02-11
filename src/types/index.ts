export type EpisodeRow = {
  title: string;
  program_id: number;
  audio_file: string;
  date: string;
  duration: string;
  language: string[];
};

export type ProgramRow = {
  title: string;
  subtitle: string;
  img_url: string;
  type: string;
  language: string[];
  category_id?: number;
};

export type ParsedItem = {
  title: string;
  audioUrl: string;
  date: string;
  duration: string;
  filename: string;
  r2Url: string;
};

export type ParsedProgram = {
  title: string;
  subtitle: string;
  imgUrl: string;
};

export type LogTone = "info" | "success" | "error" | "action";

export type LogEntry = {
  id: string;
  message: string;
  tone: LogTone;
};

export type ToastTone = "info" | "success" | "error";

export type ProcessTone = "idle" | "working" | "success" | "error";

export type ProcessState = {
  label: string;
  tone: ProcessTone;
};
