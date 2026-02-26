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

  const { uploadImageToR2, compressToWebP } = useImageDownload({
    showToast,
  });

  // 압축 이미지 상태 및 업로드 모달, 압축중 상태
  const [compressedBlob, setCompressedBlob] = useState<Blob | null>(null);
  const [compressedFilename, setCompressedFilename] = useState<string>("");
  const [compressedSize, setCompressedSize] = useState<number>(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);

  // 이미지 압축만 수행, 완료 시 모달 오픈
  const handleCompressImage = async () => {
    if (!sourceImgUrl || !title) return;
    setIsCompressing(true);
    try {
      const response = await fetch(sourceImgUrl);
      if (!response.ok) throw new Error("이미지 다운로드 실패");
      const blob = await response.blob();
      const { blob: compressed } = await compressToWebP(blob);
      setCompressedBlob(compressed);
      // 파일명: 제목 그대로 (공백, 한글 등 포함)
      const filename = `${title}.webp`;
      setCompressedFilename(filename);
      setCompressedSize(compressed.size);
      showToast("이미지 압축 완료!", "success");
      setShowUploadModal(true);
      setUploadDone(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        showToast(err.message, "error");
      } else {
        showToast("이미지 압축 실패", "error");
      }
    } finally {
      setIsCompressing(false);
    }
  };

  // R2 업로드 핸들러 (모달에서 호출)
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
        setShowUploadModal(false);
        showToast("R2 업로드 완료!", "success");
      }
      // 실패 시 uploadImageToR2 내부에서 에러 토스트 처리
    } finally {
      setIsUploading(false);
    }
  };

  // 업로드 다시시도
  const handleRetryUpload = () => {
    setUploadDone(false);
    setShowUploadModal(true);
    // 업로드는 모달에서 직접 버튼 클릭 시만 진행
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
  };

  return (
    <>
      {/* 이미지 업로드 모달 */}
      {showUploadModal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-8 min-w-[320px] max-w-[90vw]">
            <h3 className="mb-4 text-lg font-bold">압축 이미지 정보</h3>
            <div className="mb-2">파일명: {compressedFilename}</div>
            <div className="mb-2">
              사이즈: {(compressedSize / 1024).toFixed(1)} KB
            </div>
            {compressedBlob && (
              <div className="mb-4 flex justify-center">
                <img
                  src={URL.createObjectURL(compressedBlob)}
                  alt="압축 이미지 미리보기"
                  style={{
                    maxWidth: 120,
                    maxHeight: 120,
                    borderRadius: 8,
                    boxShadow: "0 2px 8px #0002",
                  }}
                />
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                className={ghostButtonClass}
                type="button"
                onClick={() => setShowUploadModal(false)}
                disabled={isUploading}
              >
                취소
              </button>
              {!uploadDone ? (
                <button
                  className={primaryButtonClass}
                  type="button"
                  onClick={handleUploadImage}
                  disabled={!compressedBlob || isUploading}
                >
                  {isUploading ? "업로드 중.." : "R2에 업로드"}
                </button>
              ) : (
                <>
                  <button
                    className={
                      primaryButtonClass + " bg-green-500 hover:bg-green-600"
                    }
                    type="button"
                    disabled
                  >
                    업로드 완료
                  </button>
                  <button
                    className={ghostButtonClass}
                    type="button"
                    onClick={handleRetryUpload}
                  >
                    다시시도
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
              isDownloading={isCompressing || isUploading}
              uploadDone={uploadDone}
              hasCompressed={!!compressedBlob}
              onTitleChange={setTitle}
              onSubtitleChange={setSubtitle}
              onImageFolderChange={setImageFolder}
              onApply={() => rebuildSql(imageFolder)}
              onDownloadImage={handleCompressImage}
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
