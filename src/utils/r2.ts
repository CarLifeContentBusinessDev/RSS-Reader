import { BASE_URL } from "../config/constants";
import type { ParsedItem } from "../types";

export const sanitizePathSegment = (value: string) =>
  value.replace(/[\\/*?:"<>|]/g, "").trim();

export const buildItemsWithChannel = (
  baseItems: ParsedItem[],
  channelTitle: string,
): ParsedItem[] =>
  baseItems.map((item, index) => {
    const extCandidate = item.audioUrl.split(".").pop()?.split("?")[0] || "mp3";
    const ext = extCandidate.length > 4 ? "mp3" : extCandidate || "mp3";
    const filename = `${channelTitle}-${index + 1}.${ext}`;
    const r2Url = `${BASE_URL}/${encodeURIComponent(
      channelTitle,
    )}/${encodeURIComponent(filename)}`;

    return { ...item, filename, r2Url };
  });

export const buildR2ImageUrl = (
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
