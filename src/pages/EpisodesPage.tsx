import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { LogEntry, LogTone, ParsedItem, ToastTone } from "../types";
import SelectField from "../components/SelectField";
import { buildItemsWithChannel } from "../utils/r2";
import { parseRss } from "../utils/rss";
import { buildSqlText, parseSqlToRows } from "../utils/sql";

type EpisodesPageProps = {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  status: string;
  setStatus: (value: string) => void;
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

const buildEpisodeFolder = (language: string) =>
  `/${language || "de"}-episodes-audio/program`;

const panelClass =
  "rounded-[26px] border border-panel-border bg-panel p-6 shadow-panel md:p-9";
const formClass = "grid gap-6";
const fieldClass = "grid gap-2 font-semibold";
const fieldLabelClass = "text-[0.9rem] text-ink-muted";
const inputClass =
  "w-full rounded-xl border border-panel-border bg-surface px-3.5 py-3 text-base text-ink focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)]";
const primaryButtonClass =
  "rounded-full border border-transparent bg-gradient-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60";
const ghostButtonClass =
  "rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60";
const textButtonClass =
  "text-[0.9rem] font-semibold text-accent-strong transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
const linkButtonClass =
  "text-[0.9rem] font-semibold text-accent-strong transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

const EpisodesPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
  setStatus,
}: EpisodesPageProps) => {
  const [rssUrl, setRssUrl] = useState("");
  const [programId, setProgramId] = useState("");
  const [language, setLanguage] = useState("de");
  const [limit, setLimit] = useState("4");
  const [channelTitle, setChannelTitle] = useState("");
  const [channelOverride, setChannelOverride] = useState("");
  const [r2Folder, setR2Folder] = useState(buildEpisodeFolder("de"));
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [sqlText, setSqlText] = useState("");
  const [originalSqlText, setOriginalSqlText] = useState("");
  const [originalItems, setOriginalItems] = useState<ParsedItem[]>([]);
  const [originalChannelTitle, setOriginalChannelTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [processState, setProcessState] = useState<{
    label: string;
    tone: "idle" | "working" | "success" | "error";
  }>({
    label: "대기 중",
    tone: "idle",
  });
  const [downloadProgress, setDownloadProgress] = useState<
    Record<string, number | null>
  >({});
  const [downloadSummary, setDownloadSummary] = useState({
    total: 0,
    completed: 0,
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
  }, [processState.tone, processState.label, showToast]);

  useEffect(() => {
    setR2Folder(buildEpisodeFolder(language));
  }, [language]);

  const updateProgress = (filename: string, value: number | null) => {
    setDownloadProgress((prev) => ({ ...prev, [filename]: value }));
  };

  const applyChanges = () => {
    const baseItems = originalItems.length ? originalItems : items;
    const updatedItems = buildItemsWithChannel(
      baseItems,
      channelOverride.trim() || channelTitle,
      r2Folder,
    );
    const programNumber = Number(programId) || 0;
    setChannelTitle(channelOverride.trim() || channelTitle);
    setItems(updatedItems);
    setSqlText(buildSqlText(updatedItems, programNumber, language));
  };

  const resetChannelOverride = () => {
    if (!originalItems.length) return;
    setChannelOverride(originalChannelTitle);
    setChannelTitle(originalChannelTitle);
    setItems(originalItems);
    setSqlText(originalSqlText);
    setR2Folder(buildEpisodeFolder(language));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setLogs([]);
    setProcess("RSS 요청 중", "working");
    setIsLoading(true);

    try {
      addLog("RSS 요청 중...", "action");
      const response = await fetch(
        `/api/rss?url=${encodeURIComponent(rssUrl)}`,
      );
      if (!response.ok) {
        throw new Error(`요청 실패: 상태 코드 ${response.status}.`);
      }
      const xmlText = await response.text();
      setProcess("RSS 파싱 중", "working");
      addLog("RSS 수신 완료. 파싱 중...", "info");
      const limitNumber = Math.max(1, Number(limit) || 1);
      const programNumber = Number(programId) || 0;
      const parsed = parseRss(
        xmlText,
        limitNumber,
        programNumber,
        language,
        r2Folder,
      );

      setChannelTitle(parsed.channelTitle);
      setChannelOverride(parsed.channelTitle);
      setItems(parsed.items);
      setSqlText(parsed.sqlText);
      setOriginalSqlText(parsed.sqlText);
      setOriginalItems(parsed.items);
      setOriginalChannelTitle(parsed.channelTitle);
      addLog(
        `'${parsed.channelTitle}' ${parsed.items.length}개 항목 파싱 완료.`,
        "success",
      );
      addLog("SQL 생성 완료.", "success");
      setProcess("SQL 생성 완료", "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류입니다.";
      setError(message);
      addLog(`오류: ${message}`, "error");
      setProcess("오류 발생", "error");
      setChannelTitle("");
      setChannelOverride("");
      setItems([]);
      setSqlText("");
      setOriginalSqlText("");
      setOriginalItems([]);
      setOriginalChannelTitle("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!sqlText) return;
    await navigator.clipboard.writeText(sqlText);
    setStatus("SQL을 클립보드에 복사했습니다.");
    window.setTimeout(() => setStatus(""), 2000);
  };

  const handleInsert = async () => {
    if (!authUserEmail) {
      showToast("로그인 후 전송할 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
    if (!sqlText.trim()) return;
    setError("");
    setStatus("");
    setIsSending(true);

    try {
      setProcess("Supabase 전송 중", "working");
      const rowsToInsert = parseSqlToRows(sqlText);
      addLog(`Supabase에 ${rowsToInsert.length}개 항목 전송 중...`, "action");
      const { error: insertError } = await supabase
        .from("episodes")
        .insert(rowsToInsert);
      if (insertError) {
        throw insertError;
      }
      setStatus(`Supabase에 ${rowsToInsert.length}개 항목을 추가했습니다.`);
      addLog("Supabase insert 완료.", "success");
      setProcess("Supabase 전송 완료", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "추가 실패.";
      setError(message);
      addLog(`Supabase insert 실패: ${message}`, "error");
      setProcess("Supabase 전송 실패", "error");
    } finally {
      setIsSending(false);
    }
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      setProcess("다운로드 중", "working");
      addLog(`다운로드 시작: ${filename}`, "action");
      updateProgress(filename, 0);
      const response = await fetch(
        `/api/download?url=${encodeURIComponent(url)}`,
      );
      if (!response.ok) {
        throw new Error(`다운로드 실패: 상태 코드 ${response.status}.`);
      }
      const totalBytes = Number(response.headers.get("content-length") || 0);
      if (!response.body || !totalBytes) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);
        updateProgress(filename, 100);
        addLog(`다운로드 완료: ${filename}`, "success");
        setProcess("다운로드 완료", "success");
        return true;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
          const percent = Math.min(
            100,
            Math.round((receivedBytes / totalBytes) * 100),
          );
          updateProgress(filename, percent);
        }
      }

      const blobParts: BlobPart[] = chunks.map(
        (chunk) => chunk.slice().buffer as ArrayBuffer,
      );
      const blob = new Blob(blobParts);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      addLog(`다운로드 완료: ${filename}`, "success");
      updateProgress(filename, 100);
      setProcess("다운로드 완료", "success");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패.";
      addLog(`다운로드 실패: ${filename} - ${message}`, "error");
      updateProgress(filename, null);
      setProcess("다운로드 실패", "error");
      return false;
    }
  };

  const handleDownloadAll = async () => {
    if (!items.length) return;
    setProcess("전체 다운로드 중", "working");
    addLog(`전체 다운로드 시작 (${items.length}개)`, "action");
    setDownloadSummary({ total: items.length, completed: 0 });
    let hasError = false;
    for (const item of items) {
      if (!item.audioUrl) {
        hasError = true;
        addLog(`다운로드 실패: ${item.filename} - 오디오 URL 없음`, "error");
        continue;
      }
      const ok = await downloadFile(item.audioUrl, item.filename);
      setDownloadSummary((prev) => ({
        total: prev.total,
        completed: prev.completed + 1,
      }));
      if (!ok) {
        hasError = true;
      }
    }
    addLog("전체 다운로드 완료", hasError ? "error" : "success");
    setProcess(
      hasError ? "다운로드 일부 실패" : "전체 다운로드 완료",
      hasError ? "error" : "success",
    );
  };

  return (
    <>
      <header className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="mb-3 text-[0.85rem] uppercase tracking-[0.26em] text-ink-muted">
            RSS → SQL + Supabase
          </p>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            RSS Episode Builder
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            RSS 주소를 넣고 프로그램과 언어를 고르면 SQL을 만들거나 Supabase로
            바로 전송할 수 있습니다.
          </p>
        </div>
      </header>

      <section className={panelClass}>
        <form className={formClass} onSubmit={handleSubmit}>
          <label className={fieldClass}>
            <span className={fieldLabelClass}>RSS URL</span>
            <input
              type="url"
              value={rssUrl}
              onChange={(event) => setRssUrl(event.target.value)}
              placeholder="https://example.com/feed.rss"
              required
              className={inputClass}
            />
          </label>
          <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            <label className={fieldClass}>
              <span className={fieldLabelClass}>Program ID</span>
              <input
                type="number"
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                placeholder="000"
                min={0}
                className={inputClass}
              />
            </label>
            <SelectField
              label="Language"
              value={language}
              options={LANGUAGE_OPTIONS}
              onChange={setLanguage}
            />
            <label className={fieldClass}>
              <span className={fieldLabelClass}>Limit</span>
              <input
                type="number"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                min={1}
                max={50}
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className={primaryButtonClass}
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? "처리 중..." : "SQL 생성"}
            </button>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={() => {
                setRssUrl("");
                setProgramId("0");
                setLanguage("de");
                setLimit("4");
                setR2Folder(buildEpisodeFolder("de"));
                setChannelTitle("");
                setChannelOverride("");
                setItems([]);
                setSqlText("");
                setOriginalItems([]);
                setOriginalChannelTitle("");
                setError("");
                setStatus("");
              }}
            >
              초기화
            </button>
          </div>
        </form>
        {error && (
          <div className="mt-4 rounded-[16px] border border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] p-4 text-[#742b2b]">
            {error}
          </div>
        )}
        {logs.length > 0 && (
          <div className="mt-6 grid gap-3 rounded-[18px] border border-panel-border bg-surface p-5">
            <div
              className="max-h-[260px] overflow-y-auto rounded-[16px] border border-[rgba(16,35,35,0.08)] bg-[#f6f4ef] p-4"
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
                        entry.tone === "action"
                          ? "bg-accent-strong"
                          : entry.tone === "success"
                            ? "bg-[rgba(120,210,160,0.9)]"
                            : entry.tone === "error"
                              ? "bg-[rgba(255,120,120,0.9)]"
                              : "bg-[rgba(16,35,35,0.35)]"
                      }`}
                    />
                    <p className="m-0 text-[0.9rem] text-ink">
                      {entry.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {processState.tone !== "idle" && (
          <div
            className={`mt-4 rounded-[16px] border p-4 ${
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
      </section>

      <section className={`${panelClass} grid gap-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2>에피소드 정보</h2>
            <p className="text-ink-muted">RSS 파싱 결과</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={ghostButtonClass}
              onClick={handleCopy}
              disabled={!sqlText}
            >
              SQL 복사
            </button>
            <button
              className={ghostButtonClass}
              onClick={handleDownloadAll}
              disabled={!items.length}
            >
              mp3 전체 다운로드
            </button>
            <button
              className={primaryButtonClass}
              onClick={handleInsert}
              disabled={!sqlText.trim() || isSending}
            >
              {isSending ? "전송 중..." : "Supabase로 전송"}
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <>
            <div className="mt-4 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-[min(320px,100%)] items-center gap-2">
                <span className="text-[0.9rem] font-semibold text-ink-muted">
                  채널 :
                </span>
                <input
                  className={`${inputClass} flex-1 min-w-[240px] md:min-w-[400px]`}
                  type="text"
                  value={channelOverride}
                  onChange={(event) => setChannelOverride(event.target.value)}
                  placeholder={channelTitle || "채널명"}
                />
              </div>
            </div>
            {downloadSummary.total > 0 && (
              <div className="rounded-full bg-[rgba(16,35,35,0.08)] px-3 py-1 text-[0.85rem] font-semibold text-ink">
                다운로드 {downloadSummary.completed}/{downloadSummary.total}
              </div>
            )}
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {items.map((item) => (
                <article
                  key={item.filename}
                  className="grid gap-4 rounded-[18px] border border-panel-border bg-surface p-5 animate-fadeInUp"
                >
                  <h3 className="text-[1.05rem] font-semibold">{item.title}</h3>
                  <dl className="grid gap-2.5">
                    <div>
                      <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted">
                        날짜
                      </dt>
                      <dd className="mt-1 font-semibold">{item.date}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted">
                        길이
                      </dt>
                      <dd className="mt-1 font-semibold">{item.duration}</dd>
                    </div>
                    <div>
                      <dt className="text-[0.7rem] uppercase tracking-[0.12em] text-ink-muted">
                        파일명
                      </dt>
                      <dd className="mt-1 font-semibold">{item.filename}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap items-center gap-4 text-[0.9rem]">
                    <a
                      className={textButtonClass}
                      href={item.audioUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      원본 오디오
                    </a>
                    <a
                      className={textButtonClass}
                      href={item.r2Url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      R2 확인
                    </a>
                    <button
                      className={linkButtonClass}
                      type="button"
                      onClick={() => downloadFile(item.audioUrl, item.filename)}
                      disabled={!item.audioUrl}
                    >
                      {downloadProgress[item.filename] != null
                        ? `다운로드 ${downloadProgress[item.filename]}%`
                        : "다운로드"}
                    </button>
                  </div>
                  {downloadProgress[item.filename] != null && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgba(16,35,35,0.1)]">
                        <span
                          className="block h-full bg-gradient-to-br from-accent to-accent-strong transition-[width] duration-200"
                          style={{
                            width: `${downloadProgress[item.filename]}%`,
                          }}
                        />
                      </div>
                      <span className="min-w-[42px] text-right text-[0.8rem] text-ink-muted">
                        {downloadProgress[item.filename]}%
                      </span>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="grid gap-4">
              <label className={`${fieldClass} max-w-[500px]`}>
                <span className={fieldLabelClass}>R2 폴더</span>
                <input
                  type="text"
                  value={r2Folder}
                  onChange={(event) => setR2Folder(event.target.value)}
                  placeholder="/de-episodes-audio/program"
                  className={inputClass}
                />
              </label>
              <div className="col-span-full flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className={ghostButtonClass}
                    type="button"
                    onClick={resetChannelOverride}
                    disabled={!originalItems.length}
                  >
                    원래대로
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    className={primaryButtonClass}
                    type="button"
                    onClick={applyChanges}
                  >
                    변경 반영
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 rounded-[18px] border border-panel-border bg-surface p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <h3>SQL 출력</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className={ghostButtonClass}
                    type="button"
                    onClick={() => {
                      setSqlText(originalSqlText);
                    }}
                    disabled={!originalSqlText}
                  >
                    원본으로 되돌리기
                  </button>
                  <span className="text-ink-muted">복사 전 편집 가능</span>
                </div>
              </div>
              <textarea
                className="min-h-[220px] rounded-[14px] border border-panel-border bg-[#0f1515] p-4 font-mono text-[0.9rem] text-[#e6f4f1]"
                value={sqlText}
                onChange={(event) => setSqlText(event.target.value)}
                placeholder="SQL이 여기에 표시됩니다."
              />
              <p className="m-0 text-[0.85rem] text-ink-muted">
                SQL 편집 내용이 Supabase 전송 데이터에 반영됩니다.
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-panel-border p-8 text-center text-ink-muted">
            피드를 실행하면 파싱된 항목이 표시됩니다.
          </div>
        )}
      </section>
    </>
  );
};

export default EpisodesPage;
