import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import SelectField from "../components/SelectField";
import { LANGUAGE_OPTIONS } from "../constants/language";
import { supabase } from "../lib/supabaseClient";
import type {
  BroadcastingOption,
  CategoryOption,
  LogEntry,
  LogTone,
  ParsedProgram,
  ToastTone,
} from "../types";
import { buildR2ImageUrl, sanitizePathSegment } from "../utils/r2";
import { parseProgramRss } from "../utils/rss";
import { buildProgramSqlText, parseProgramSqlToRows } from "../utils/sql";
import LogList from "../components/LogList";
import SqlOutput from "../components/SqlOutput";
import {
  fieldClass,
  fieldLabelClass,
  formClass,
  ghostButtonClass,
  inputClass,
  panelClass,
  primaryButtonClass,
  textButtonClass,
} from "../constants/style";
import {
  BASE_URL,
  DEFAULT_IMAGE_FOLDER,
  TYPE_OPTIONS,
} from "../constants/options";

type ProgramsPageProps = {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
};

const buildImageFolder = (language: string) =>
  language === "en"
    ? "/eng_images/program"
    : `/${language}_${DEFAULT_IMAGE_FOLDER}`;

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
  const [processState, setProcessState] = useState({
    label: "대기 중",
    tone: "idle" as "idle" | "working" | "success" | "error",
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
    if (!authUserEmail) {
      showToast("로그인 후 불러올 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
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
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            Program Builder
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            RSS에서 채널 정보를 가져와 programs 테이블에 추가합니다.
          </p>
        </div>
        <div className="flex-1">
          <div className="bg-panel rounded-[22px] p-[1.9rem] grid gap-4 border border-panel-border shadow-panel animate-[floatIn_0.8s_ease-out]">
            {[
              {
                step: "1",
                text: "RSS URL, Type, Language 입력 - Category / Broadcasting ID는 Language 기준으로 자동 조회 (선택 사항)",
              },
              {
                step: "2",
                text: "프로그램 불러오기 클릭 - RSS 채널 정보 파싱 후 SQL 자동 생성",
              },
              {
                step: "3",
                text: "정보 확인 및 수정 - 이미지 다운로드 → 변환/압축 → R2 폴더 바로가기 → 업로드 → R2 확인 → 변경 반영",
                details: [
                  "이미지 다운 실패 시 원본 보기 버튼으로 직접 다운로드",
                ],
              },
              {
                step: "4",
                text: "Supabase로 전송 - SQL 출력 콘솔 기준으로 programs 테이블에 insert",
              },
            ].map(({ step, text, details }) => (
              <div key={step} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-strong text-[0.7rem] font-bold text-[#111]">
                  {step}
                </span>
                <div className="grid gap-1.5">
                  <p className="m-0 text-[0.85rem] leading-relaxed text-ink-muted">
                    {text}
                  </p>
                  {details && (
                    <ul className="m-0 grid gap-1 pl-0">
                      {details.map((d) => (
                        <li
                          key={d}
                          className="flex items-start gap-2 text-[0.8rem] leading-relaxed text-ink-muted/70"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted/40" />
                          {d}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
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
        <LogList logs={logs} />
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
                    href={
                      programImageFolder === "/eng_images/program"
                        ? "https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=eng_images%2Fprogram%2F"
                        : `https://dash.cloudflare.com/?to=storage/r2/bucket/rss/${encodeURIComponent(programImageFolder.replace(/^\//, ""))}`
                    }
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

            <SqlOutput
              value={programSqlText}
              onChange={(event) => setProgramSqlText(event.target.value)}
            />
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
