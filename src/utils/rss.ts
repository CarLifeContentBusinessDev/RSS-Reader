import { BASE_URL, ITUNES_NS } from "../constants/options";
import type { ParsedItem, ParsedProgram } from "../types";
import { formatDateYYMMDD, formatDuration } from "./format";
import { buildItemsWithChannel } from "./r2";
import { buildSqlText } from "./sql";

const sanitizeXmlText = (xmlText: string) => {
  const strippedBom = String(xmlText || "").replace(/^\uFEFF/, "");
  const strippedControlChars = strippedBom.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
    "",
  );
  const firstTagIndex = strippedControlChars.indexOf("<");
  if (firstTagIndex > 0) {
    return strippedControlChars.slice(firstTagIndex);
  }
  return strippedControlChars;
};

const getFirstByLocalName = (root: ParentNode, localName: string) => {
  const nodes = Array.from(root.querySelectorAll("*"));
  const lowered = localName.toLowerCase();
  const prefixed = nodes.find((node) => {
    const name = node.nodeName?.toLowerCase() || "";
    return name.endsWith(`:${lowered}`);
  });
  if (prefixed) return prefixed;
  return (
    nodes.find((node) => node.localName?.toLowerCase() === lowered) ?? null
  );
};

export type DateFilterType =
  | { type: "count"; value: number }
  | { type: "year"; year: number }
  | { type: "yearMonth"; year: number; month: number };

const MIN_YEAR = 1900;
const MAX_YEAR = 2099;

const parseItemDateParts = (item: ParsedItem) => {
  const fromPubDate = item.pubDate ? new Date(item.pubDate) : null;
  if (fromPubDate && !Number.isNaN(fromPubDate.getTime())) {
    return {
      year: fromPubDate.getFullYear(),
      month: fromPubDate.getMonth() + 1,
    };
  }

  const fromFormattedDate = item.date.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (fromFormattedDate) {
    return {
      year: 2000 + Number(fromFormattedDate[1]),
      month: Number(fromFormattedDate[2]),
    };
  }

  return null;
};

export const parseDateFilter = (limitInput: string): DateFilterType => {
  const trimmed = limitInput.trim();

  const yearMonthMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (yearMonthMatch) {
    const year = Number(yearMonthMatch[1]);
    const month = Number(yearMonthMatch[2]);
    if (year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12) {
      return { type: "yearMonth", year, month };
    }
  }

  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    if (year >= MIN_YEAR && year <= MAX_YEAR) {
      return { type: "year", year };
    }
  }

  const numberMatch = trimmed.match(/^\d+$/);
  if (numberMatch) {
    return { type: "count", value: Math.max(1, Number(trimmed)) };
  }

  return { type: "count", value: 10 };
};

export const filterItemsByDateFilter = (
  items: ParsedItem[],
  filter: DateFilterType,
): ParsedItem[] => {
  if (filter.type === "count") {
    return items.slice(0, filter.value);
  }

  if (filter.type === "year") {
    return items.filter(
      (item) => parseItemDateParts(item)?.year === filter.year,
    );
  }

  if (filter.type === "yearMonth") {
    return items.filter((item) => {
      const parsed = parseItemDateParts(item);
      return parsed?.year === filter.year && parsed?.month === filter.month;
    });
  }

  return items;
};

export const parseRss = (
  xmlText: string,
  limit: number,
  programId: number | null,
  language: string,
  r2Folder: string = "de-episodes-audio/program",
) => {
  const parser = new DOMParser();
  const normalizedXmlText = sanitizeXmlText(xmlText);
  const doc = parser.parseFromString(normalizedXmlText, "text/xml");
  const parseError = doc.querySelector("parsererror");

  if (parseError) {
    const preview = normalizedXmlText.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(
      `유효하지 않은 XML 응답입니다. 응답 미리보기: ${preview || "(empty)"}`,
    );
  }

  const channelTitleRaw =
    doc.querySelector("channel > title")?.textContent?.trim() || "제목 없음";
  const channelTitle = channelTitleRaw.replace(/[\\/*?:"<>|]/g, "").trim();

  const itemNodes = Array.from(doc.querySelectorAll("channel item")).slice(
    0,
    limit,
  );

  const baseItems: ParsedItem[] = itemNodes.map((item) => {
    const itunesTitleNode =
      item.getElementsByTagNameNS(ITUNES_NS, "title")[0] ??
      getFirstByLocalName(item, "title");
    const itunesTitle = itunesTitleNode?.textContent?.trim() || "";
    const titleFromTag = item.querySelector("title")?.textContent?.trim() || "";
    const title = titleFromTag || itunesTitle || "제목 없음";
    const enclosure = item.querySelector("enclosure");
    const audioUrl = enclosure?.getAttribute("url") || "";
    const pubDateRaw = item.querySelector("pubDate")?.textContent || "";
    const parsedDate = pubDateRaw ? new Date(pubDateRaw) : new Date();
    const safeDate = Number.isNaN(parsedDate.getTime())
      ? new Date()
      : parsedDate;
    const date = formatDateYYMMDD(safeDate);

    const durationNode =
      item.getElementsByTagNameNS(ITUNES_NS, "duration")[0] ??
      getFirstByLocalName(item, "duration");
    const durationRaw = durationNode?.textContent || "0";
    const duration = formatDuration(durationRaw);

    return {
      title,
      itunesTitle,
      audioUrl,
      date,
      pubDate: pubDateRaw,
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
  const normalizedXmlText = sanitizeXmlText(xmlText);
  const doc = parser.parseFromString(normalizedXmlText, "text/xml");
  const parseError = doc.querySelector("parsererror");

  if (parseError) {
    const preview = normalizedXmlText.slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(
      `유효하지 않은 XML 응답입니다. 응답 미리보기: ${preview || "(empty)"}`,
    );
  }

  const title =
    doc.querySelector("channel > title")?.textContent?.trim() || "제목 없음";
  const itunesTitleNode = doc.getElementsByTagNameNS(ITUNES_NS, "title")[0];
  const itunesTitle = itunesTitleNode?.textContent?.trim() || "";
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

  return { title, subtitle, imgUrl, itunesTitle };
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
