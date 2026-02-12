import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { DEFAULT_IMAGE_FOLDER, BASE_URL } from "../config/constants";
import { supabase } from "../lib/supabaseClient";
import type { LogEntry, LogTone, ParsedProgram, ToastTone } from "../types";
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
  `/${language || "de"}_${DEFAULT_IMAGE_FOLDER}`;

const ProgramsPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: ProgramsPageProps) => {
  const [programRssUrl, setProgramRssUrl] = useState("");
  const [programLanguage, setProgramLanguage] = useState("de");
  const [programType, setProgramType] = useState("podcast");
  const [programImageFolder, setProgramImageFolder] = useState(
    buildImageFolder("de"),
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
    if (processState.tone === "success") {
      showToast(`✓ ${processState.label}`, "success");
    } else if (processState.tone === "error") {
      showToast(`✗ ${processState.label}`, "error");
    }
  }, [processState.tone, processState.label]);

  useEffect(() => {
    setProgramImageFolder(buildImageFolder(programLanguage));
  }, [programLanguage]);

  const updateProgramSqlFromFields = () => {
    const nextImgUrl = buildR2ImageUrl(
      programTitle,
      programSourceImgUrl || programImgUrl,
      BASE_URL,
      programImageFolder,
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
      const nextImgUrl = buildR2ImageUrl(
        parsed.title,
        parsed.imgUrl,
        BASE_URL,
        nextFolder,
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

  const handleProgramReset = () => {
    if (!programOriginal) return;
    setProgramTitle(programOriginal.title);
    setProgramSubtitle(programOriginal.subtitle);
    setProgramCategoryId("");
    setProgramBroadcastingId("");
    setProgramSourceImgUrl(programOriginal.imgUrl);
    const nextFolder = buildImageFolder(programLanguage);
    setProgramImageFolder(nextFolder);
    const resetImgUrl = buildR2ImageUrl(
      programOriginal.title,
      programOriginal.imgUrl,
      BASE_URL,
      nextFolder,
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
      <header className="hero">
        <div>
          <p className="eyebrow">RSS → SQL + Supabase</p>
          <h1>Program Builder</h1>
          <p className="subhead">
            RSS에서 채널 정보를 가져와 programs 테이블에 추가합니다.
          </p>
        </div>
        <div className="hero-card">
          <div className="metric">
            <span className="metric-label">Storage</span>
            <strong className="metric-value">R2 public URLs</strong>
          </div>
          <div className="metric">
            <span className="metric-label">Mode</span>
            <strong className="metric-value">Client Only</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <form className="form" onSubmit={handleProgramSubmit}>
          <label className="field">
            <span>RSS URL</span>
            <input
              type="url"
              value={programRssUrl}
              onChange={(event) => setProgramRssUrl(event.target.value)}
              placeholder="https://example.com/feed.rss"
              required
            />
          </label>
          <div className="field-row">
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
            <label className="field">
              <span>Category ID</span>
              <input
                type="number"
                value={programCategoryId}
                onChange={(event) =>
                  setProgramCategoryId(
                    event.target.value ? Number(event.target.value) : "",
                  )
                }
                placeholder="선택사항"
              />
            </label>
            <label className="field">
              <span>Broadcasting ID</span>
              <input
                type="number"
                value={programBroadcastingId}
                onChange={(event) =>
                  setProgramBroadcastingId(
                    event.target.value ? Number(event.target.value) : "",
                  )
                }
                placeholder="선택사항"
              />
            </label>
          </div>
          <div className="actions">
            <button
              className="primary"
              type="submit"
              disabled={programIsLoading}
            >
              {programIsLoading ? "처리 중..." : "프로그램 불러오기"}
            </button>
            <button
              className="ghost"
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
        {programError && <div className="error">{programError}</div>}
        {logs.length > 0 && (
          <div className="log-panel">
            <div className="log-body" aria-live="polite">
              <div className="log-list">
                {logs.map((log) => (
                  <div key={log.id} className={`log-item ${log.tone}`}>
                    <span className="log-dot" />
                    <p>{log.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {processState.tone !== "idle" && (
          <div className={`status status-${processState.tone}`}>
            {processState.tone === "success" && "✓ 완료"}
            {processState.tone === "error" && "✗ 실패"}
            {processState.tone === "working" && "처리 중..."}
          </div>
        )}
        {programInsertResult && (
          <div className="status status-success">{programInsertResult}</div>
        )}
      </section>

      <section className="panel results">
        <div className="panel-header">
          <div>
            <h2>프로그램 정보</h2>
            <p className="muted">RSS 채널 메타데이터</p>
          </div>
          <div className="header-actions">
            <button
              className="ghost"
              type="button"
              onClick={handleProgramReset}
              disabled={!programOriginal}
            >
              원래대로
            </button>
            <button
              className="primary"
              onClick={handleProgramInsert}
              disabled={!programSqlText.trim() || programIsSending}
            >
              {programIsSending ? "전송 중..." : "Supabase로 전송"}
            </button>
          </div>
        </div>

        {programTitle ? (
          <>
            <div className="program-grid">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "1rem",
                }}
              >
                <label className="field">
                  <span>제목</span>
                  <input
                    type="text"
                    value={programTitle}
                    onChange={(event) => setProgramTitle(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>부제</span>
                  <input
                    type="text"
                    value={programSubtitle}
                    onChange={(event) => setProgramSubtitle(event.target.value)}
                  />
                </label>
              </div>
              <div className="field readonly span-2">
                <span>원본 이미지 URL</span>
                <span className="readonly-value">
                  {programSourceImgUrl || "-"}
                </span>
              </div>
              <label className="field">
                <span>R2 폴더</span>
                <input
                  type="text"
                  value={programImageFolder}
                  onChange={(event) =>
                    setProgramImageFolder(event.target.value)
                  }
                  placeholder={buildImageFolder(programLanguage)}
                />
              </label>
              <div className="program-actions span-2">
                <div className="program-actions-left">
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => downloadImage(programSourceImgUrl)}
                    disabled={!programSourceImgUrl}
                  >
                    이미지 다운로드
                  </button>
                  <a
                    className="ghost"
                    href="https://bigconvert.11zon.com/ko/png-to-webp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    webp 변환
                  </a>
                  <a
                    className="ghost"
                    href="https://imagecompressor.11zon.com/ko/compress-webp"
                    target="_blank"
                    rel="noreferrer"
                  >
                    webp 압축
                  </a>
                  {programSourceImgUrl && (
                    <a
                      className="text-button"
                      href={programSourceImgUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      원본 보기
                    </a>
                  )}
                  {programImgUrl && (
                    <a
                      className="text-button"
                      href={programImgUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      R2 확인
                    </a>
                  )}
                </div>
                <div className="program-actions-right">
                  <button
                    className="primary"
                    type="button"
                    onClick={applyR2ImageUrl}
                    disabled={!programTitle}
                  >
                    변경 반영
                  </button>
                </div>
              </div>
            </div>

            <div className="sql-block">
              <div className="sql-header">
                <h3>SQL 출력</h3>
                <span className="muted">복사 전 편집 가능</span>
              </div>
              <textarea
                value={programSqlText}
                onChange={(event) => setProgramSqlText(event.target.value)}
                placeholder="SQL이 여기에 표시됩니다."
              />
              <p className="hint">
                SQL 편집 내용이 Supabase 전송 데이터에 반영됩니다.
              </p>
            </div>
          </>
        ) : (
          <div className="empty">
            프로그램 RSS URL을 입력하고 프로그램 불러오기를 실행하면 결과가
            표시됩니다.
          </div>
        )}
      </section>
    </>
  );
};

export default ProgramsPage;
