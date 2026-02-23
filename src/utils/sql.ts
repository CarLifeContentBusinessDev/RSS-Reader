import type {
  EpisodeRow,
  ParsedItem,
  ParsedProgram,
  ProgramRow,
} from "../types";

export const parseSqlToRows = (sqlText: string): EpisodeRow[] => {
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

export const parseProgramSqlToRows = (sqlText: string): ProgramRow[] => {
  const rowPattern =
    /\(\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*ARRAY\[\s*'((?:''|[^'])*)'\s*\](?:\s*,\s*(\d+|NULL))?(?:\s*,\s*(\d+|NULL))?\s*\)/g;
  const rows: ProgramRow[] = [];

  for (const match of sqlText.matchAll(rowPattern)) {
    const [
      ,
      titleRaw,
      subtitleRaw,
      imgRaw,
      typeRaw,
      language,
      categoryIdRaw,
      broadcastingIdRaw,
    ] = match;
    const row: ProgramRow = {
      title: titleRaw.replace(/''/g, "'"),
      subtitle: subtitleRaw.replace(/''/g, "'"),
      img_url: imgRaw.replace(/''/g, "'"),
      type: typeRaw.replace(/''/g, "'"),
      language: [language.replace(/''/g, "'")],
    };
    if (categoryIdRaw && categoryIdRaw !== "NULL") {
      row.category_id = Number(categoryIdRaw);
    }
    if (broadcastingIdRaw && broadcastingIdRaw !== "NULL") {
      row.broadcasting_id = Number(broadcastingIdRaw);
    }
    rows.push(row);
  }

  if (!rows.length) {
    throw new Error("SQL에서 삽입할 프로그램을 찾지 못했습니다.");
  }

  return rows;
};

export const buildSqlText = (
  items: ParsedItem[],
  programId: number,
  language: string,
) => {
  if (!items.length) return "";

  const sqlLines = items.map((entry, index) => {
    const safeTitle = entry.title.replace(/'/g, "''");
    const safeAudio = entry.r2Url.replace(/'/g, "''");
    const safeDate = entry.date.replace(/'/g, "''");
    const safeDuration = entry.duration.replace(/'/g, "''");
    const isLast = index === items.length - 1;
    return `('${safeTitle}', ${programId}, '${safeAudio}', '${safeDate}', '${safeDuration}', ARRAY['${language}'])${isLast ? "" : ","}`;
  });

  return `INSERT INTO episodes\n  (title, program_id, audio_file, date, duration, language)\nVALUES\n${sqlLines.join("\n")};`;
};

export const buildProgramSqlText = (
  program: ParsedProgram,
  programType: string,
  language: string,
  categoryId?: number,
  broadcastingId?: number,
) => {
  const safeTitle = program.title.replace(/'/g, "''");
  const safeSubtitle = program.subtitle.replace(/'/g, "''");
  const safeImgUrl = program.imgUrl.replace(/'/g, "''");
  const safeType = programType.replace(/'/g, "''");

  const categoryIdValue = categoryId ? `, ${categoryId}` : ", NULL";
  const broadcastingIdValue = broadcastingId ? `, ${broadcastingId}` : ", NULL";

  return `INSERT INTO programs\n  (title, subtitle, img_url, type, language, category_id, broadcasting_id)\nVALUES\n('${safeTitle}', '${safeSubtitle}', '${safeImgUrl}', '${safeType}', ARRAY['${language}']${categoryIdValue}${broadcastingIdValue});`;
};
