import { useMemo, useState } from "react";
import { GuidePanel } from "../components/GuidePanel";
import { ProcessStatus } from "../components/ProcessStatus";
import { MESSAGES } from "../constants/message";
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  panelClass,
  primaryButtonClass,
} from "../constants/style";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useProcessLog } from "../hooks/useProcessLog";
import type { ToastTone } from "../types";

interface AudioConvertPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

type RowStatus = "idle" | "working" | "success" | "error";

interface AudioRow {
  id: string;
  file: File;
  filename: string;
  targetFilename: string;
  folder: string;
  status: RowStatus;
  url?: string;
  error?: string;
}

const GUIDE_STEPS = [
  {
    step: "1",
    text: "오디오 파일 여러 개 선택 후 파일별 Cloudflare 경로를 지정합니다.",
  },
  {
    step: "2",
    text: "변환+업로드 실행 시 각 파일이 m4a로 변환되어 R2에 업로드됩니다.",
  },
  {
    step: "3",
    text: "완료된 행의 URL을 복사해 필요한 곳에 바로 사용할 수 있습니다.",
  },
];

const normalizeFolder = (folder: string) =>
  folder.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/g, "");

const baseNameToM4a = (name: string) => {
  if (!name.trim()) return "output.m4a";
  return name.replace(/\.[^.]+$/i, "").concat(".m4a");
};

const isSupportedMediaFile = (file: File) => {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("audio/") || mime === "video/mp4") {
    return true;
  }
  return /\.mp4$/i.test(file.name);
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("파일 읽기 실패"));
        return;
      }
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("base64 인코딩 실패"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("파일 읽기 실패"));
    reader.readAsDataURL(file);
  });

const AudioConvertPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: AudioConvertPageProps) => {
  const [rows, setRows] = useState<AudioRow[]>([]);
  const [defaultFolder, setDefaultFolder] = useState("episodes-audio/m4a");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { logs, processState, addLog, setProcess, clearLogs } = useProcessLog({
    showToast,
  });
  const { guard } = useAuthGuard({ authUserEmail, onRequireLogin, showToast });

  const summary = useMemo(() => {
    const total = rows.length;
    const success = rows.filter((row) => row.status === "success").length;
    const failed = rows.filter((row) => row.status === "error").length;
    return { total, success, failed };
  }, [rows]);

  const updateRow = (id: string, patch: Partial<AudioRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const handleFilesChange = (files: FileList | null) => {
    if (!files?.length) return;

    const nextRows: AudioRow[] = Array.from(files)
      .filter((file) => isSupportedMediaFile(file))
      .map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        filename: file.name,
        targetFilename: baseNameToM4a(file.name),
        folder: normalizeFolder(defaultFolder),
        status: "idle",
      }));

    if (!nextRows.length) {
      showToast("오디오 파일 또는 mp4 파일만 선택할 수 있습니다.", "error");
      return;
    }

    setRows((prev) => [...prev, ...nextRows]);
    addLog(`파일 추가: ${nextRows.length}개`, "action");
  };

  const handleApplyDefaultFolder = () => {
    const nextFolder = defaultFolder.trim();
    setRows((prev) => prev.map((row) => ({ ...row, folder: nextFolder })));
    addLog(`기본 경로 일괄 적용: ${nextFolder}`, "info");
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleReset = () => {
    setRows([]);
    setIsSubmitting(false);
    clearLogs();
  };

  const handleSubmit = () => {
    guard(MESSAGES.LOGIN_REQUIRED_FETCH, async () => {
      if (!rows.length) {
        showToast("오디오 파일을 먼저 추가해주세요.", "error");
        return;
      }

      setIsSubmitting(true);
      clearLogs();
      setProcess("변환+업로드 중", "working");
      addLog(`변환+업로드 시작 (${rows.length}개)`, "action");

      let hasError = false;

      // 메모리 사용량을 낮추기 위해 순차 처리
      for (const row of rows) {
        try {
          updateRow(row.id, {
            status: "working",
            error: undefined,
            url: undefined,
          });

          const base64 = await readFileAsBase64(row.file);
          const res = await fetch("/api/convertAndUploadAudio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              file: base64,
              originalFilename: row.filename,
              filename: row.targetFilename,
              folder: normalizeFolder(row.folder),
            }),
          });

          if (!res.ok) {
            const errorPayload = await res
              .json()
              .catch(() => ({ error: "변환/업로드 실패" }));
            throw new Error(errorPayload.details || errorPayload.error);
          }

          const data: { url?: string } = await res.json();
          if (!data.url) {
            throw new Error("URL 응답이 없습니다.");
          }

          updateRow(row.id, { status: "success", url: data.url });
          addLog(`완료: ${row.targetFilename}`, "success");
        } catch (error) {
          hasError = true;
          const message =
            error instanceof Error ? error.message : "변환/업로드 실패";
          updateRow(row.id, { status: "error", error: message });
          addLog(`실패: ${row.targetFilename} - ${message}`, "error");
        }
      }

      setProcess(
        hasError ? "일부 변환/업로드 실패" : "변환+업로드 완료",
        hasError ? "error" : "success",
      );
      setIsSubmitting(false);
    });
  };

  return (
    <>
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            Audio Convert & Upload
          </h1>
          <p className="text-ink-muted m-0">
            로컬 오디오 파일을 m4a로 변환하고 Cloudflare R2에 업로드합니다.
          </p>
        </div>
        <GuidePanel guide_steps={GUIDE_STEPS} />
      </header>

      <section className={`${panelClass} grid gap-8`}>
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-4">
            <label className={fieldClass}>
              <span className={fieldLabelClass}>
                오디오 파일 (여러 개 선택 가능)
              </span>
              <input
                className={inputClass}
                type="file"
                accept="audio/*,video/mp4,.mp4"
                multiple
                onChange={(event) => {
                  handleFilesChange(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <label className={fieldClass}>
                <span className={fieldLabelClass}>
                  기본 Cloudflare 폴더 경로
                </span>
                <input
                  className={inputClass}
                  value={defaultFolder}
                  onChange={(event) => setDefaultFolder(event.target.value)}
                  placeholder="episodes-audio/m4a"
                />
              </label>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={handleApplyDefaultFolder}
                disabled={!rows.length || isSubmitting}
              >
                전체 경로 적용
              </button>
              <button
                className={ghostButtonClass}
                type="button"
                onClick={handleReset}
                disabled={isSubmitting}
              >
                초기화
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-panel-border bg-surface p-4 text-sm text-ink-muted">
          전체 {summary.total}개 · 성공 {summary.success}개 · 실패{" "}
          {summary.failed}개
        </div>

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-panel-border">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-[rgba(255,255,255,0.6)] text-ink-muted">
                <tr>
                  <th className="border-b border-panel-border px-3 py-2 text-left">
                    파일명
                  </th>
                  <th className="border-b border-panel-border px-3 py-2 text-left">
                    업로드 폴더
                  </th>
                  <th className="border-b border-panel-border px-3 py-2 text-left">
                    변환 파일명
                  </th>
                  <th className="border-b border-panel-border px-3 py-2 text-left">
                    상태
                  </th>
                  <th className="border-b border-panel-border px-3 py-2 text-left">
                    결과 URL
                  </th>
                  <th className="border-b border-panel-border px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="border-b border-panel-border px-3 py-3 break-all">
                      {row.filename}
                    </td>
                    <td className="border-b border-panel-border px-3 py-3">
                      <input
                        className={`${inputClass} py-2`}
                        value={row.folder}
                        onChange={(event) =>
                          updateRow(row.id, {
                            folder: event.target.value,
                          })
                        }
                        disabled={isSubmitting}
                        placeholder="episodes-audio/m4a"
                      />
                    </td>
                    <td className="border-b border-panel-border px-3 py-3">
                      <input
                        className={`${inputClass} py-2`}
                        value={row.targetFilename}
                        onChange={(event) =>
                          updateRow(row.id, {
                            targetFilename: baseNameToM4a(event.target.value),
                          })
                        }
                        disabled={isSubmitting}
                      />
                    </td>
                    <td className="border-b border-panel-border px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          row.status === "success"
                            ? "bg-[rgba(120,210,160,0.25)] text-[#245c3d]"
                            : row.status === "error"
                              ? "bg-[rgba(255,120,120,0.2)] text-[#742b2b]"
                              : row.status === "working"
                                ? "bg-[rgba(242,201,76,0.25)] text-[#6b4d00]"
                                : "bg-[rgba(16,35,35,0.1)] text-ink-muted"
                        }`}
                      >
                        {row.status === "idle"
                          ? "대기"
                          : row.status === "working"
                            ? "처리 중"
                            : row.status === "success"
                              ? "완료"
                              : "실패"}
                      </span>
                      {row.error && (
                        <p className="mt-2 mb-0 text-xs text-[#742b2b] break-all">
                          {row.error}
                        </p>
                      )}
                    </td>
                    <td className="border-b border-panel-border px-3 py-3">
                      {row.url ? (
                        <div className="grid gap-2">
                          <a
                            href={row.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent-strong hover:text-accent break-all"
                          >
                            {row.url}
                          </a>
                          <button
                            type="button"
                            className="justify-self-start rounded-full border border-panel-border px-3 py-1 text-xs font-semibold text-ink cursor-pointer"
                            onClick={() => {
                              void navigator.clipboard.writeText(row.url ?? "");
                              showToast("링크를 복사했습니다.", "success");
                            }}
                          >
                            링크 복사
                          </button>
                        </div>
                      ) : (
                        <span className="text-ink-muted">-</span>
                      )}
                    </td>
                    <td className="border-b border-panel-border px-3 py-3 text-right">
                      <button
                        className="rounded-full border border-panel-border px-3 py-1.5 text-xs font-semibold text-ink cursor-pointer"
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={isSubmitting}
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <button
            className={primaryButtonClass}
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !rows.length}
          >
            {isSubmitting ? "변환+업로드 중..." : "변환+업로드 실행"}
          </button>
        </div>

        <ProcessStatus logs={logs} processState={processState} />
      </section>
    </>
  );
};

export default AudioConvertPage;
