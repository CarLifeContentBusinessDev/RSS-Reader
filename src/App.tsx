import type { FormEvent } from "react";
import { useState } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";

const BASE_URL =
  "https://pub-a45bc992c0594356a8d32a71510a246b.r2.dev/de-episodes-audio/program";
const ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd";

type EpisodeRow = {
  title: string;
  program_id: number;
  audio_file: string;
  date: string;
  duration: string;
  language: string[];
};

type ParsedItem = {
  title: string;
  audioUrl: string;
  date: string;
  duration: string;
  filename: string;
  r2Url: string;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatDateYYMMDD = (date: Date) => {
  const year = String(date.getFullYear()).slice(-2);
  return `${year}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
};

const formatDuration = (rawVal: string | number | null) => {
  try {
    if (!rawVal) return "00:00";
    const rawStr = String(rawVal).trim();

    let totalSeconds = 0;
    if (rawStr.includes(":")) {
      const parts = rawStr.split(":").map((part) => Number(part));
      if (parts.some((part) => Number.isNaN(part))) return "00:00";

      if (parts.length === 3) {
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        totalSeconds = parts[0] * 60 + parts[1];
      } else {
        return "00:00";
      }
    } else {
      totalSeconds = Number(rawStr);
    }

    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    }
    return `${pad2(minutes)}:${pad2(seconds)}`;
  } catch {
    return "00:00";
  }
};

const parseRss = (
  xmlText: string,
  limit: number,
  programId: number,
  language: string,
) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const parseError = doc.querySelector("parsererror");

  if (parseError) {
    throw new Error("Invalid XML response.");
  }

  const channelTitleRaw =
    doc.querySelector("channel > title")?.textContent?.trim() || "Untitled";
  const channelTitle = channelTitleRaw.replace(/[\\/*?:"<>|]/g, "").trim();

  const itemNodes = Array.from(doc.querySelectorAll("channel item")).slice(
    0,
    limit,
  );

  const items: ParsedItem[] = itemNodes.map((item, index) => {
    const title =
      item.querySelector("title")?.textContent?.trim() || "Untitled";
    const enclosure = item.querySelector("enclosure");
    const audioUrl = enclosure?.getAttribute("url") || "";
    const pubDateRaw = item.querySelector("pubDate")?.textContent || "";
    const parsedDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const safeDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;
    const date = formatDateYYMMDD(safeDate);

    const durationNode = item.getElementsByTagNameNS(ITUNES_NS, "duration")[0];
    const durationRaw = durationNode?.textContent || "0";
    const duration = formatDuration(durationRaw);

    const extCandidate = audioUrl.split(".").pop()?.split("?")[0] || "mp3";
    const ext = extCandidate.length > 4 ? "mp3" : extCandidate || "mp3";
    const filename = `${channelTitle}-${index + 1}.${ext}`;
    const r2Url = `${BASE_URL}/${encodeURIComponent(
      channelTitle,
    )}/${encodeURIComponent(filename)}`;

    return { title, audioUrl, date, duration, filename, r2Url };
  });

  const sqlLines = items.map((entry, index) => {
    const safeTitle = entry.title.replace(/'/g, "''");
    const isLast = index === items.length - 1;
    return `('${safeTitle}', ${programId}, '${entry.r2Url}', '${entry.date}', '${entry.duration}', ARRAY['${language}'])${isLast ? "" : ","}`;
  });

  const sqlText =
    items.length === 0
      ? ""
      : `INSERT INTO episodes\n  (title, program_id, audio_file, date, duration, language)\nVALUES\n${sqlLines.join("\n")};`;

  const rows: EpisodeRow[] = items.map((entry) => ({
    title: entry.title,
    program_id: programId,
    audio_file: entry.r2Url,
    date: entry.date,
    duration: entry.duration,
    language: [language],
  }));

  return { channelTitle, items, sqlText, rows };
};

function App() {
  const [rssUrl, setRssUrl] = useState(
    "https://cdn.audiorella.com/podcasts/1750-dick-doof/feed.rss",
  );
  const [programId, setProgramId] = useState("408");
  const [language, setLanguage] = useState("de");
  const [limit, setLimit] = useState("4");
  const [channelTitle, setChannelTitle] = useState("");
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [rows, setRows] = useState<EpisodeRow[]>([]);
  const [sqlText, setSqlText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setLogs([]);
    setIsLoading(true);

    try {
      addLog("RSS feed 요청 중...");
      const response = await fetch(rssUrl);
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}.`);
      }
      const xmlText = await response.text();
      addLog("RSS 수신 완료. 파싱 중...");
      const limitNumber = Math.max(1, Number(limit) || 1);
      const programNumber = Number(programId) || 0;
      const parsed = parseRss(xmlText, limitNumber, programNumber, language);

      setChannelTitle(parsed.channelTitle);
      setItems(parsed.items);
      setRows(parsed.rows);
      setSqlText(parsed.sqlText);
      addLog(
        `'${parsed.channelTitle}' ${parsed.items.length}개 항목 파싱 완료.`,
      );
      addLog("SQL 생성 완료.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(message);
      addLog(`오류: ${message}`);
      setChannelTitle("");
      setItems([]);
      setRows([]);
      setSqlText("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!sqlText) return;
    await navigator.clipboard.writeText(sqlText);
    setStatus("SQL copied to clipboard.");
    window.setTimeout(() => setStatus(""), 2000);
  };

  const handleInsert = async () => {
    if (!rows.length) return;
    setError("");
    setStatus("");
    setIsSending(true);

    try {
      addLog(`Supabase에 ${rows.length}개 항목 전송 중...`);
      const { error: insertError } = await supabase
        .from("episodes")
        .insert(rows);
      if (insertError) {
        throw insertError;
      }
      setStatus(`Inserted ${rows.length} rows into Supabase.`);
      addLog("Supabase insert 완료.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Insert failed.";
      setError(message);
      addLog(`Supabase insert 실패: ${message}`);
    } finally {
      setIsSending(false);
    }
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      addLog(`다운로드 시작: ${filename}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Download failed with ${response.status}.`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      addLog(`다운로드 완료: ${filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Download failed.";
      addLog(`다운로드 실패: ${filename} - ${message}`);
    }
  };

  const handleDownloadAll = async () => {
    if (!items.length) return;
    addLog(`전체 다운로드 시작 (${items.length}개)`);
    for (const item of items) {
      if (item.audioUrl) {
        await downloadFile(item.audioUrl, item.filename);
      }
    }
    addLog("전체 다운로드 완료");
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">RSS to SQL + Supabase</p>
          <h1>Podcast Episode Builder</h1>
          <p className="subhead">
            Paste a feed URL, pick program and language, then generate SQL or
            push directly to Supabase.
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
            <span>RSS feed URL</span>
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
                min={0}
              />
            </label>
            <label className="field">
              <span>Language code</span>
              <input
                type="text"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                placeholder="de"
                maxLength={5}
              />
            </label>
            <label className="field">
              <span>Item limit</span>
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
              {isLoading ? "Processing..." : "Generate SQL"}
            </button>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setRssUrl("");
                setProgramId("0");
                setLanguage("");
                setLimit("4");
                setChannelTitle("");
                setItems([]);
                setRows([]);
                setSqlText("");
                setError("");
                setStatus("");
              }}
            >
              Reset
            </button>
          </div>
        </form>

        <div className="notice">
          <strong>Heads up:</strong> Some feeds block browser requests with
          CORS. Use a proxy or a tiny backend if you see errors.
        </div>
        <div className="log-panel">
          <div className="log-header">
            <h3>Processing Log</h3>
            <span className="muted">실시간 상태 표시</span>
          </div>
          <div className="log-body" aria-live="polite">
            {logs.length ? (
              logs.map((entry, index) => (
                <p key={`${entry}-${index}`}>{entry}</p>
              ))
            ) : (
              <p className="muted">아직 실행 로그가 없습니다.</p>
            )}
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        {status && <div className="status">{status}</div>}
      </section>

      <section className="panel results">
        <div className="panel-header">
          <div>
            <h2>Parsed Items</h2>
            <p className="muted">
              {channelTitle
                ? `Channel: ${channelTitle}`
                : "No feed loaded yet."}
            </p>
          </div>
          <div className="header-actions">
            <button className="ghost" onClick={handleCopy} disabled={!sqlText}>
              Copy SQL
            </button>
            <button
              className="ghost"
              onClick={handleDownloadAll}
              disabled={!items.length}
            >
              Download All
            </button>
            <button
              className="primary"
              onClick={handleInsert}
              disabled={!rows.length || isSending}
            >
              {isSending ? "Sending..." : "Send to Supabase"}
            </button>
          </div>
        </div>

        <div className="items-grid">
          {items.map((item) => (
            <article key={item.filename} className="item-card">
              <h3>{item.title}</h3>
              <dl>
                <div>
                  <dt>Date</dt>
                  <dd>{item.date}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{item.duration}</dd>
                </div>
                <div>
                  <dt>Filename</dt>
                  <dd>{item.filename}</dd>
                </div>
              </dl>
              <div className="item-links">
                <a href={item.audioUrl} target="_blank" rel="noreferrer">
                  Source audio
                </a>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => downloadFile(item.audioUrl, item.filename)}
                  disabled={!item.audioUrl}
                >
                  Download
                </button>
                <a href={item.r2Url} target="_blank" rel="noreferrer">
                  R2 URL
                </a>
              </div>
            </article>
          ))}
          {!items.length && (
            <div className="empty">Run a feed to see the parsed entries.</div>
          )}
        </div>

        <div className="sql-block">
          <div className="sql-header">
            <h3>SQL Output</h3>
            <span className="muted">Editable before copy</span>
          </div>
          <textarea
            value={sqlText}
            onChange={(event) => setSqlText(event.target.value)}
            placeholder="SQL will appear here."
          />
          <p className="hint">
            SQL edits do not affect the Supabase insert payload.
          </p>
        </div>
      </section>
    </div>
  );
}

export default App;
