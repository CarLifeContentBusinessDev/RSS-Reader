import { BASE_URL, ITUNES_NS } from "../constants/options";
import type { ParsedItem, ParsedProgram } from "../types";
import { formatDateYYMMDD, formatDuration } from "./format";
import { buildItemsWithChannel } from "./r2";
import { buildSqlText } from "./sql";

export const parseRss = (
  xmlText: string,
  limit: number,
  programId: number | null,
  language: string,
  r2Folder: string = "de-episodes-audio/program",
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

  const baseItems: ParsedItem[] = itemNodes.map((item) => {
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

    return {
      title,
      audioUrl,
      date,
      duration,
      filename: "",
      r2Url: "",
    };
  });

  const items = buildItemsWithChannel(baseItems, channelTitle, r2Folder);
  const sqlText = buildSqlText(items, programId, language);

  return { channelTitle, items, sqlText };
};

export const parseProgramRss = (xmlText: string): ParsedProgram => {
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

export const buildChannelR2Url = (
  channelTitle: string,
  filename: string,
  r2Folder: string = "de-episodes-audio/program",
) => {
  const trimmedFolder = r2Folder.trim().replace(/^\/+|\/+$/g, "");
  const folderPath = trimmedFolder
    ? `${encodeURIComponent(trimmedFolder)}/`
    : "";

  return `${BASE_URL}/${folderPath}${encodeURIComponent(
    channelTitle,
  )}/${encodeURIComponent(filename)}`;
};
