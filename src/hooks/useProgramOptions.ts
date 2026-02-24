import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { BroadcastingOption, CategoryOption } from "../types";

export function useProgramOptions(language: string) {
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  const [broadcastingOptions, setBroadcastingOptions] = useState<
    BroadcastingOption[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const [categoryId, setCategoryId] = useState<number | "">("");
  const [broadcastingId, setBroadcastingId] = useState<number | "">("");

  useEffect(() => {
    const fetchOptions = async () => {
      setIsLoading(true);
      // language 변경 시 선택값 먼저 초기화
      setCategoryId("");
      setBroadcastingId("");

      try {
        const [{ data: cats }, { data: broads }] = await Promise.all([
          supabase
            .from("categories")
            .select("id, title")
            .contains("language", [language])
            .order("id"),
          supabase
            .from("broadcastings")
            .select("id, title")
            .contains("language", [language])
            .order("id"),
        ]);

        setCategoryOptions(
          (cats ?? []).map((row) => ({
            value: String(row.id),
            label: `${row.id} · ${row.title}`,
          })),
        );
        setBroadcastingOptions(
          (broads ?? []).map((row) => ({
            value: String(row.id),
            label: `${row.id} · ${row.title}`,
          })),
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchOptions();
  }, [language]);

  const resetSelects = () => {
    setCategoryId("");
    setBroadcastingId("");
  };

  return {
    categoryOptions,
    broadcastingOptions,
    isLoading,
    categoryId,
    setCategoryId,
    broadcastingId,
    setBroadcastingId,
    resetSelects,
  };
}
