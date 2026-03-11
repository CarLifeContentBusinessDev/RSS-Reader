import { BASE_URL } from "../constants/options";
import type { ParsedItem } from "../types";

export const sanitizePathSegment = (value: string) =>
  value.replace(/[\\/*?:"<>|]/g, "").trim();

export const buildItemsWithChannel = (
  baseItems: ParsedItem[],
  channelTitle: string,
  r2Folder: string = "",
  language?: string,
): ParsedItem[] => {
  // language가 en이면 폴더 강제 변경
  let folder = r2Folder;
  if (language === "en") {
    folder = "/en-episodes-audio/episodes";
  }
  return baseItems.map((item) => {
    const extCandidate = item.audioUrl.split(".").pop()?.split("?")[0] || "mp3";
    const ext = extCandidate.length > 4 ? "mp3" : extCandidate || "mp3";
    const filename = `[${sanitizePathSegment(channelTitle)}]${sanitizePathSegment(item.title)}.${ext}`;
    const trimmedFolder = folder.trim().replace(/^\/+|\/+$/g, "");
    // 각 세그먼트만 인코딩
    const folderPath = trimmedFolder
      ? `${trimmedFolder
          .split("/")
          .map((seg) => encodeURIComponent(seg))
          .join("/")}/`
      : "";
    const r2Url = `${BASE_URL}/${folderPath}${encodeURIComponent(
      channelTitle,
    )}/${encodeURIComponent(filename)}`;

    return { ...item, filename, r2Url };
  });
};

export const buildR2ImageUrl = (
  title: string,
  baseUrl: string,
  folder: string,
  ext: string = "webp",
  language?: string,
) => {
  // language가 en이면 폴더 강제 변경
  let actualFolder = folder;
  if (language === "en") {
    actualFolder = "/eng_images/program";
  }
  const trimmedBase = baseUrl.replace(/\/+$/g, "");
  const trimmedFolder = actualFolder.trim().replace(/^\/+|\/+$/g, "");
  const safeTitle = sanitizePathSegment(title) || "program";
  const filename = `${safeTitle}.${ext}`;
  const encodedFile = encodeURIComponent(filename);

  if (!trimmedFolder) {
    return `${trimmedBase}/${encodedFile}`;
  }

  // 각 세그먼트만 인코딩
  const encodedFolder = trimmedFolder
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

  return `${trimmedBase}/${encodedFolder}/${encodedFile}`;
};
