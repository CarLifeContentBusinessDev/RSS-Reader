import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { parseProgramRss } from "../utils/rss";
import type { ToastTone } from "../types";

interface UseProgramSearchOptions {
  rssUrl: string;
  language: string;
  showToast: (message: string, tone?: ToastTone) => void;
}

export function useProgramSearch({
  rssUrl,
  language,
  showToast,
}: UseProgramSearchOptions) {
  const [programId, setProgramId] = useState("");
  const [programOptions, setProgramOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [isProgramSearching, setIsProgramSearching] = useState(false);
  const [programSearched, setProgramSearched] = useState(false);
  const [programInputMode, setProgramInputMode] = useState<"input" | "select">(
    "input",
  );

  const searchProgram = async () => {
    if (!rssUrl) return;
    setIsProgramSearching(true);
    setProgramSearched(false);
    setProgramInputMode("select");
    setProgramOptions([]);
    setProgramId("");

    try {
      const response = await fetch(
        `/api/rss?url=${encodeURIComponent(rssUrl)}`,
      );
      if (!response.ok) throw new Error(`RSS 요청 실패: ${response.status}`);
      const xmlText = await response.text();

      const parsed = parseProgramRss(xmlText);
      const keyword = parsed.title.trim();
      if (!keyword) throw new Error("RSS에서 채널 타이틀을 찾을 수 없습니다.");

      const { data, error } = await supabase
        .from("programs")
        .select("id, title")
        .ilike("title", `%${keyword}%`)
        .contains("language", [language])
        .order("id");

      if (error) throw error;

      if (!data?.length) {
        showToast(`'${keyword}' 검색 결과가 없습니다.`, "error");
        return;
      }

      const options = data.map((row) => ({
        value: String(row.id),
        label: `${row.id} · ${row.title}`,
      }));
      setProgramOptions(options);

      // 단일 결과면 자동 선택
      if (data.length === 1) {
        setProgramId(String(data[0].id));
        showToast(`'${data[0].title}' 자동 선택됨`, "success");
      }
      setProgramSearched(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "검색 실패";
      showToast(message, "error");
    } finally {
      setIsProgramSearching(false);
    }
  };

  const toggleInputMode = () => {
    setProgramInputMode((prev) => (prev === "select" ? "input" : "select"));
  };

  return {
    programId,
    setProgramId,
    programOptions,
    isProgramSearching,
    programSearched,
    programInputMode,
    searchProgram,
    toggleInputMode,
  };
}
