import type {
  EpisodeRow,
  ParsedItem,
  ParsedProgram,
  ProgramRow,
} from "../types";

export const parseSqlToRows = (sqlText: string): EpisodeRow[] => {
  const rowPattern =
    /\(\s*'((?:''|[^'])*)'\s*,\s*(\d+|NULL)\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*'((?:''|[^'])*)'\s*,\s*ARRAY\[\s*'((?:''|[^'])*)'\s*\]\s*\)/g;
  const rows: EpisodeRow[] = [];

  for (const match of sqlText.matchAll(rowPattern)) {
    const [, titleRaw, programIdRaw, audioRaw, dateRaw, durationRaw, language] =
      match;
    rows.push({
      title: titleRaw.replace(/''/g, "'"),
      program_id: programIdRaw === "NULL" ? null : Number(programIdRaw),
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
  const unquoteSqlString = (value: string) => {
    const trimmed = value.trim();
    const withoutCast = trimmed.replace(/::[^\s,]+$/, "");
    if (!withoutCast.startsWith("'") || !withoutCast.endsWith("'")) {
      throw new Error(`문자열 필드 형식이 올바르지 않습니다: ${value}`);
    }
    return withoutCast.slice(1, -1).replace(/''/g, "'");
  };

  const parseLanguageArray = (value: string) => {
    const trimmed = value.trim();
    const arrayMatch = trimmed.match(
      /^ARRAY\s*\[\s*'((?:''|[^'])*)'\s*\](?:::[^\s,]+)?$/i,
    );
    if (arrayMatch) {
      return [arrayMatch[1].replace(/''/g, "'")];
    }

    const pgArrayMatch = trimmed.match(/^'\{\s*([^{}]+?)\s*\}'$/);
    if (pgArrayMatch) {
      return [pgArrayMatch[1].replace(/^"|"$/g, "")];
    }

    throw new Error(`language 배열 필드 형식이 올바르지 않습니다: ${value}`);
  };

  const parseOptionalNumber = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || /^NULL$/i.test(trimmed)) return undefined;
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      throw new Error(`숫자 필드 형식이 올바르지 않습니다: ${value}`);
    }
    return num;
  };

  const splitTupleFields = (tupleText: string) => {
    const fields: string[] = [];
    let inQuote = false;
    let bracketDepth = 0;
    let tokenStart = 0;

    for (let i = 0; i < tupleText.length; i += 1) {
      const ch = tupleText[i];
      const next = tupleText[i + 1];

      if (ch === "'" && inQuote && next === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        inQuote = !inQuote;
        continue;
      }
      if (!inQuote && ch === "[") {
        bracketDepth += 1;
        continue;
      }
      if (!inQuote && ch === "]") {
        bracketDepth -= 1;
        continue;
      }
      if (!inQuote && bracketDepth === 0 && ch === ",") {
        fields.push(tupleText.slice(tokenStart, i).trim());
        tokenStart = i + 1;
      }
    }

    fields.push(tupleText.slice(tokenStart).trim());
    return fields.filter((field) => field.length > 0);
  };

  const extractTuples = (text: string) => {
    const tuples: string[] = [];
    let inQuote = false;
    let depth = 0;
    let tupleStart = -1;

    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === "'" && inQuote && next === "'") {
        i += 1;
        continue;
      }
      if (ch === "'") {
        inQuote = !inQuote;
        continue;
      }
      if (inQuote) continue;

      if (ch === "(") {
        if (depth === 0) tupleStart = i + 1;
        depth += 1;
        continue;
      }

      if (ch === ")") {
        depth -= 1;
        if (depth === 0 && tupleStart >= 0) {
          tuples.push(text.slice(tupleStart, i));
          tupleStart = -1;
        }
      }
    }

    return tuples;
  };

  const valuesSectionMatch = sqlText.match(/VALUES\s*([\s\S]*?);?\s*$/i);
  const valuesSection = valuesSectionMatch ? valuesSectionMatch[1] : sqlText;
  const tupleTexts = extractTuples(valuesSection);
  const rows: ProgramRow[] = [];

  for (const tupleText of tupleTexts) {
    const fields = splitTupleFields(tupleText);
    if (fields.length < 5) continue;

    const row: ProgramRow = {
      title: unquoteSqlString(fields[0]),
      subtitle: unquoteSqlString(fields[1]),
      img_url: unquoteSqlString(fields[2]),
      type: unquoteSqlString(fields[3]),
      language: parseLanguageArray(fields[4]),
    };

    const categoryId = parseOptionalNumber(fields[5] ?? "NULL");
    const broadcastingId = parseOptionalNumber(fields[6] ?? "NULL");
    if (categoryId !== undefined) row.category_id = categoryId;
    if (broadcastingId !== undefined) row.broadcasting_id = broadcastingId;
    rows.push(row);
  }

  if (!rows.length) {
    throw new Error("SQL에서 삽입할 프로그램을 찾지 못했습니다.");
  }

  return rows;
};

export const buildSqlText = (
  items: ParsedItem[],
  programId: number | null,
  language: string,
) => {
  if (!items.length) return "";

  const sqlLines = items.map((entry, index) => {
    const safeTitle = entry.title.replace(/'/g, "''");
    const safeAudio = entry.r2Url.replace(/'/g, "''");
    const safeDate = entry.date.replace(/'/g, "''");
    const safeDuration = entry.duration.replace(/'/g, "''");
    const programIdValue =
      typeof programId === "number" && Number.isFinite(programId)
        ? String(programId)
        : "NULL";
    const isLast = index === items.length - 1;
    return `('${safeTitle}', ${programIdValue}, '${safeAudio}', '${safeDate}', '${safeDuration}', ARRAY['${language}'])${isLast ? "" : ","}`;
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
