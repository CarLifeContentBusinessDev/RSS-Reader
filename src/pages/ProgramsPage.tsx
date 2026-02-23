import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { BASE_URL, DEFAULT_IMAGE_FOLDER } from "../config/constants";
import { supabase } from "../lib/supabaseClient";
import type {
  BroadcastingOption,
  CategoryOption,
  LogEntry,
  LogTone,
  ParsedProgram,
  ToastTone,
} from "../types";
import SelectField from "../components/SelectField";
import { buildR2ImageUrl, sanitizePathSegment } from "../utils/r2";
import { parseProgramRss } from "../utils/rss";
import { buildProgramSqlText, parseProgramSqlToRows } from "../utils/sql";

type ProgramsPageProps = {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
};

const LANGUAGE_OPTIONS = [
  { value: "ko", label: "ko (한국)" },
  { value: "en", label: "en (미국)" },
  { value: "de", label: "de (독일)" },
  { value: "jp", label: "jp (일본)" },
  { value: "gb", label: "gb (영국)" },
  { value: "fr", label: "fr (프랑스)" },
  { value: "es", label: "es (스페인)" },
  { value: "it", label: "it (이탈리아)" },
];

const TYPE_OPTIONS = [
  { value: "podcast", label: "podcast" },
  { value: "radio", label: "radio" },
];

const buildImageFolder = (language: string) =>
  language === "en"
    ? "/eng_images/program"
    : `/${language}_${DEFAULT_IMAGE_FOLDER}`;

const panelClass =
  "rounded-[26px] border border-panel-border bg-panel p-6 shadow-panel md:p-9";
const formClass = "grid gap-6";
const fieldClass = "grid gap-2 font-semibold";
const fieldLabelClass = "text-[0.9rem] text-ink-muted";
const inputClass =
  "w-full rounded-xl border border-panel-border bg-surface px-3.5 py-3 text-base text-ink focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)]";
const primaryButtonClass =
  "rounded-full border border-transparent bg-linear-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60";
const ghostButtonClass =
  "rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60";
const textButtonClass =
  "text-[0.9rem] font-semibold text-accent-strong transition hover:text-accent";

const ProgramsPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: ProgramsPageProps) => {
  const [programRssUrl, setProgramRssUrl] = useState("");
  const [programLanguage, setProgramLanguage] = useState("ko");
  const [programType, setProgramType] = useState("podcast");
  const [programImageFolder, setProgramImageFolder] = useState(
    buildImageFolder("ko"),
  );
  const [programTitle, setProgramTitle] = useState("");
  const [programSubtitle, setProgramSubtitle] = useState("");
  const [programCategoryId, setProgramCategoryId] = useState<number | "">("");
  const [programBroadcastingId, setProgramBroadcastingId] = useState<
    number | ""
  >("");
  const [programImgUrl, setProgramImgUrl] = useState("");
  const [programSourceImgUrl, setProgramSourceImgUrl] = useState("");
  const [programSqlText, setProgramSqlText] = useState("");
  const [programOriginalSql, setProgramOriginalSql] = useState("");
  const [programOriginal, setProgramOriginal] = useState<ParsedProgram | null>(
    null,
  );
  const [programIsLoading, setProgramIsLoading] = useState(false);
  const [programIsSending, setProgramIsSending] = useState(false);
  const [programError, setProgramError] = useState("");
  const [programInsertResult, setProgramInsertResult] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [processState, setProcessState] = useState<{
    label: string;
    tone: "idle" | "working" | "success" | "error";
  }>({
    label: "대기 중",
    tone: "idle",
  });
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [broadcastingOptions, setBroadcastingOptions] = useState<
    BroadcastingOption[]
  >([]);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const lastToastKeyRef = useRef<string | null>(null);

  const addLog = (message: string, tone: LogTone = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      message: `${timestamp} · ${message}`,
      tone,
    };
    setLogs((prev) => [...prev, entry]);
  };

  const setProcess = (
    label: string,
    tone: "idle" | "working" | "success" | "error",
  ) => {
    setProcessState({ label, tone });
  };

  useEffect(() => {
    if (processState.tone !== "success" && processState.tone !== "error") {
      return;
    }

    const toastKey = `${processState.tone}:${processState.label}`;
    if (lastToastKeyRef.current === toastKey) {
      return;
    }

    lastToastKeyRef.current = toastKey;
    if (processState.tone === "success") {
      showToast(`✓ ${processState.label}`, "success");
    } else {
      showToast(`✗ ${processState.label}`, "error");
    }
  }, [processState.tone, processState.label, showToast]);

  useEffect(() => {
    setProgramImageFolder(buildImageFolder(programLanguage));
  }, [programLanguage]);

  const updateProgramSqlFromFields = () => {
    const nextImgUrl = buildR2ImageUrl(
      programTitle,
      BASE_URL,
      programImageFolder,
      "webp",
      programLanguage,
    );
    setProgramImgUrl(nextImgUrl);
    const nextProgram = {
      title: programTitle.trim() || "제목 없음",
      subtitle: programSubtitle.trim(),
      imgUrl: nextImgUrl,
    };
    setProgramSqlText(
      buildProgramSqlText(
        nextProgram,
        programType,
        programLanguage,
        programCategoryId || undefined,
        programBroadcastingId || undefined,
      ),
    );
  };

  const handleProgramSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProgramError("");
    setLogs([]);
    setProgramInsertResult("");
    setProcess("RSS 요청 중", "working");
    setProgramIsLoading(true);

    try {
      addLog("RSS 요청 중...", "action");
      const response = await fetch(
        `/api/rss?url=${encodeURIComponent(programRssUrl)}`,
      );
      if (!response.ok) {
        throw new Error(`요청 실패: 상태 코드 ${response.status}.`);
      }
      const xmlText = await response.text();
      setProcess("RSS 파싱 중", "working");
      addLog("RSS 수신 완료. 파싱 중...", "info");
      const parsed = parseProgramRss(xmlText);
      setProgramTitle(parsed.title);
      setProgramSubtitle(parsed.subtitle);
      setProgramSourceImgUrl(parsed.imgUrl);
      const nextFolder = buildImageFolder(programLanguage);
      setProgramImageFolder(nextFolder);
      // 원본 이미지에서 확장자 추출
      let ext = "webp";
      if (parsed.imgUrl) {
        const urlName = parsed.imgUrl.split("/").pop()?.split("?")[0] || "";
        const extCandidate = urlName.split(".").pop();
        if (extCandidate && extCandidate.length <= 5) ext = extCandidate;
      }
      const nextImgUrl = buildR2ImageUrl(
        parsed.title,
        BASE_URL,
        nextFolder,
        ext,
        programLanguage,
      );
      setProgramImgUrl(nextImgUrl);
      setProgramOriginal(parsed);
      const sql = buildProgramSqlText(
        { ...parsed, imgUrl: nextImgUrl },
        programType,
        programLanguage,
        programCategoryId || undefined,
        programBroadcastingId || undefined,
      );
      setProgramSqlText(sql);
      setProgramOriginalSql(sql);
      addLog(`프로그램 '${parsed.title}' 파싱 완료.`, "success");
      addLog("SQL 생성 완료.", "success");
      setProcess("SQL 생성 완료", "success");
    } catch (err) {
      let message = "오류 발생";
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "object" && err !== null) {
        const errObj = err as Record<string, unknown>;
        const parts = [];
        if (errObj.message) parts.push(errObj.message as string);
        if (errObj.details) parts.push(`(${errObj.details})`);
        if (errObj.hint) parts.push(`[${errObj.hint}]`);
        if (parts.length > 0) {
          message = parts.join(" ");
        }
      }
      setProgramError(message);
      addLog(`오류: ${message}`, "error");
      setProcess("오류 발생", "error");
      setProgramTitle("");
      setProgramSubtitle("");
      setProgramCategoryId("");
      setProgramBroadcastingId("");
      setProgramImgUrl("");
      setProgramSourceImgUrl("");
      setProgramImageFolder(buildImageFolder(programLanguage));
      setProgramSqlText("");
      setProgramOriginalSql("");
      setProgramOriginal(null);
    } finally {
      setProgramIsLoading(false);
    }
  };

  const handleProgramInsert = async () => {
    if (!authUserEmail) {
      showToast("로그인 후 전송할 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
    if (!programSqlText.trim()) return;
    setProgramError("");
    setProgramInsertResult("");
    setProgramIsSending(true);
    setProcess("Supabase 전송 중", "working");

    try {
      const rowsToInsert = parseProgramSqlToRows(programSqlText);
      addLog(
        `Supabase에 ${rowsToInsert.length}개 프로그램 전송 중...`,
        "action",
      );
      const { data, error: insertError } = await supabase
        .from("programs")
        .insert(rowsToInsert)
        .select("id");
      if (insertError) {
        throw insertError;
      }
      addLog("Supabase insert 완료.", "success");
      if (data?.length) {
        const ids = data
          .map((row) => String(row.id))
          .filter((value) => value !== "undefined" && value !== "null")
          .join(", ");
        addLog(`생성된 ID: ${ids}`, "success");
        setProgramInsertResult(`program_id : ${ids}`);
      }
      setProcess("Supabase 전송 완료", "success");
    } catch (err) {
      let message = "추가 실패";
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "object" && err !== null) {
        const errObj = err as Record<string, unknown>;
        const parts = [];
        if (errObj.message) parts.push(errObj.message as string);
        if (errObj.details) parts.push(`(${errObj.details})`);
        if (errObj.hint) parts.push(`[${errObj.hint}]`);
        if (parts.length > 0) {
          message = parts.join(" ");
        }
      }
      setProgramError(message);
      setProgramInsertResult("");
      addLog(`Supabase insert 실패: ${message}`, "error");
      setProcess("Supabase 전송 실패", "error");
      showToast(message, "error");
    } finally {
      setProgramIsSending(false);
    }
  };

  useEffect(() => {
    const fetchOptions = async () => {
      setOptionsLoading(true);
      try {
        const [{ data: cats }, { data: broads }] = await Promise.all([
          supabase
            .from("categories")
            .select("id, title")
            .contains("language", [programLanguage])
            .order("id"),
          supabase
            .from("broadcastings")
            .select("id, title")
            .contains("language", [programLanguage])
            .order("id"),
        ]);

        setCategoryOptions(
          (cats ?? []).map((row) => ({
            value: String(row.id),
            label: `${row.id} · ${row.title}`,
          })),
        );
        setBroadcastingOptions(
          (broads ?? []).map((row) => ({
            value: String(row.id),
            label: `${row.id} · ${row.title}`,
          })),
        );
      } finally {
        setOptionsLoading(false);
      }
      // language 바뀌면 선택값 초기화
      setProgramCategoryId("");
      setProgramBroadcastingId("");
    };

    fetchOptions();
  }, [programLanguage]);

  const handleProgramReset = () => {
    if (!programOriginal) return;
    setProgramTitle(programOriginal.title);
    setProgramSubtitle(programOriginal.subtitle);
    setProgramCategoryId("");
    setProgramBroadcastingId("");
    setProgramSourceImgUrl(programOriginal.imgUrl);
    const nextFolder = buildImageFolder(programLanguage);
    setProgramImageFolder(nextFolder);
    // 원본 이미지에서 확장자 추출
    let ext = "webp";
    if (programOriginal.imgUrl) {
      const urlName =
        programOriginal.imgUrl.split("/").pop()?.split("?")[0] || "";
      const extCandidate = urlName.split(".").pop();
      if (extCandidate && extCandidate.length <= 5) ext = extCandidate;
    }
    const resetImgUrl = buildR2ImageUrl(
      programOriginal.title,
      BASE_URL,
      nextFolder,
      ext,
    );
    setProgramImgUrl(resetImgUrl);
    setProgramSqlText(programOriginalSql);
  };

  const downloadImage = async (url: string) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`다운로드 실패: 상태 코드 ${response.status}.`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const fallbackName = "channel-image";
      const urlName = url.split("/").pop()?.split("?")[0] || fallbackName;
      const extCandidate = urlName.split(".").pop() || "webp";
      const safeTitle = sanitizePathSegment(programTitle) || fallbackName;
      const filename = safeTitle ? `${safeTitle}.${extCandidate}` : urlName;
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패.";
      showToast(message, "error");
    }
  };

  const applyR2ImageUrl = () => {
    updateProgramSqlFromFields();
  };

  return (
    <>
      <header className="grid gap-8 ">
        <div>
          <p className="mb-3 text-[0.85rem] uppercase tracking-[0.26em] text-ink-muted">
            RSS → SQL + Supabase
          </p>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            Program Builder
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            RSS에서 채널 정보를 가져와 programs 테이블에 추가합니다.
          </p>
        </div>
      </header>

      <section className={panelClass}>
        <form className={formClass} onSubmit={handleProgramSubmit}>
          <label className={fieldClass}>
            <span className={fieldLabelClass}>RSS URL</span>
            <input
              type="url"
              value={programRssUrl}
              onChange={(event) => setProgramRssUrl(event.target.value)}
              placeholder="https://example.com/feed.rss"
              required
              className={inputClass}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            <SelectField
              label="Type"
              value={programType}
              options={TYPE_OPTIONS}
              onChange={setProgramType}
            />
            <SelectField
              label="Language"
              value={programLanguage}
              options={LANGUAGE_OPTIONS}
              onChange={setProgramLanguage}
            />
            <SelectField
              label={`Category ID${optionsLoading ? " (로딩 중...)" : ""}`}
              value={programCategoryId === "" ? "" : String(programCategoryId)}
              options={[{ value: "", label: "선택 안 함" }, ...categoryOptions]}
              onChange={(val) =>
                setProgramCategoryId(val === "" ? "" : Number(val))
              }
            />
            <SelectField
              label={`Broadcasting ID${optionsLoading ? " (로딩 중...)" : ""}`}
              value={
                programBroadcastingId === ""
                  ? ""
                  : String(programBroadcastingId)
              }
              options={[
                { value: "", label: "선택 안 함" },
                ...broadcastingOptions,
              ]}
              onChange={(val) =>
                setProgramBroadcastingId(val === "" ? "" : Number(val))
              }
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className={primaryButtonClass}
              type="submit"
              disabled={programIsLoading}
            >
              {programIsLoading ? "처리 중..." : "프로그램 불러오기"}
            </button>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={() => {
                setProgramRssUrl("");
                setProgramType("podcast");
                setProgramLanguage("de");
                setProgramImageFolder(buildImageFolder("de"));
                setProgramTitle("");
                setProgramSubtitle("");
                setProgramCategoryId("");
                setProgramBroadcastingId("");
                setProgramImgUrl("");
                setProgramSourceImgUrl("");
                setProgramSqlText("");
                setProgramOriginalSql("");
                setProgramOriginal(null);
                setProgramError("");
                setProgramInsertResult("");
                setLogs([]);
              }}
            >
              초기화
            </button>
          </div>
        </form>
        {programError && (
          <div className="mt-4 rounded-2xl border border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] p-4 text-[#742b2b]">
            {programError}
          </div>
        )}
        {logs.length > 0 && (
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
                    <p className="m-0 text-[0.9rem] text-ink">{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {processState.tone !== "idle" && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              processState.tone === "success"
                ? "border-[rgba(120,210,160,0.45)] bg-[rgba(120,210,160,0.2)] text-[#245c3d]"
                : processState.tone === "error"
                  ? "border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] text-[#742b2b]"
                  : "border-[rgba(242,201,76,0.4)] bg-[rgba(242,201,76,0.2)] text-[#6b4d00]"
            }`}
          >
            {processState.tone === "success" && "✓ 완료"}
            {processState.tone === "error" && "✗ 실패"}
            {processState.tone === "working" && "처리 중..."}
          </div>
        )}
        {programInsertResult && (
          <div className="mt-4 rounded-2xl border border-[rgba(120,210,160,0.45)] bg-[rgba(120,210,160,0.2)] p-4 text-[#245c3d]">
            {programInsertResult}
          </div>
        )}
      </section>

      <section className={`${panelClass} grid gap-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2>프로그램 정보</h2>
            <p className="text-ink-muted">RSS 채널 메타데이터</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={ghostButtonClass}
              type="button"
              onClick={handleProgramReset}
              disabled={!programOriginal}
            >
              원래대로
            </button>
            <button
              className={primaryButtonClass}
              onClick={handleProgramInsert}
              disabled={!programSqlText.trim() || programIsSending}
            >
              {programIsSending ? "전송 중..." : "Supabase로 전송"}
            </button>
          </div>
        </div>

        {programTitle ? (
          <>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>제목</span>
                  <input
                    type="text"
                    value={programTitle}
                    onChange={(event) => setProgramTitle(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className={fieldClass}>
                  <span className={fieldLabelClass}>부제</span>
                  <input
                    type="text"
                    value={programSubtitle}
                    onChange={(event) => setProgramSubtitle(event.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
              <div className="col-span-full grid gap-2">
                <span className="text-[0.9rem] font-semibold text-ink-muted">
                  원본 이미지 URL
                </span>
                <span className="rounded-xl border border-panel-border bg-surface p-3.5 text-[0.95rem] text-ink">
                  {programSourceImgUrl || "-"}
                </span>
              </div>
              <label className={fieldClass}>
                <span className={fieldLabelClass}>R2 폴더</span>
                <input
                  type="text"
                  value={programImageFolder}
                  onChange={(event) =>
                    setProgramImageFolder(event.target.value)
                  }
                  placeholder={buildImageFolder(programLanguage)}
                  className={inputClass}
                />
              </label>
              <div className="col-span-full flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    className={ghostButtonClass}
                    href={`https://dash.cloudflare.com/?to=storage/r2/bucket/rss/${encodeURIComponent(programImageFolder.replace(/^\//, ""))}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    R2 폴더 바로가기
                  </a>
                  <button
                    className={ghostButtonClass}
                    type="button"
                    onClick={() => downloadImage(programSourceImgUrl)}
                    disabled={!programSourceImgUrl}
                  >
                    이미지 다운로드
                  </button>

                  {programSourceImgUrl && (
                    <a
                      className={textButtonClass}
                      href={programSourceImgUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      원본 보기
                    </a>
                  )}
                  {programImgUrl && (
                    <a
                      className={textButtonClass}
                      href={programImgUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      R2 확인
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={applyR2ImageUrl}
                    disabled={!programTitle}
                  >
                    변경 반영
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[18px] border border-panel-border bg-surface p-6">
              <div className="flex items-center justify-between gap-4">
                <h3>SQL 출력</h3>
                <span className="text-ink-muted">복사 전 편집 가능</span>
              </div>
              <textarea
                className="min-h-55 rounded-[14px] border border-panel-border bg-[#0f1515] p-4 font-mono text-[0.9rem] text-[#e6f4f1]"
                value={programSqlText}
                onChange={(event) => setProgramSqlText(event.target.value)}
                placeholder="SQL이 여기에 표시됩니다."
              />
              <p className="m-0 text-[0.85rem] text-ink-muted">
                SQL 편집 내용이 Supabase 전송 데이터에 반영됩니다.
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-panel-border p-8 text-center text-ink-muted">
            프로그램 RSS URL을 입력하고 프로그램 불러오기를 실행하면 결과가
            표시됩니다.
          </div>
        )}
      </section>
    </>
  );
};

export default ProgramsPage;
