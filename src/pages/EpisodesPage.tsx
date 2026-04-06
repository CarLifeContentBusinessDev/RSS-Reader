import type { FormEvent } from "react";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { EpisodeInfoEditor } from "../components/EpisodeInfoEditor";
import { EpisodesFetchForm } from "../components/EpisodesFetchForm";
import { EpisodeSqlEditor } from "../components/EpisodeSqlEditor";
import { GuidePanel } from "../components/GuidePanel";
import { ProcessStatus } from "../components/ProcessStatus";
import {
  buildEpisodeFolder,
  DEFAUKLT_LANGUAGE,
  EPISODE_GUIDE_STEPS,
} from "../constants/options";
import { ghostButtonClass, panelClass } from "../constants/style";
import { useAudioDownload } from "../hooks/useAudioDownload";
import { useAudioConvert } from "../hooks/useAudioConvert";
import { useAudioUpload } from "../hooks/useAudioUpload";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useEpisodeFetch } from "../hooks/useEpisodeFetch";
import { useProcessLog } from "../hooks/useProcessLog";
import { useProgramSearch } from "../hooks/useProgramSearch";
import type { ToastTone } from "../types";
import { MESSAGES } from "../constants/message";
import { LABELS } from "../constants/labels";

const EPISODES_FORM_STORAGE_KEY = "rss-reader:episodes-form";

type EpisodesFormSnapshot = {
  rssUrl?: string;
  language?: string;
  programId?: string;
  limit?: string;
  r2Folder?: string;
  autoConvertAudio?: boolean;
  autoUploadToR2?: boolean;
  autoSendToSupabase?: boolean;
};

const loadEpisodesSnapshot = (): EpisodesFormSnapshot => {
  try {
    const raw = localStorage.getItem(EPISODES_FORM_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as EpisodesFormSnapshot;
  } catch {
    return {};
  }
};

const getEpisodeSelectionKey = (filename: string) =>
  filename.replace(/\.(mp3|m4a)$/i, "");

interface EpisodesPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  status: string;
  setStatus: (value: string) => void;
}

const EpisodesPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
  setStatus,
}: EpisodesPageProps) => {
  const savedSnapshot = loadEpisodesSnapshot();

  const [rssUrl, setRssUrl] = useState(savedSnapshot.rssUrl ?? "");
  const [language, setLanguage] = useState(
    savedSnapshot.language ?? DEFAUKLT_LANGUAGE,
  );
  const [limit, setLimit] = useState(savedSnapshot.limit ?? "4");
  const [r2Folder, setR2Folder] = useState(
    savedSnapshot.r2Folder ??
      buildEpisodeFolder(savedSnapshot.language ?? DEFAUKLT_LANGUAGE),
  );
  const [autoConvertAudio, setAutoConvertAudio] = useState(
    Boolean(savedSnapshot.autoConvertAudio),
  );
  const [autoUploadToR2, setAutoUploadToR2] = useState(
    Boolean(savedSnapshot.autoUploadToR2),
  );
  const [autoSendToSupabase, setAutoSendToSupabase] = useState(
    Boolean(savedSnapshot.autoSendToSupabase),
  );
  const [deselectedEpisodeKeys, setDeselectedEpisodeKeys] = useState<
    Set<string>
  >(new Set());
  const [uploadResult, setUploadResult] = useState("");
  const restoredProgramId = useRef(false);

  const handleLanguageChange = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    setR2Folder(buildEpisodeFolder(nextLanguage));
  };

  const { logs, processState, addLog, setProcess, clearLogs } = useProcessLog({
    showToast,
  });
  const { guard } = useAuthGuard({ authUserEmail, onRequireLogin, showToast });
  const {
    programId,
    setProgramId,
    programOptions,
    isProgramSearching,
    programSearched,
    programInputMode,
    searchProgram,
    toggleInputMode,
  } = useProgramSearch({ rssUrl, language, showToast });

  useEffect(() => {
    if (restoredProgramId.current) return;
    restoredProgramId.current = true;
    if (savedSnapshot.programId) {
      setProgramId(savedSnapshot.programId);
    }
  }, [savedSnapshot.programId, setProgramId]);

  const {
    items,
    sqlText,
    originalSqlText,
    originalItems,
    channelTitle,
    channelOverride,
    error,
    isLoading,
    isSending,
    insertResult,
    setSqlText,
    setChannelOverride,
    setInsertResult,
    fetchEpisodes,
    insertToSupabase,
    resetToOriginal,
    startEditDuration,
    updateEditingDuration,
    confirmEditDuration,
    cancelEditDuration,
    applyAudioUrls,
    applyConvertedItem,
    syncSqlPreview,
    resetState,
  } = useEpisodeFetch({
    language,
    r2Folder,
    addLog,
    setProcess,
    showToast,
    setStatus,
  });

  const {
    downloadProgress,
    downloadSummary,
    downloadFile,
    resetDownloadStates,
  } = useAudioDownload({
    items,
    addLog,
    setProcess,
  });

  const {
    convertStates,
    convertAll,
    isAllConverted,
    getConvertSummary,
    resetConvertStates,
  } = useAudioConvert({
    addLog,
    setProcess,
    onItemConverted: applyConvertedItem,
  });

  const {
    uploadStates,
    uploadAll,
    isAllUploaded,
    getUploadSummary,
    resetUploadStates,
  } = useAudioUpload({ addLog, setProcess });

  useEffect(() => {
    const snapshot: EpisodesFormSnapshot = {
      rssUrl,
      language,
      programId,
      limit,
      r2Folder,
      autoConvertAudio,
      autoUploadToR2,
      autoSendToSupabase,
    };
    localStorage.setItem(EPISODES_FORM_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    rssUrl,
    language,
    programId,
    limit,
    r2Folder,
    autoConvertAudio,
    autoUploadToR2,
    autoSendToSupabase,
  ]);

  const selectedItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !deselectedEpisodeKeys.has(getEpisodeSelectionKey(item.filename)),
      ),
    [items, deselectedEpisodeKeys],
  );

  useEffect(() => {
    syncSqlPreview(programId, undefined, selectedItems);
  }, [selectedItems, channelOverride, r2Folder, programId, syncSqlPreview]);
  const selectedItemCount = selectedItems.length;
  const isAllSelected = items.length > 0 && selectedItemCount === items.length;

  const convertSummary = getConvertSummary(selectedItems);
  const uploadSummary = getUploadSummary(selectedItems);
  const allConverted = isAllConverted(selectedItems);
  const allUploaded = isAllUploaded(selectedItems);
  const allConvertedForAutomation = isAllConverted(items);
  const allUploadedForAutomation = isAllUploaded(items);

  const isConverting = Object.values(convertStates).some(
    (s) => s.status === "converting",
  );
  const isUploading = Object.values(uploadStates).some(
    (s) => s.status === "uploading",
  );
  const isAllAutomationSelected =
    autoConvertAudio && autoUploadToR2 && autoSendToSupabase;

  const handleEpisodeSelectionChange = useCallback(
    (filename: string, selected: boolean) => {
      const key = getEpisodeSelectionKey(filename);
      setDeselectedEpisodeKeys((prev) => {
        const next = new Set(prev);
        if (selected) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const handleSelectAllEpisodes = useCallback(() => {
    setDeselectedEpisodeKeys(new Set());
  }, []);

  const handleClearSelectedEpisodes = useCallback(() => {
    setDeselectedEpisodeKeys(
      new Set(items.map((item) => getEpisodeSelectionKey(item.filename))),
    );
  }, [items]);

  // RSS 파싱 → 선택적 자동 변환/업로드/전송
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    guard(MESSAGES.LOGIN_REQUIRED_FETCH, async () => {
      clearLogs();
      resetConvertStates();
      setUploadResult("");
      setInsertResult("");
      setDeselectedEpisodeKeys(new Set());

      const parsedItems = await fetchEpisodes(rssUrl, programId, limit);
      if (!parsedItems?.length) return;
      if (autoConvertAudio) {
        await convertAll(parsedItems);
      }
    });
  };

  const handleInsert = useCallback(() => {
    guard(MESSAGES.LOGIN_REQUIRED_SEND, () => {
      if (!selectedItems.length) {
        showToast("전송할 에피소드를 먼저 선택해주세요.", "info");
        return;
      }
      insertToSupabase(selectedItems, programId);
    });
  }, [guard, insertToSupabase, programId, selectedItems, showToast]);

  // 수동 재변환
  const handleConvertAll = () => {
    guard(MESSAGES.LOGIN_REQUIRED_FETCH, async () => {
      if (!selectedItems.length) {
        showToast("변환할 에피소드를 먼저 선택해주세요.", "info");
        return;
      }
      await convertAll(selectedItems);
    });
  };

  // R2 업로드 → R2 URL로 교체 + SQL 재생성
  const handleUploadAll = useCallback(async () => {
    guard(MESSAGES.LOGIN_REQUIRED_SEND, async () => {
      if (!selectedItems.length) {
        showToast("업로드할 에피소드를 먼저 선택해주세요.", "info");
        return;
      }

      setUploadResult("working");
      const effectiveChannel = channelOverride || channelTitle;
      const { urlMap, hasError } = await uploadAll(
        selectedItems,
        convertStates,
        r2Folder,
        effectiveChannel,
      );
      if (Object.keys(urlMap).length > 0) {
        applyAudioUrls(urlMap, programId);
      }
      setUploadResult(hasError ? "failed" : "success");
    });
  }, [
    guard,
    channelOverride,
    channelTitle,
    selectedItems,
    convertStates,
    r2Folder,
    uploadAll,
    applyAudioUrls,
    programId,
    showToast,
  ]);

  // 자동 R2 업로드 (변환 완료 후)
  useEffect(() => {
    if (
      autoUploadToR2 &&
      allConvertedForAutomation &&
      !isUploading &&
      items.length > 0 &&
      !isLoading &&
      !uploadResult
    ) {
      handleUploadAll();
    }
  }, [
    autoUploadToR2,
    allConvertedForAutomation,
    isUploading,
    items.length,
    isLoading,
    uploadResult,
    handleUploadAll,
  ]);

  // 자동 Supabase 전송 (업로드 완료 후)
  useEffect(() => {
    if (
      autoSendToSupabase &&
      allUploadedForAutomation &&
      !isSending &&
      items.length > 0 &&
      !insertResult
    ) {
      handleInsert();
    }
  }, [
    autoSendToSupabase,
    allUploadedForAutomation,
    isSending,
    items.length,
    insertResult,
    handleInsert,
  ]);

  const handleReset = () => {
    localStorage.removeItem(EPISODES_FORM_STORAGE_KEY);
    setRssUrl("");
    setProgramId("");
    setLanguage(DEFAUKLT_LANGUAGE);
    setLimit("4");
    setR2Folder(buildEpisodeFolder(DEFAUKLT_LANGUAGE));
    setAutoConvertAudio(false);
    setAutoUploadToR2(false);
    setAutoSendToSupabase(false);
    setDeselectedEpisodeKeys(new Set());
    setUploadResult("");
    setInsertResult("");
    resetConvertStates();
    resetUploadStates();
    resetDownloadStates();
    resetState();
    clearLogs();
  };

  const handleSelectAllAutomation = () => {
    if (isAllAutomationSelected) {
      setAutoConvertAudio(false);
      setAutoUploadToR2(false);
      setAutoSendToSupabase(false);
      return;
    }
    setAutoConvertAudio(true);
    setAutoUploadToR2(true);
    setAutoSendToSupabase(true);
  };

  return (
    <>
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            {LABELS.PAGE.EPISODE.TITLE}
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            {LABELS.PAGE.EPISODE.DESCRIPTION}
          </p>
        </div>
        <GuidePanel guide_steps={EPISODE_GUIDE_STEPS} />
      </header>

      <section className={panelClass}>
        <EpisodesFetchForm
          rssUrl={rssUrl}
          language={language}
          programId={programId}
          limit={limit}
          r2Folder={r2Folder}
          programOptions={programOptions}
          programSearched={programSearched}
          programInputMode={programInputMode}
          isProgramSearching={isProgramSearching}
          isLoading={isLoading || isConverting}
          autoConvertAudio={autoConvertAudio}
          autoUploadToR2={autoUploadToR2}
          autoSendToSupabase={autoSendToSupabase}
          onRssUrlChange={setRssUrl}
          onLanguageChange={handleLanguageChange}
          onProgramIdChange={setProgramId}
          onLimitChange={setLimit}
          onR2FolderChange={setR2Folder}
          onProgramSearch={searchProgram}
          onToggleInputMode={toggleInputMode}
          onAutoConvertAudioChange={setAutoConvertAudio}
          onAutoUploadToR2Change={setAutoUploadToR2}
          onAutoSendToSupabaseChange={setAutoSendToSupabase}
          automationToggleLabel={
            isAllAutomationSelected ? "전체 해제" : "전체 선택"
          }
          onSelectAllAutomation={handleSelectAllAutomation}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
        <ProcessStatus logs={logs} processState={processState} error={error} />
      </section>

      <section className={`${panelClass} grid gap-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2>{LABELS.SECTION.EPISODE_INFO.TITLE}</h2>
            <p className="text-ink-muted">
              {LABELS.SECTION.EPISODE_INFO.DESCRIPTION}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              className={ghostButtonClass}
              href={`https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
                r2Folder.replace(/^\/+/, ""),
              )}%2F${encodeURIComponent(channelOverride || channelTitle)}%2F`}
              target="_blank"
              rel="noopener noreferrer"
            >
              폴더 바로가기
            </a>
            <button
              className={ghostButtonClass}
              type="button"
              onClick={resetToOriginal}
              disabled={!originalItems.length}
            >
              원래대로
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <>
            <EpisodeInfoEditor
              channelTitle={channelTitle}
              channelOverride={channelOverride}
              onChannelOverrideChange={setChannelOverride}
              items={items}
              originalItems={originalItems}
              downloadProgress={downloadProgress}
              downloadSummary={downloadSummary}
              convertStates={convertStates}
              convertSummary={convertSummary}
              uploadStates={uploadStates}
              uploadSummary={uploadSummary}
              selectedCount={selectedItemCount}
              totalCount={items.length}
              isAllSelected={isAllSelected}
              sqlText={sqlText}
              isSending={isSending}
              onDownload={downloadFile}
              onStartEditDuration={startEditDuration}
              onUpdateEditingDuration={updateEditingDuration}
              onConfirmEditDuration={confirmEditDuration}
              onCancelEditDuration={cancelEditDuration}
              isEpisodeSelected={(filename) =>
                !deselectedEpisodeKeys.has(getEpisodeSelectionKey(filename))
              }
              onEpisodeSelectionChange={handleEpisodeSelectionChange}
              onSelectAllEpisodes={handleSelectAllEpisodes}
              onClearSelectedEpisodes={handleClearSelectedEpisodes}
              onConvertAll={handleConvertAll}
              onUploadAll={handleUploadAll}
              isConvertDisabled={
                !selectedItems.length || isConverting || isLoading
              }
              isUploadDisabled={
                !selectedItems.length || !allConverted || isUploading
              }
              convertButtonLabel={
                isConverting
                  ? `변환 중... (${convertSummary.completed}/${convertSummary.total})`
                  : allConverted
                    ? "재변환"
                    : "m4a 변환"
              }
              uploadButtonLabel={
                isUploading
                  ? `업로드 중... (${uploadSummary.completed}/${uploadSummary.total})`
                  : allUploaded
                    ? "재업로드"
                    : "R2 업로드"
              }
              onSendToSupabase={handleInsert}
            />
            <EpisodeSqlEditor
              sqlText={sqlText}
              originalSqlText={originalSqlText}
              onChange={setSqlText}
              onRestore={() => setSqlText(originalSqlText)}
            />
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-panel-border p-8 text-center text-ink-muted">
            {LABELS.EMPTY.EPISODE}
          </div>
        )}
      </section>
    </>
  );
};

export default EpisodesPage;
