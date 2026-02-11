import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./App.css";
import { supabase } from "./lib/supabaseClient";

const BASE_URL =
  "https://pub-a45bc992c0594356a8d32a71510a246b.r2.dev/de-episodes-audio/program";
const R2_IMAGE_BASE_URL = "https://pub-a45bc992c0594356a8d32a71510a246b.r2.dev";
const DEFAULT_IMAGE_FOLDER = "de_images/program";
const ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd";

type EpisodeRow = {
  title: string;
  program_id: number;
  audio_file: string;
  date: string;
  duration: string;
  language: string[];
};

type ProgramRow = {
  title: string;
  subtitle: string;
  img_url: string;
  type: string;
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

type ParsedProgram = {
  title: string;
  subtitle: string;
  imgUrl: string;
};

type LogTone = "info" | "success" | "error" | "action";

type LogEntry = {
  id: string;
  message: string;
  tone: LogTone;
};

type ToastTone = "info" | "success" | "error";

const parseSqlToRows = (sqlText: string): EpisodeRow[] => {
  const rowPattern =
    /\(\s*'((?:''|[^'])*)'\s*,\s*(\d+)\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*ARRAY\[\s*'((?:''|[^'])*)'\s*\]\s*\)/g;
  const rows: EpisodeRow[] = [];

  for (const match of sqlText.matchAll(rowPattern)) {
    const [, titleRaw, programIdRaw, audioRaw, dateRaw, durationRaw, language] =
      match;
    rows.push({
      title: titleRaw.replace(/''/g, "'"),
      program_id: Number(programIdRaw),
      audio_file: audioRaw.replace(/''/g, "'"),
      date: dateRaw.replace(/''/g, "'"),
      duration: durationRaw.replace(/''/g, "'"),
      language: [language.replace(/''/g, "'")],
    });
  }

  if (!rows.length) {
    throw new Error("SQL에서 삽입할 항목을 찾지 못했습니다.");
  }

  return rows;
};

