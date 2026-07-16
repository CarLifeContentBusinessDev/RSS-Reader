import { DEFAUKLT_LANGUAGE } from "./options";

export const LANGUAGE_OPTIONS = [
  { value: "ko", label: "ko (한국)" },
  { value: "en", label: "en (미국)" },
  { value: "de", label: "de (독일)" },
  { value: "jp", label: "jp (일본)" },
  { value: "in", label: "in (인도)" },
  { value: "uk", label: "uk (영국)" },
  { value: "au", label: "au (호주)" },
  { value: "fr", label: "fr (프랑스)" },
  { value: "es", label: "es (스페인)" },
  { value: "it", label: "it (이탈리아)" },
];

export type CountryCode = "KR" | "US" | "JP" | "GB" | "DE" | "AU";

export const COUNTRY_OPTIONS: { value: CountryCode; label: string }[] = [
  { value: "KR", label: "KR (한국)" },
  { value: "US", label: "US (미국)" },
  { value: "JP", label: "JP (일본)" },
  { value: "GB", label: "GB (영국)" },
  { value: "DE", label: "DE (독일)" },
  { value: "AU", label: "AU (호주)" },
];

// 시트명(예: "US_..", "영국 카테고리" 등)으로부터 country를 1차 추정한다.
// 최종 값은 항상 UI에서 사용자가 직접 확인/수정할 수 있도록 select로 노출한다.
export const detectCountryFromSheetName = (
  sheetName: string,
  fallback: CountryCode = "KR",
): CountryCode => {
  const normalized = String(sheetName || "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;

  const prefix = normalized.split(/[_\-\s]+/)[0];
  const codeMap: Record<string, CountryCode> = {
    ko: "KR",
    kr: "KR",
    en: "US",
    us: "US",
    de: "DE",
    jp: "JP",
    ja: "JP",
    uk: "GB",
    gb: "GB",
    au: "AU",
  };
  if (codeMap[prefix]) return codeMap[prefix];

  if (normalized.includes("미국") || normalized.includes("english"))
    return "US";
  if (normalized.includes("한국") || normalized.includes("korea"))
    return "KR";
  if (normalized.includes("독일") || normalized.includes("german"))
    return "DE";
  if (normalized.includes("일본") || normalized.includes("japan"))
    return "JP";
  if (normalized.includes("영국") || normalized.includes("britain"))
    return "GB";
  if (normalized.includes("호주") || normalized.includes("australia"))
    return "AU";

  return fallback;
};

// 시트명(예: "AU_..", "호주 채널" 등)으로부터 programs.language 코드를 1차 추정한다.
// 최종 값은 항상 UI에서 사용자가 직접 확인/수정할 수 있도록 select로 노출한다.
export const detectLanguageFromSheetName = (
  sheetName: string,
  fallback: string = DEFAUKLT_LANGUAGE,
): string => {
  const normalized = String(sheetName || "")
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;

  const prefix = normalized.split(/[_\-\s]+/)[0];
  const codeMap: Record<string, string> = {
    ko: "ko",
    kr: "ko",
    en: "en",
    us: "en",
    de: "de",
    jp: "jp",
    ja: "jp",
    in: "in",
    uk: "uk",
    au: "au",
    fr: "fr",
    es: "es",
    it: "it",
  };
  if (codeMap[prefix]) return codeMap[prefix];

  if (normalized.includes("미국") || normalized.includes("english"))
    return "en";
  if (normalized.includes("한국") || normalized.includes("korea"))
    return "ko";
  if (normalized.includes("독일") || normalized.includes("german"))
    return "de";
  if (normalized.includes("일본") || normalized.includes("japan"))
    return "jp";
  if (normalized.includes("인도") || normalized.includes("india"))
    return "in";
  if (normalized.includes("영국") || normalized.includes("britain"))
    return "uk";
  if (normalized.includes("호주") || normalized.includes("australia"))
    return "au";
  if (normalized.includes("프랑스") || normalized.includes("france"))
    return "fr";
  if (normalized.includes("스페인") || normalized.includes("spain"))
    return "es";
  if (normalized.includes("이탈리아") || normalized.includes("italy"))
    return "it";

  return fallback;
};
