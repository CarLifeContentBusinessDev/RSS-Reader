import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { GuidePanel } from "../components/GuidePanel";
import { ProcessStatus } from "../components/ProcessStatus";
import { ProgramFetchForm } from "../components/ProgramFetchForm";
import { ProgramInfoEditor } from "../components/ProgramInfoEditor";
import SqlOutput from "../components/SqlOutput";
import { LABELS } from "../constants/labels";
import { MESSAGES } from "../constants/message";
import {
  buildImageFolder,
  DEFAUKLT_LANGUAGE,
  PROGRAM_GUIDE_STEPS,
} from "../constants/options";
import {
  ghostButtonClass,
  panelClass,
  primaryButtonClass,
} from "../constants/style";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useImageDownload } from "../hooks/useImageDownload";
import { useProcessLog } from "../hooks/useProcessLog";
import { useProgramFetch } from "../hooks/useProgramFetch";
import { useProgramOptions } from "../hooks/useProgramOptions";
import type { ToastTone } from "../types";

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

  const { uploadImageToR2, compressToWebP } = useImageDownload({ showToast });

  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedFilename, setCompressedFilename] = useState<string>("");
  const [compressedSize, setCompressedSize] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);

  // 프로그램 불러오기 완료 시 자동 압축
  useEffect(() => {
    if (!sourceImgUrl || !title) return;
    const compress = async () => {
      setCompressedBlob(null);
      setUploadDone(false);
      setIsCompressing(true);
      try {
        const response = await fetch(sourceImgUrl);
        if (!response.ok) throw new Error("이미지 다운로드 실패");
        const blob = await response.blob();
        const { blob: compressed } = await compressToWebP(blob);
        setCompressedBlob(compressed);
        setCompressedFilename(`${title}.webp`);
        setCompressedSize(compressed.size);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "이미지 압축 실패",
          "error",
        );
      } finally {
        setIsCompressing(false);
      }
    };
    compress();
  }, [sourceImgUrl]);

  const handleUploadImage = async () => {
    if (!compressedBlob || !compressedFilename) return;
    setIsUploading(true);
    setUploadDone(false);
    try {
      const result = await uploadImageToR2(
        compressedBlob,
        imageFolder,
        compressedFilename,
      );
      if (result) {
        setUploadDone(true);
        showToast("R2 업로드 완료!", "success");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryUpload = () => {
    setUploadDone(false);
  };

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
    setCompressedBlob(null);
    setUploadDone(false);
  };

  return (
    <>
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
              isCompressing={isCompressing}
              isUploading={isUploading}
              uploadDone={uploadDone}
              compressedBlob={compressedBlob}
              compressedFilename={compressedFilename}
              compressedSize={compressedSize}
              onTitleChange={setTitle}
              onSubtitleChange={setSubtitle}
              onImageFolderChange={setImageFolder}
              onApply={() => rebuildSql(imageFolder)}
              onUpload={handleUploadImage}
              onRetryUpload={handleRetryUpload}
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
