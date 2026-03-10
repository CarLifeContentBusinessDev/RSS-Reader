import type { FormEvent } from "react";
import { useEffect, useState, useCallback } from "react";
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
  const [rssUrl, setRssUrl] = useState("");
  const [language, setLanguage] = useState(DEFAUKLT_LANGUAGE);
  const [limit, setLimit] = useState("4");
  const [r2Folder, setR2Folder] = useState(
    buildEpisodeFolder(DEFAUKLT_LANGUAGE),
  );
  const [autoConvertAudio, setAutoConvertAudio] = useState(false);
  const [autoUploadToR2, setAutoUploadToR2] = useState(false);
  const [autoSendToSupabase, setAutoSendToSupabase] = useState(false);
  const [uploadResult, setUploadResult] = useState("");

  useEffect(() => {
    setR2Folder(buildEpisodeFolder(language));
  }, [language]);

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
    applyChanges,
    resetToOriginal,
    startEditDuration,
    updateEditingDuration,
    confirmEditDuration,
    cancelEditDuration,
    applyAudioUrls,
    applyConvertedItem,
  } = useEpisodeFetch({
    language,
    r2Folder,
    addLog,
    setProcess,
    showToast,
    setStatus,
  });

  const { downloadProgress, downloadSummary, downloadFile } = useAudioDownload({
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

  const { uploadStates, uploadAll, isAllUploaded, getUploadSummary } =
    useAudioUpload({ addLog, setProcess });

  const convertSummary = getConvertSummary(items);
  const uploadSummary = getUploadSummary(items);
  const allConverted = isAllConverted(items);
  const allUploaded = isAllUploaded(items);

  const isConverting = Object.values(convertStates).some(
    (s) => s.status === "converting",
  );
  const isUploading = Object.values(uploadStates).some(
    (s) => s.status === "uploading",
  );

  // RSS 파싱 → 선택적 자동 변환/업로드/전송
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    guard(MESSAGES.LOGIN_REQUIRED_FETCH, async () => {
      clearLogs();
      resetConvertStates();
      setUploadResult("");
      setInsertResult("");

      const parsedItems = await fetchEpisodes(rssUrl, programId, limit);
      if (!parsedItems?.length) return;
      if (autoConvertAudio) {
        await convertAll(parsedItems);
      }
    });
  };

  const handleInsert = useCallback(() => {
    guard(MESSAGES.LOGIN_REQUIRED_SEND, () => {
      // 채널명, R2폴더 변경사항 반영 후 전송
      if (items.length > 0) {
        applyChanges(programId);
      }
      insertToSupabase();
    });
  }, [guard, insertToSupabase, items, programId, applyChanges]);

  // 수동 재변환
  const handleConvertAll = () => {
    guard(MESSAGES.LOGIN_REQUIRED_FETCH, async () => {
      await convertAll(items);
    });
  };

  // R2 업로드 → R2 URL로 교체 + SQL 재생성
  const handleUploadAll = useCallback(async () => {
    guard(MESSAGES.LOGIN_REQUIRED_SEND, async () => {
      setUploadResult("working");
      const effectiveChannel = channelOverride || channelTitle;
      const { urlMap, hasError } = await uploadAll(
        items,
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
    items,
    convertStates,
    r2Folder,
    uploadAll,
    applyAudioUrls,
    programId,
  ]);

  // 자동 R2 업로드 (변환 완료 후)
  useEffect(() => {
    if (
      autoUploadToR2 &&
      allConverted &&
      !isUploading &&
      items.length > 0 &&
      !isLoading &&
      !uploadResult
    ) {
      handleUploadAll();
    }
  }, [
    autoUploadToR2,
    allConverted,
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
      allUploaded &&
      !isSending &&
      items.length > 0 &&
      !insertResult
    ) {
      handleInsert();
    }
  }, [
    autoSendToSupabase,
    allUploaded,
    isSending,
    items.length,
    insertResult,
    handleInsert,
  ]);

  const handleReset = () => {
    setRssUrl("");
    setProgramId("");
    setLanguage(DEFAUKLT_LANGUAGE);
    setLimit("4");
    setR2Folder(buildEpisodeFolder(DEFAUKLT_LANGUAGE));
    setAutoConvertAudio(false);
    setAutoUploadToR2(false);
    setAutoSendToSupabase(false);
    setUploadResult("");
    setInsertResult("");
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
          onLanguageChange={setLanguage}
          onProgramIdChange={setProgramId}
          onLimitChange={setLimit}
          onR2FolderChange={setR2Folder}
          onProgramSearch={searchProgram}
          onToggleInputMode={toggleInputMode}
          onAutoConvertAudioChange={setAutoConvertAudio}
          onAutoUploadToR2Change={setAutoUploadToR2}
          onAutoSendToSupabaseChange={setAutoSendToSupabase}
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
            <button
              className={ghostButtonClass}
              onClick={handleConvertAll}
              disabled={!items.length || isConverting || isLoading}
            >
              {isConverting
                ? `변환 중... (${convertSummary.completed}/${convertSummary.total})`
                : allConverted
                  ? "재변환"
                  : "m4a 변환"}
            </button>
            <button
              className={ghostButtonClass}
              onClick={handleUploadAll}
              disabled={!allConverted || isUploading}
            >
              {isUploading
                ? `업로드 중... (${uploadSummary.completed}/${uploadSummary.total})`
                : allUploaded
                  ? "재업로드"
                  : "R2 업로드"}
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
              sqlText={sqlText}
              isSending={isSending}
              onDownload={downloadFile}
              onStartEditDuration={startEditDuration}
              onUpdateEditingDuration={updateEditingDuration}
              onConfirmEditDuration={confirmEditDuration}
              onCancelEditDuration={cancelEditDuration}
              r2Folder={r2Folder}
              onR2FolderChange={setR2Folder}
              onResetToOriginal={resetToOriginal}
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
