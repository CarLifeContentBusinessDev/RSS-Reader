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
  const [isEditingChannel, setIsEditingChannel] = useState(false);
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
  }, [processState.tone, processState.label]);

  useEffect(() => {
    setR2Folder(buildEpisodeFolder(language));
  }, [language]);

  const updateProgress = (filename: string, value: number | null) => {
    setDownloadProgress((prev) => ({ ...prev, [filename]: value }));
  };

  const applyChannelOverride = () => {
    const trimmed = channelOverride.trim();
    const nextChannelTitle = trimmed || originalChannelTitle || channelTitle;
    if (!nextChannelTitle) return;
    const baseItems = originalItems.length ? originalItems : items;
    const updatedItems = buildItemsWithChannel(
      baseItems,
      nextChannelTitle,
      r2Folder,
    );
    const programNumber = Number(programId) || 0;
    setChannelTitle(nextChannelTitle);
    setItems(updatedItems);
    setSqlText(buildSqlText(updatedItems, programNumber, language));
    setIsEditingChannel(false);
  };

  const resetChannelOverride = () => {
    if (!originalItems.length) return;
    setChannelOverride(originalChannelTitle);
    setChannelTitle(originalChannelTitle);
    setItems(originalItems);
    setSqlText(originalSqlText);
    setIsEditingChannel(false);
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
      setIsEditingChannel(false);
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
      setIsEditingChannel(false);
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
      <header className="hero">
        <div>
          <p className="eyebrow">RSS → SQL + Supabase</p>
          <h1>RSS Episode Builder</h1>
          <p className="subhead">
            RSS 주소를 넣고 프로그램과 언어를 고르면 SQL을 만들거나 Supabase로
            바로 전송할 수 있습니다.
          </p>
        </div>
        <div className="hero-card">
          <div className="metric">
            <span className="metric-label">Storage</span>
            <strong className="metric-value">R2 public URLs</strong>
          </div>
          <div className="metric">
            <span className="metric-label">Mode</span>
            <strong className="metric-value">Client-only</strong>
          </div>
        </div>
      </header>

      <section className="panel">
        <form className="form" onSubmit={handleSubmit}>
          <label className="field">
            <span>RSS URL</span>
            <input
              type="url"
              value={rssUrl}
              onChange={(event) => setRssUrl(event.target.value)}
              placeholder="https://example.com/feed.rss"
              required
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Program ID</span>
              <input
                type="number"
                value={programId}
                onChange={(event) => setProgramId(event.target.value)}
                placeholder="000"
                min={0}
              />
            </label>
            <SelectField
              label="Language"
              value={language}
              options={LANGUAGE_OPTIONS}
              onChange={setLanguage}
            />
            <label className="field">
              <span>Limit</span>
              <input
                type="number"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                min={1}
                max={50}
              />
            </label>
          </div>
          <div className="actions">
            <button className="primary" type="submit" disabled={isLoading}>
              {isLoading ? "처리 중..." : "SQL 생성"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setRssUrl("");
                setProgramId("0");
                setLanguage("de");
                setLimit("4");
                setR2Folder(buildEpisodeFolder("de"));
                setChannelTitle("");
                setChannelOverride("");
                setIsEditingChannel(false);
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
        {error && <div className="error">{error}</div>}
        {logs.length > 0 && (
          <div className="log-panel">
            <div className="log-body" aria-live="polite">
              <div className="log-list">
                {logs.map((entry) => (
                  <div key={entry.id} className={`log-item ${entry.tone}`}>
                    <span className="log-dot" />
                    <p>{entry.message}</p>
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
      </section>

      <section className="panel results">
        <div className="panel-header">
          <div>
            <h2>에피소드 정보</h2>
            <p className="muted">RSS 파싱 결과</p>
          </div>
          <div className="header-actions">
            <button className="ghost" onClick={handleCopy} disabled={!sqlText}>
              SQL 복사
            </button>
            <button
              className="ghost"
              onClick={handleDownloadAll}
              disabled={!items.length}
            >
              mp3 전체 다운로드
            </button>
            <button
              className="primary"
              onClick={handleInsert}
              disabled={!sqlText.trim() || isSending}
            >
              {isSending ? "전송 중..." : "Supabase로 전송"}
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <>
            <label className="field">
              <span>R2 폴더</span>
              <input
                type="text"
                value={r2Folder}
                onChange={(event) => setR2Folder(event.target.value)}
                placeholder="/de-episodes-audio/program"
              />
            </label>
            <div className="channel-editor">
              <div className="channel-row">
                <span className="channel-prefix">채널 : </span>
                {!isEditingChannel ? (
                  <span className="channel-value">
                    {channelTitle || "아직 불러온 피드가 없습니다."}
                  </span>
                ) : (
                  <input
                    className="channel-input"
                    type="text"
                    value={channelOverride}
                    onChange={(event) => setChannelOverride(event.target.value)}
                    placeholder="예: Eine Stunde History"
                  />
                )}
              </div>
              <div className="channel-actions">
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setIsEditingChannel((prev) => !prev)}
                >
                  {isEditingChannel ? "수정 취소" : "편집"}
                </button>
                {isEditingChannel && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={applyChannelOverride}
                  >
                    일괄 적용
                  </button>
                )}
                <button
                  className="text-button"
                  type="button"
                  onClick={resetChannelOverride}
                  disabled={!originalItems.length}
                >
                  원래대로
                </button>
              </div>
            </div>
            {downloadSummary.total > 0 && (
              <div className="download-summary">
                다운로드 {downloadSummary.completed}/{downloadSummary.total}
              </div>
            )}
            <div className="items-grid">
              {items.map((item) => (
                <article key={item.filename} className="item-card">
                  <h3>{item.title}</h3>
                  <dl>
                    <div>
                      <dt>날짜</dt>
                      <dd>{item.date}</dd>
                    </div>
                    <div>
                      <dt>길이</dt>
                      <dd>{item.duration}</dd>
                    </div>
                    <div>
                      <dt>파일명</dt>
                      <dd>{item.filename}</dd>
                    </div>
                  </dl>
                  <div className="item-links">
                    <a
                      className="text-button"
                      href={item.audioUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      원본 오디오
                    </a>
                    <a
                      className="text-button"
                      href={item.r2Url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      R2 확인
                    </a>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => downloadFile(item.audioUrl, item.filename)}
                      disabled={!item.audioUrl}
                    >
                      {downloadProgress[item.filename] != null
                        ? `다운로드 ${downloadProgress[item.filename]}%`
                        : "다운로드"}
                    </button>
                    <a href={item.r2Url} target="_blank" rel="noreferrer">
                      R2 주소
                    </a>
                  </div>
                  {downloadProgress[item.filename] != null && (
                    <div className="download-progress">
                      <div className="progress-bar">
                        <span
                          style={{
                            width: `${downloadProgress[item.filename]}%`,
                          }}
                        />
                      </div>
                      <span className="progress-text">
                        {downloadProgress[item.filename]}%
                      </span>
                    </div>
                  )}
                </article>
              ))}
            </div>

            <div className="sql-block">
              <div className="sql-header">
                <h3>SQL 출력</h3>
                <div className="header-actions">
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => {
                      setSqlText(originalSqlText);
                    }}
                    disabled={!originalSqlText}
                  >
                    원본으로 되돌리기
                  </button>
                  <span className="muted">복사 전 편집 가능</span>
                </div>
              </div>
              <textarea
                value={sqlText}
                onChange={(event) => setSqlText(event.target.value)}
                placeholder="SQL이 여기에 표시됩니다."
              />
              <p className="hint">
                SQL 편집 내용이 Supabase 전송 데이터에 반영됩니다.
              </p>
            </div>
          </>
        ) : (
          <div className="empty">피드를 실행하면 파싱된 항목이 표시됩니다.</div>
        )}
      </section>
    </>
  );
};

export default EpisodesPage;
