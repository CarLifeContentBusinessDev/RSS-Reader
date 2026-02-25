import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import SqlOutput from "../components/SqlOutput";
import {
  ghostButtonClass,
  panelClass,
  primaryButtonClass,
} from "../constants/style";
import type { ToastTone } from "../types";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useImageDownload } from "../hooks/useImageDownload";
import { useProcessLog } from "../hooks/useProcessLog";
import { useProgramFetch } from "../hooks/useProgramFetch";
import { useProgramOptions } from "../hooks/useProgramOptions";
import { GuidePanel } from "../components/GuidePanel";
import { ProcessStatus } from "../components/ProcessStatus";
import { ProgramFetchForm } from "../components/ProgramFetchForm";
import { ProgramInfoEditor } from "../components/ProgramInfoEditor";
import {
  buildImageFolder,
  DEFAUKLT_LANGUAGE,
  PROGRAM_GUIDE_STEPS,
} from "../constants/options";
import { MESSAGES } from "../constants/message";
import { LABELS } from "../constants/labels";

interface ProgramsPageProps {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

const ProgramsPage = ({
  authUserEmail,
  onRequireLogin,
  showToast,
}: ProgramsPageProps) => {
  const [rssUrl, setRssUrl] = useState("");
  const [language, setLanguage] = useState(DEFAUKLT_LANGUAGE);
  const [type, setType] = useState("podcast");
  const [imageFolder, setImageFolder] = useState(
    buildImageFolder(DEFAUKLT_LANGUAGE),
  );

  useEffect(() => {
    setImageFolder(buildImageFolder(language));
  }, [language]);

  const { logs, processState, addLog, setProcess, clearLogs } = useProcessLog({
    showToast,
  });

  const { guard } = useAuthGuard({ authUserEmail, onRequireLogin, showToast });

  const {
    categoryOptions,
    broadcastingOptions,
    isLoading: optionsLoading,
    categoryId,
    setCategoryId,
    broadcastingId,
    setBroadcastingId,
    resetSelects,
  } = useProgramOptions(language);

  const {
    title,
    subtitle,
    imgUrl,
    sourceImgUrl,
    sqlText,
    original,
    error,
    isLoading,
    isSending,
    setTitle,
    setSubtitle,
    setSqlText,
    fetchProgram,
    insertToSupabase,
    rebuildSql,
    resetToOriginal,
    resetFields,
  } = useProgramFetch({
    language,
    imageFolder,
    type,
    categoryId,
    broadcastingId,
    addLog,
    setProcess,
    showToast,
  });

  const { downloadImage } = useImageDownload({ showToast });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    guard(MESSAGES.LOGIN_REQUIRED_FETCH, () => {
      clearLogs();
      fetchProgram(rssUrl);
    });
  };

  const handleInsert = () => {
    guard(MESSAGES.LOGIN_REQUIRED_SEND, () => insertToSupabase());
  };

  const handleReset = () => {
    setRssUrl("");
    setType("podcast");
    setLanguage(DEFAUKLT_LANGUAGE);
    setImageFolder(buildImageFolder(DEFAUKLT_LANGUAGE));
    resetFields();
    clearLogs();
  };

  return (
    <>
      {/* 헤더 */}
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            {LABELS.PAGE.PROGRAM.TITLE}
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            {LABELS.PAGE.PROGRAM.DESCRIPTION}
          </p>
        </div>
        <GuidePanel guide_steps={PROGRAM_GUIDE_STEPS} />
      </header>

      {/* 입력 폼 패널 */}
      <section className={panelClass}>
        <ProgramFetchForm
          rssUrl={rssUrl}
          type={type}
          language={language}
          categoryId={categoryId}
          broadcastingId={broadcastingId}
          categoryOptions={categoryOptions}
          broadcastingOptions={broadcastingOptions}
          optionsLoading={optionsLoading}
          isLoading={isLoading}
          onRssUrlChange={setRssUrl}
          onTypeChange={setType}
          onLanguageChange={setLanguage}
          onCategoryChange={setCategoryId}
          onBroadcastingChange={setBroadcastingId}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />

        <ProcessStatus logs={logs} processState={processState} error={error} />
      </section>

      {/* 프로그램 정보 패널 */}
      <section className={`${panelClass} grid gap-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2>{LABELS.SECTION.PROGRAM_INFO.TITLE}</h2>
            <p className="text-ink-muted">
              {LABELS.SECTION.PROGRAM_INFO.DESCRIPTION}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={ghostButtonClass}
              type="button"
              onClick={() => resetToOriginal(imageFolder, resetSelects)}
              disabled={!original}
            >
              {LABELS.BUTTON.RESTORE}
            </button>
            <button
              className={primaryButtonClass}
              onClick={handleInsert}
              disabled={!sqlText.trim() || isSending}
            >
              {isSending ? LABELS.BUTTON.SENDING : LABELS.BUTTON.SEND_SUPABASE}
            </button>
          </div>
        </div>

        {title ? (
          <>
            <ProgramInfoEditor
              title={title}
              subtitle={subtitle}
              sourceImgUrl={sourceImgUrl}
              imgUrl={imgUrl}
              imageFolder={imageFolder}
              language={language}
              onTitleChange={setTitle}
              onSubtitleChange={setSubtitle}
              onImageFolderChange={setImageFolder}
              onApply={() => rebuildSql(imageFolder)}
              onDownloadImage={() => downloadImage(sourceImgUrl, title)}
            />
            <SqlOutput
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
            />
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-panel-border p-8 text-center text-ink-muted">
            {LABELS.EMPTY.PROGRAM}
          </div>
        )}
      </section>
    </>
  );
};

export default ProgramsPage;
