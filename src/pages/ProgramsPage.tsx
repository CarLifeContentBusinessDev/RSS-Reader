import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import type { ToastTone } from "../types";
import LogList from "../components/LogList";
import SqlOutput from "../components/SqlOutput";
import {
  ghostButtonClass,
  panelClass,
  primaryButtonClass,
} from "../constants/style";

import { useProcessLog } from "../hooks/useProcessLog";
import { useProgramFetch } from "../hooks/useProgramFetch";
import { useProgramOptions } from "../hooks/useProgramOptions";
import { useImageDownload } from "../hooks/useImageDownload";

import { ProgramFetchForm } from "../components/ProgramFetchForm";
import { ProgramInfoEditor } from "../components/ProgramInfoEditor";
import { GuidePanel } from "../components/GuidePanel";
import { PROGRAM_GUIDE_STEPS } from "../constants/options";

const buildImageFolder = (language: string) =>
  language === "en" ? "/eng_images/program" : `/${language}_images/program`;

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
  const [language, setLanguage] = useState("ko");
  const [type, setType] = useState("podcast");
  const [imageFolder, setImageFolder] = useState(buildImageFolder("ko"));

  // language 변경 시 이미지 폴더 자동 갱신
  useEffect(() => {
    setImageFolder(buildImageFolder(language));
  }, [language]);

  const { logs, processState, addLog, setProcess, clearLogs } = useProcessLog({
    showToast,
  });

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
    insertResult,
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
    if (!authUserEmail) {
      showToast("로그인 후 불러올 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
    clearLogs();
    fetchProgram(rssUrl);
  };

  const handleInsert = () => {
    if (!authUserEmail) {
      showToast("로그인 후 전송할 수 있습니다.", "error");
      onRequireLogin();
      return;
    }
    insertToSupabase();
  };

  const handleReset = () => {
    setRssUrl("");
    setType("podcast");
    setLanguage("de");
    setImageFolder(buildImageFolder("de"));
    resetFields();
    clearLogs();
  };

  const handleResetToOriginal = () => {
    resetToOriginal(imageFolder, resetSelects);
  };

  const handleApply = () => {
    rebuildSql(imageFolder);
  };

  return (
    <>
      {/* 헤더 */}
      <header className="flex gap-8 items-center">
        <div>
          <h1 className="mb-3 text-[clamp(2.6rem,4vw,4.2rem)]">
            Program Builder
          </h1>
          <p className="text-[1.1rem] text-ink-muted">
            RSS에서 채널 정보를 가져와 programs 테이블에 추가합니다.
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

        {/* 에러 배너 */}
        {error && (
          <div className="mt-4 rounded-2xl border border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] p-4 text-[#742b2b]">
            {error}
          </div>
        )}

        {/* 로그 */}
        <LogList logs={logs} />

        {/* 프로세스 상태 배너 */}
        {processState.tone !== "idle" && (
          <div
            className={`mt-4 rounded-2xl border p-4 ${
              processState.tone === "success"
                ? "border-[rgba(120,210,160,0.45)] bg-[rgba(120,210,160,0.2)] text-[#245c3d]"
                : processState.tone === "error"
                  ? "border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] text-[#742b2b]"
                  : "border-[rgba(242,201,76,0.4)] bg-[rgba(242,201,76,0.2)] text-[#6b4d00]"
            }`}
          >
            {processState.tone === "success" && "✓ 완료"}
            {processState.tone === "error" && "✗ 실패"}
            {processState.tone === "working" && "처리 중..."}
          </div>
        )}

        {/* Insert 결과 */}
        {insertResult && (
          <div className="mt-4 rounded-2xl border border-[rgba(120,210,160,0.45)] bg-[rgba(120,210,160,0.2)] p-4 text-[#245c3d]">
            {insertResult}
          </div>
        )}
      </section>

      {/* 프로그램 정보 패널 */}
      <section className={`${panelClass} grid gap-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2>프로그램 정보</h2>
            <p className="text-ink-muted">RSS 채널 메타데이터</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className={ghostButtonClass}
              type="button"
              onClick={handleResetToOriginal}
              disabled={!original}
            >
              원래대로
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
              onApply={handleApply}
              onDownloadImage={() => downloadImage(sourceImgUrl, title)}
            />
            <SqlOutput
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
            />
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-panel-border p-8 text-center text-ink-muted">
            프로그램 RSS URL을 입력하고 프로그램 불러오기를 실행하면 결과가
            표시됩니다.
          </div>
        )}
      </section>
    </>
  );
};

export default ProgramsPage;