const parseProgramSqlToRows = (sqlText: string): ProgramRow[] => {
  const rowPattern =
    /\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*ARRAY\[\s*'((?:''|[^'])*)'\s*\]\s*\)/g;
  const rows: ProgramRow[] = [];

  for (const match of sqlText.matchAll(rowPattern)) {
    const [, titleRaw, subtitleRaw, imgRaw, typeRaw, language] = match;
    rows.push({
      title: titleRaw.replace(/''/g, "'"),
      subtitle: subtitleRaw.replace(/''/g, "'"),
      img_url: imgRaw.replace(/''/g, "'"),
      type: typeRaw.replace(/''/g, "'"),
      language: [language.replace(/''/g, "'")],
    });
  }

  if (!rows.length) {
    throw new Error("SQL에서 삽입할 프로그램을 찾지 못했습니다.");
  }

  return rows;
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
    throw new Error("유효하지 않은 XML 응답입니다.");
  }

  const channelTitleRaw =
    doc.querySelector("channel > title")?.textContent?.trim() || "제목 없음";
  const channelTitle = channelTitleRaw.replace(/[\\/*?:"<>|]/g, "").trim();

  const itemNodes = Array.from(doc.querySelectorAll("channel item")).slice(
    0,
    limit,
  );

  const items: ParsedItem[] = itemNodes.map((item, index) => {
    const title =
      item.querySelector("title")?.textContent?.trim() || "제목 없음";
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

  return { channelTitle, items, sqlText };
};

const parseProgramRss = (xmlText: string): ParsedProgram => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "text/xml");
  const parseError = doc.querySelector("parsererror");

  if (parseError) {
    throw new Error("유효하지 않은 XML 응답입니다.");
  }

  const title =
    doc.querySelector("channel > title")?.textContent?.trim() || "제목 없음";
  const subtitleNode = doc.getElementsByTagNameNS(ITUNES_NS, "subtitle")[0];
  const subtitle =
    subtitleNode?.textContent?.trim() ||
    doc.querySelector("channel > description")?.textContent?.trim() ||
    "";

  const itunesImage = doc.getElementsByTagNameNS(ITUNES_NS, "image")[0];
  const imgUrl =
    itunesImage?.getAttribute("href") ||
    doc.querySelector("channel > image > url")?.textContent?.trim() ||
    "";

  return { title, subtitle, imgUrl };
};

const buildSqlText = (
  items: ParsedItem[],
  programId: number,
  language: string,
) => {
  if (!items.length) return "";

  const sqlLines = items.map((entry, index) => {
    const safeTitle = entry.title.replace(/'/g, "''");
    const isLast = index === items.length - 1;
    return `('${safeTitle}', ${programId}, '${entry.r2Url}', '${entry.date}', '${entry.duration}', ARRAY['${language}'])${isLast ? "" : ","}`;
  });

  return `INSERT INTO episodes\n  (title, program_id, audio_file, date, duration, language)\nVALUES\n${sqlLines.join("\n")};`;
};

const buildItemsWithChannel = (baseItems: ParsedItem[], channelTitle: string) =>
  baseItems.map((item, index) => {
    const extCandidate = item.audioUrl.split(".").pop()?.split("?")[0] || "mp3";
    const ext = extCandidate.length > 4 ? "mp3" : extCandidate || "mp3";
    const filename = `${channelTitle}-${index + 1}.${ext}`;
    const r2Url = `${BASE_URL}/${encodeURIComponent(
      channelTitle,
    )}/${encodeURIComponent(filename)}`;

    return { ...item, filename, r2Url };
  });

const buildProgramSqlText = (
  program: ParsedProgram,
  programType: string,
  language: string,
) => {
  const safeTitle = program.title.replace(/'/g, "''");
  const safeSubtitle = program.subtitle.replace(/'/g, "''");
  const safeImgUrl = program.imgUrl.replace(/'/g, "''");
  const safeType = programType.replace(/'/g, "''");

  return `INSERT INTO programs\n  (title, subtitle, img_url, type, language)\nVALUES\n('${safeTitle}', '${safeSubtitle}', '${safeImgUrl}', '${safeType}', ARRAY['${language}']);`;
};

const sanitizePathSegment = (value: string) =>
  value.replace(/[\\/*?:"<>|]/g, "").trim();

const buildR2ImageUrl = (
  title: string,
  sourceUrl: string,
  baseUrl: string,
  folder: string,
) => {
  const trimmedBase = baseUrl.replace(/\/+$/g, "");
  const trimmedFolder = folder.trim().replace(/^\/+|\/+$/g, "");
  const safeTitle = sanitizePathSegment(title) || "program";
  const extCandidate = sourceUrl.split(".").pop()?.split("?")[0] || "webp";
  const ext = extCandidate.length > 5 ? "webp" : extCandidate || "webp";
  const filename = `${safeTitle}.${ext}`;
  const encodedFile = encodeURIComponent(filename);

  if (!trimmedFolder) {
    return `${trimmedBase}/${encodedFile}`;
  }

  return `${trimmedBase}/${encodeURIComponent(trimmedFolder)}/${encodedFile}`;
};

function App() {
  const location = useLocation();
  const isProgramsPage = location.pathname === "/programs";
  const [rssUrl, setRssUrl] = useState("");
  const [programId, setProgramId] = useState("");
  const [language, setLanguage] = useState("de");
  const [limit, setLimit] = useState("4");
  const [programRssUrl, setProgramRssUrl] = useState("");
  const [programLanguage, setProgramLanguage] = useState("de");
  const [programType, setProgramType] = useState("podcast");
  const [programImageFolder, setProgramImageFolder] =
    useState(DEFAULT_IMAGE_FOLDER);
  const [programTitle, setProgramTitle] = useState("");
  const [programSubtitle, setProgramSubtitle] = useState("");
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
  const [programStatus, setProgramStatus] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authError, setAuthError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<ToastTone>("info");
  const [channelTitle, setChannelTitle] = useState("");
  const [channelOverride, setChannelOverride] = useState("");
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [sqlText, setSqlText] = useState("");
  const [originalSqlText, setOriginalSqlText] = useState("");
  const [originalItems, setOriginalItems] = useState<ParsedItem[]>([]);
  const [originalChannelTitle, setOriginalChannelTitle] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [processState, setProcessState] = useState({
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
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return;
      if (!isMounted) return;
      setAuthUserEmail(data.session?.user.email ?? null);
    };

    loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setAuthUserEmail(session?.user.email ?? null);
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

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

  const updateProgress = (filename: string, value: number | null) => {
    setDownloadProgress((prev) => ({ ...prev, [filename]: value }));
  };

  const showToast = (message: string, tone: ToastTone = "info") => {
    setToastMessage(message);
    setToastTone(tone);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage("");
    }, 2200);
  };

  const applyChannelOverride = () => {
    const trimmed = channelOverride.trim();
    const nextChannelTitle = trimmed || originalChannelTitle || channelTitle;
    if (!nextChannelTitle) return;
    const baseItems = originalItems.length ? originalItems : items;
    const updatedItems = buildItemsWithChannel(baseItems, nextChannelTitle);
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

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) {
      setAuthError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setAuthError("");
    setStatus("");
    setIsAuthBusy(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      setStatus("로그인 완료.");
      setAuthPassword("");
      setShowAuthModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setAuthError(`로그인 실패 : ${message}`);
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError("");
    setStatus("");
    setIsAuthBusy(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setStatus("로그아웃 완료.");
      setShowAuthModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setAuthError(`로그아웃 실패: ${message}`);
    } finally {
      setIsAuthBusy(false);
    }
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
      const parsed = parseRss(xmlText, limitNumber, programNumber, language);

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
      setShowAuthModal(true);
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

  const updateProgramSqlFromFields = () => {
    const nextImgUrl = buildR2ImageUrl(
      programTitle,
      programSourceImgUrl || programImgUrl,
      R2_IMAGE_BASE_URL,
      programImageFolder,
    );
    setProgramImgUrl(nextImgUrl);
    const nextProgram = {
      title: programTitle.trim() || "제목 없음",
      subtitle: programSubtitle.trim(),
      imgUrl: nextImgUrl,
    };
    setProgramSqlText(
      buildProgramSqlText(nextProgram, programType, programLanguage),
    );
  };

  const handleProgramSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProgramError("");
    setProgramStatus("");
    setProgramIsLoading(true);

    try {
      const response = await fetch(
        `/api/rss?url=${encodeURIComponent(programRssUrl)}`,
      );
      if (!response.ok) {
        throw new Error(`요청 실패: 상태 코드 ${response.status}.`);
      }
      const xmlText = await response.text();
      const parsed = parseProgramRss(xmlText);
      setProgramTitle(parsed.title);
      setProgramSubtitle(parsed.subtitle);
      setProgramSourceImgUrl(parsed.imgUrl);
      setProgramImageFolder(DEFAULT_IMAGE_FOLDER);
      const nextImgUrl = buildR2ImageUrl(
        parsed.title,
        parsed.imgUrl,
        R2_IMAGE_BASE_URL,
        DEFAULT_IMAGE_FOLDER,
      );
      setProgramImgUrl(nextImgUrl);
      setProgramOriginal(parsed);
      const sql = buildProgramSqlText(
        { ...parsed, imgUrl: nextImgUrl },
        programType,
        programLanguage,
      );
      setProgramSqlText(sql);
      setProgramOriginalSql(sql);
      setProgramStatus("프로그램 정보를 불러왔습니다.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "알 수 없는 오류입니다.";
      setProgramError(message);
      setProgramTitle("");
      setProgramSubtitle("");
      setProgramImgUrl("");
      setProgramSourceImgUrl("");
      setProgramImageFolder(DEFAULT_IMAGE_FOLDER);
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
      setShowAuthModal(true);
      return;
    }
    if (!programSqlText.trim()) return;
    setProgramError("");
    setProgramStatus("");
    setProgramIsSending(true);

    try {
      const rowsToInsert = parseProgramSqlToRows(programSqlText);
      const { error: insertError } = await supabase
        .from("programs")
        .insert(rowsToInsert);
      if (insertError) {
        throw insertError;
      }
      setProgramStatus(`프로그램 ${rowsToInsert.length}개를 추가했습니다.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "추가 실패.";
      setProgramError(message);
    } finally {
      setProgramIsSending(false);
    }
  };

  const handleProgramReset = () => {
    if (!programOriginal) return;
    setProgramTitle(programOriginal.title);
    setProgramSubtitle(programOriginal.subtitle);
    setProgramSourceImgUrl(programOriginal.imgUrl);
    setProgramImageFolder(DEFAULT_IMAGE_FOLDER);
    const resetImgUrl = buildR2ImageUrl(
      programOriginal.title,
      programOriginal.imgUrl,
      R2_IMAGE_BASE_URL,
      DEFAULT_IMAGE_FOLDER,
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
      const safeTitle =
        sanitizePathSegment(programTitle) || sanitizePathSegment(channelTitle);
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

  const downloadFile = async (url: string, filename: string) => {
    try {
      setProcess("다운로드 중", "working");
      addLog(`다운로드 시작: ${filename}`, "action");
      updateProgress(filename, 0);
      const response = await fetch(url);
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
        return;
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
    } catch (err) {
      const message = err instanceof Error ? err.message : "다운로드 실패.";
      addLog(`다운로드 실패: ${filename} - ${message}`, "error");
      updateProgress(filename, null);
      setProcess("다운로드 실패", "error");
    }
  };

  const handleDownloadAll = async () => {
    if (!items.length) return;
    setProcess("전체 다운로드 중", "working");
    addLog(`전체 다운로드 시작 (${items.length}개)`, "action");
    setDownloadSummary({ total: items.length, completed: 0 });
    let hasError = false;
    for (const item of items) {
      if (item.audioUrl) {
        try {
          await downloadFile(item.audioUrl, item.filename);
          setDownloadSummary((prev) => ({
            total: prev.total,
            completed: prev.completed + 1,
          }));
        } catch {
          hasError = true;
        }
      }
    }
    addLog("전체 다운로드 완료", hasError ? "error" : "success");
    setProcess(
      hasError ? "다운로드 일부 실패" : "전체 다운로드 완료",
      hasError ? "error" : "success",
    );
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="eyebrow">RSS → SQL</span>
          <strong>Builder</strong>
        </div>
        <nav className="sidebar-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            에피소드
          </NavLink>
          <NavLink
            to="/programs"
            className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
          >
            프로그램
          </NavLink>
        </nav>
      </aside>

      <main className="app">
        <div className="top-bar">
          <div className="top-actions">
            {authUserEmail ? (
              <>
                <span className="user-chip">{authUserEmail}</span>
                <button
                  className="ghost"
                  type="button"
                  onClick={handleSignOut}
                  disabled={isAuthBusy}
                >
                  {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
                </button>
              </>
            ) : (
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setAuthError("");
                  setShowAuthModal(true);
                }}
              >
                로그인
              </button>
            )}
          </div>
        </div>

        {!isProgramsPage && (
          <>
            <header className="hero">
              <div>
                <p className="eyebrow">RSS → SQL + Supabase</p>
                <h1>RSS Episode Builder</h1>
                <p className="subhead">
                  RSS 주소를 넣고 프로그램과 언어를 고르면 SQL을 만들거나
                  Supabase로 바로 전송할 수 있습니다.
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
                  <label className="field">
                    <span>Language</span>
                    <input
                      type="text"
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      placeholder="de"
                      maxLength={5}
                    />
                  </label>
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
                  <button
                    className="primary"
                    type="submit"
                    disabled={isLoading}
                  >
                    {isLoading ? "처리 중..." : "SQL 생성"}
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
              <div className="log-panel">
                <div className="log-header">
                  <h3>처리 로그</h3>
                  <span className="muted">진행 요약</span>
                  <span className={`status-pill ${processState.tone}`}>
                    {processState.label}
                  </span>
                </div>
                <div className="log-body" aria-live="polite">
                  <div className="log-list">
                    {logs.length ? (
                      logs.map((entry) => (
                        <div
                          key={entry.id}
                          className={`log-item ${entry.tone}`}
                        >
                          <span className="log-dot" />
                          <p>{entry.message}</p>
                        </div>
                      ))
                    ) : (
                      <p className="muted">아직 실행 로그가 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
              {error && <div className="error">{error}</div>}
              {status && <div className="status">{status}</div>}
            </section>

            <section className="panel results">
              <div className="panel-header">
                <div>
                  <h2>파싱된 항목</h2>
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
                          onChange={(event) =>
                            setChannelOverride(event.target.value)
                          }
                          placeholder="예: Eine Stunde History"
                          disabled={!items.length}
                        />
                      )}
                    </div>
                    <div className="channel-actions">
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setIsEditingChannel((prev) => !prev)}
                        disabled={!items.length}
                      >
                        {isEditingChannel ? "수정 취소" : "편집"}
                      </button>
                      {isEditingChannel && (
                        <button
                          className="text-button"
                          type="button"
                          onClick={applyChannelOverride}
                          disabled={!items.length}
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
                </div>
                {downloadSummary.total > 0 && (
                  <div className="download-summary">
                    다운로드 {downloadSummary.completed}/{downloadSummary.total}
                  </div>
                )}
                <div className="header-actions">
                  <button
                    className="ghost"
                    onClick={handleCopy}
                    disabled={!sqlText}
                  >
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
                      <a href={item.audioUrl} target="_blank" rel="noreferrer">
                        원본 오디오
                      </a>
                      <button
                        className="link-button"
                        type="button"
                        onClick={() =>
                          downloadFile(item.audioUrl, item.filename)
                        }
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
                {!items.length && (
                  <div className="empty">
                    피드를 실행하면 파싱된 항목이 표시됩니다.
                  </div>
                )}
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
            </section>
          </>
        )}

        {isProgramsPage && (
          <>
            <header className="hero">
              <div>
                <p className="eyebrow">RSS → SQL + Supabase</p>
                <h1>프로그램 빌더</h1>
                <p className="subhead">
                  RSS에서 채널 정보를 가져와 programs 테이블에 추가합니다.
                </p>
              </div>
              <div className="hero-card">
                <div className="metric">
                  <span className="metric-label">저장소</span>
                  <strong className="metric-value">R2 이미지</strong>
                </div>
                <div className="metric">
                  <span className="metric-label">모드</span>
                  <strong className="metric-value">클라이언트 전용</strong>
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
                  <label className="field">
                    <span>타입</span>
                    <input
                      type="text"
                      value={programType}
                      onChange={(event) => setProgramType(event.target.value)}
                      placeholder="podcast"
                    />
                  </label>
                  <label className="field">
                    <span>언어</span>
                    <input
                      type="text"
                      value={programLanguage}
                      onChange={(event) =>
                        setProgramLanguage(event.target.value)
                      }
                      placeholder="de"
                      maxLength={5}
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
                      setProgramImageFolder(DEFAULT_IMAGE_FOLDER);
                      setProgramTitle("");
                      setProgramSubtitle("");
                      setProgramImgUrl("");
                      setProgramSourceImgUrl("");
                      setProgramSqlText("");
                      setProgramOriginalSql("");
                      setProgramOriginal(null);
                      setProgramError("");
                      setProgramStatus("");
                    }}
                  >
                    초기화
                  </button>
                </div>
              </form>
              {programError && <div className="error">{programError}</div>}
              {programStatus && <div className="status">{programStatus}</div>}
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
                    onClick={updateProgramSqlFromFields}
                    disabled={!programTitle}
                  >
                    SQL 갱신
                  </button>
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

              <div className="program-grid">
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
                    placeholder="de_images/program"
                  />
                </label>
                <div className="program-actions span-2">
                  <button
                    className="ghost"
                    type="button"
                    onClick={() => downloadImage(programSourceImgUrl)}
                    disabled={!programSourceImgUrl}
                  >
                    이미지 다운로드
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={applyR2ImageUrl}
                    disabled={!programTitle}
                  >
                    변경 반영
                  </button>
                  {programSourceImgUrl && (
                    <a
                      href={programSourceImgUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      원본 보기
                    </a>
                  )}
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
            </section>
          </>
        )}

        {showAuthModal && (
          <div
            className="modal-backdrop"
            onClick={() => {
              setAuthError("");
              setShowAuthModal(false);
            }}
          >
            <div
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Supabase 로그인</h3>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setShowAuthModal(false);
                  }}
                  aria-label="닫기"
                >
                  닫기
                </button>
              </div>
              {authError && <div className="error auth-error">{authError}</div>}
              {!authUserEmail ? (
                <div className="modal-body">
                  <label className="field">
                    <span>이메일</span>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="field">
                    <span>비밀번호</span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="비밀번호"
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={handleSignIn}
                      disabled={isAuthBusy}
                    >
                      {isAuthBusy ? "로그인 중..." : "로그인"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="modal-body">
                  <p className="muted">로그인됨: {authUserEmail}</p>
                  <div className="modal-actions">
                    <button
                      className="ghost"
                      type="button"
                      onClick={handleSignOut}
                      disabled={isAuthBusy}
                    >
                      {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {toastMessage && (
          <div className={`toast ${toastTone}`}>{toastMessage}</div>
        )}
      </main>
    </div>
  );
}

export default App;
