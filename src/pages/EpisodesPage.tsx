import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { EpisodeCard } from "../components/EpisodeCard";
import { EpisodesFetchForm } from "../components/EpisodesFetchForm";
import { EpisodeSqlEditor } from "../components/EpisodeSqlEditor";
import { GuidePanel } from "../components/GuidePanel";
import { ProcessStatus } from "../components/ProcessStatus";
import { EPISODE_GUIDE_STEPS } from "../constants/options";
import {
  fieldClass,
  fieldLabelClass,
  ghostButtonClass,
  inputClass,
  panelClass,
  primaryButtonClass,
} from "../constants/style";
import { useDownload } from "../hooks/useDownload";
import { useEpisodeFetch } from "../hooks/useEpisodeFetch";
import { useProcessLog } from "../hooks/useProcessLog";
import { useProgramSearch } from "../hooks/useProgramSearch";
import type { ToastTone } from "../types";

const buildEpisodeFolder = (language: string) =>
  language === "en"
    ? "/en-episodes-audio/episodes"
    : language === "jp"
      ? "/jp_episodes-audio"
      : `/${language}-episodes-audio/episodes`;

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
  const [language, setLanguage] = useState("ko");
  const [limit, setLimit] = useState("4");
  const [r2Folder, setR2Folder] = useState(buildEpisodeFolder("ko"));

  useEffect(() => {
    setR2Folder(buildEpisodeFolder(language));
  }, [language]);

  const { logs, processState, addLog, setProcess, clearLogs } = useProcessLog({
    showToast,
  });

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
    setSqlText,
    setChannelOverride,
    fetchEpisodes,
    insertToSupabase,
    applyChanges,
    resetToOriginal,
    startEditDuration,
    updateEditingDuration,
    confirmEditDuration,
    cancelEditDuration,
  } = useEpisodeFetch({
    language,
    r2Folder,
    addLog,
    setProcess,
    showToast,
    setStatus,
  });

  const { downloadProgress, downloadSummary, downloadFile, handleDownloadAll } =
    useDownload({ items, addLog, setProcess });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!authUserEmail) {
      showToast("로그인 후 불러올 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
    clearLogs();
    fetchEpisodes(rssUrl, programId, limit);
  };

  const handleInsert = () => {
    if (!authUserEmail) {
      showToast("로그인 후 전송할 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
    insertToSupabase();
  };

  const handleCopy = async () => {
    if (!sqlText) return;
    await navigator.clipboard.writeText(sqlText);
    setStatus("SQL을 클립보드에 복사했습니다.");
    window.setTimeout(() => setStatus(""), 2000);
  };

  const handleReset = () => {
    setRssUrl("");
    setProgramId("0");
    setLanguage("de");
    setLimit("4");
    setR2Folder(buildEpisodeFolder("de"));
  };

  return (
    <>
      {/* 헤더 */}
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            Episode Builder
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            RSS에서 에피소드 정보를 가져와 episodes 테이블에 추가합니다.
          </p>
        </div>
        <GuidePanel guide_steps={EPISODE_GUIDE_STEPS} />
      </header>

      {/* 입력 폼 패널 */}
      <section className={panelClass}>
        <EpisodesFetchForm
          rssUrl={rssUrl}
          language={language}
          programId={programId}
          limit={limit}
          programOptions={programOptions}
          programSearched={programSearched}
          programInputMode={programInputMode}
          isProgramSearching={isProgramSearching}
          isLoading={isLoading}
          onRssUrlChange={setRssUrl}
          onLanguageChange={setLanguage}
          onProgramIdChange={setProgramId}
          onLimitChange={setLimit}
          onProgramSearch={searchProgram}
          onToggleInputMode={toggleInputMode}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
        <ProcessStatus logs={logs} processState={processState} error={error} />
      </section>

      {/* 에피소드 정보 패널 */}
      <section className={`${panelClass} grid gap-6`}>
        {/* 헤더 + 액션 버튼 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2>에피소드 정보</h2>
            <p className="text-ink-muted">RSS 파싱 결과</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={ghostButtonClass}
              onClick={handleCopy}
              disabled={!sqlText}
            >
              SQL 복사
            </button>
            <button
              className={ghostButtonClass}
              onClick={handleDownloadAll}
              disabled={!items.length}
            >
              mp3 전체 다운로드
            </button>
            <button
              className={primaryButtonClass}
              onClick={handleInsert}
              disabled={!sqlText.trim() || isSending}
            >
              {isSending ? "전송 중..." : "Supabase로 전송"}
            </button>
          </div>
        </div>

        {items.length > 0 ? (
          <>
            {/* 채널명 편집 */}
            <div className="mt-4 grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-[min(320px,100%)] items-center gap-2">
                <span className="text-[0.9rem] font-semibold text-ink-muted">
                  채널 :
                </span>
                <input
                  className={`${inputClass} flex-1 min-w-60 md:min-w-100`}
                  type="text"
                  value={channelOverride}
                  onChange={(e) => setChannelOverride(e.target.value)}
                  placeholder={channelTitle || "채널명"}
                />
              </div>
            </div>

            {/* 다운로드 진행 요약 */}
            {downloadSummary.total > 0 && (
              <div className="rounded-full bg-[rgba(16,35,35,0.08)] px-3 py-1 text-[0.85rem] font-semibold text-ink w-fit">
                다운로드 {downloadSummary.completed}/{downloadSummary.total}
              </div>
            )}

            {/* 에피소드 카드 목록 */}
            <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
              {items.map((item) => {
                const originalItem = originalItems.find(
                  (ori) => ori.filename === item.filename,
                );
                return (
                  <EpisodeCard
                    key={item.filename}
                    item={item}
                    originalDuration={originalItem?.duration}
                    downloadProgress={downloadProgress[item.filename]}
                    onDownload={downloadFile}
                    onStartEditDuration={startEditDuration}
                    onUpdateEditingDuration={updateEditingDuration}
                    onConfirmEditDuration={confirmEditDuration}
                    onCancelEditDuration={cancelEditDuration}
                  />
                );
              })}
            </div>

            {/* R2 폴더 설정 + 변경 반영 */}
            <div className="grid gap-4">
              <label className={`${fieldClass} max-w-125`}>
                <span className={fieldLabelClass}>R2 폴더</span>
                <input
                  type="text"
                  value={r2Folder}
                  onChange={(e) => setR2Folder(e.target.value)}
                  placeholder="/de-episodes-audio/program"
                  className={inputClass}
                />
              </label>
              <div className="col-span-full flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <a
                    className={ghostButtonClass}
                    href={`https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo?prefix=${encodeURIComponent(
                      r2Folder.replace(/^\/+/, ""),
                    )}%2F`}
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
                <button
                  className={primaryButtonClass}
                  type="button"
                  onClick={() => applyChanges(programId)}
                >
                  변경 반영
                </button>
              </div>
            </div>

            {/* SQL 에디터 */}
            <EpisodeSqlEditor
              sqlText={sqlText}
              originalSqlText={originalSqlText}
              onChange={setSqlText}
              onRestore={() => setSqlText(originalSqlText)}
            />
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-panel-border p-8 text-center text-ink-muted">
            피드를 실행하면 파싱된 항목이 표시됩니다.
          </div>
        )}
      </section>
    </>
  );
};

export default EpisodesPage;
