import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
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
import { ghostButtonClass, panelClass } from "../constants/style";
import { BASE_URL } from "../constants/options";
import { buildR2ImageUrl } from "../utils/r2";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useImageDownload } from "../hooks/useImageDownload";
import { buildProgramSqlText } from "../utils/sql";
import { useProcessLog } from "../hooks/useProcessLog";
import { useProgramFetch } from "../hooks/useProgramFetch";
import { useProgramOptions } from "../hooks/useProgramOptions";
import type { ToastTone } from "../types";

const PROGRAMS_FORM_STORAGE_KEY = "rss-reader:programs-form";

type ProgramsFormSnapshot = {
  rssUrl?: string;
  type?: string;
  language?: string;
  imageFolder?: string;
  categoryId?: number | "";
  broadcastingId?: number | "";
  autoUploadToR2?: boolean;
  autoSendToSupabase?: boolean;
};

const loadProgramsSnapshot = (): ProgramsFormSnapshot => {
  try {
    const raw = localStorage.getItem(PROGRAMS_FORM_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as ProgramsFormSnapshot;
  } catch {
    return {};
  }
};

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
  const savedSnapshot = loadProgramsSnapshot();

  const [rssUrl, setRssUrl] = useState(savedSnapshot.rssUrl ?? "");
  const [language, setLanguage] = useState(
    savedSnapshot.language ?? DEFAUKLT_LANGUAGE,
  );
  const [type, setType] = useState(savedSnapshot.type ?? "podcast");
  const [imageFolder, setImageFolder] = useState(
    savedSnapshot.imageFolder ??
      buildImageFolder(savedSnapshot.language ?? DEFAUKLT_LANGUAGE),
  );
  const [autoUploadToR2, setAutoUploadToR2] = useState(
    Boolean(savedSnapshot.autoUploadToR2),
  );
  const [autoSendToSupabase, setAutoSendToSupabase] = useState(
    Boolean(savedSnapshot.autoSendToSupabase),
  );
  const isFirstLanguageSync = useRef(true);
  const restoredSelects = useRef(false);
  const savedCategoryId =
    typeof savedSnapshot.categoryId === "number"
      ? savedSnapshot.categoryId
      : "";
  const savedBroadcastingId =
    typeof savedSnapshot.broadcastingId === "number"
      ? savedSnapshot.broadcastingId
      : "";

  useEffect(() => {
    if (isFirstLanguageSync.current) {
      isFirstLanguageSync.current = false;
      return;
    }
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
    insertResult,
    setInsertResult,
    setTitle,
    setSubtitle,
    setImgUrl,
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
  const isAllAutomationSelected = autoUploadToR2 && autoSendToSupabase;

  useEffect(() => {
    if (restoredSelects.current) return;

    if (
      savedCategoryId !== "" &&
      categoryId === "" &&
      categoryOptions.some((opt) => Number(opt.value) === savedCategoryId)
    ) {
      setCategoryId(savedCategoryId);
    }

    if (
      savedBroadcastingId !== "" &&
      broadcastingId === "" &&
      broadcastingOptions.some(
        (opt) => Number(opt.value) === savedBroadcastingId,
      )
    ) {
      setBroadcastingId(savedBroadcastingId);
    }

    if (
      (savedCategoryId === "" || categoryId !== "") &&
      (savedBroadcastingId === "" || broadcastingId !== "")
    ) {
      restoredSelects.current = true;
    }
  }, [
    savedCategoryId,
    savedBroadcastingId,
    categoryId,
    broadcastingId,
    categoryOptions,
    broadcastingOptions,
    setCategoryId,
    setBroadcastingId,
  ]);

  useEffect(() => {
    const snapshot: ProgramsFormSnapshot = {
      rssUrl,
      type,
      language,
      imageFolder,
      categoryId,
      broadcastingId,
      autoUploadToR2,
      autoSendToSupabase,
    };
    localStorage.setItem(PROGRAMS_FORM_STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    rssUrl,
    type,
    language,
    imageFolder,
    categoryId,
    broadcastingId,
    autoUploadToR2,
    autoSendToSupabase,
  ]);

  // title, subtitle 변경 시 자동으로 SQL 재생성
  useEffect(() => {
    if (title || subtitle) {
      rebuildSql(imageFolder);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle, imageFolder]);

  // 자동 R2 업로드
  useEffect(() => {
    if (autoUploadToR2 && compressedBlob && !uploadDone && !isUploading) {
      console.log("🚀 자동 R2 업로드 시작");
      handleUploadImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoUploadToR2, compressedBlob, uploadDone, isUploading]);

  // 자동 Supabase 전송
  useEffect(() => {
    if (
      autoSendToSupabase &&
      uploadDone &&
      sqlText.trim() &&
      !isSending &&
      !insertResult
    ) {
      console.log("🚀 자동 Supabase 전송 시작");
      handleInsert();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendToSupabase, uploadDone, sqlText, isSending, insertResult]);

  // 프로그램 불러오기 완료 시 자동 압축
  useEffect(() => {
    if (!sourceImgUrl || !title) return;
    const compress = async () => {
      setCompressedBlob(null);
      setUploadDone(false);
      setIsCompressing(true);
      console.log("🖼️ 이미지 압축 시작:", sourceImgUrl);
      try {
        // 서버 프록시를 통해 이미지 가져오기 (CORS 우회)
        const encodedUrl = encodeURIComponent(sourceImgUrl);
        console.log("📡 프록시를 통해 이미지 다운로드 중...");
        const response = await fetch(`/api/download?url=${encodedUrl}`);
        if (!response.ok) {
          throw new Error(
            `이미지 다운로드 실패: ${response.status} ${response.statusText}`,
          );
        }
        console.log("✅ 이미지 다운로드 완료, 압축 시작...");
        const blob = await response.blob();
        console.log(`📦 원본 크기: ${(blob.size / 1024).toFixed(1)} KB`);
        const { blob: compressed } = await compressToWebP(blob);
        console.log(
          `✨ 압축 완료: ${(compressed.size / 1024).toFixed(1)} KB (${((1 - compressed.size / blob.size) * 100).toFixed(1)}% 감소)`,
        );
        setCompressedBlob(compressed);
        setCompressedFilename(`${title}.webp`);
        setCompressedSize(compressed.size);
      } catch (err) {
        console.error("❌ 이미지 압축 에러:", err);
        showToast(
          err instanceof Error ? err.message : "이미지 압축 실패",
          "error",
        );
      } finally {
        setIsCompressing(false);
        console.log("🏁 압축 프로세스 종료");
      }
    };
    compress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImgUrl, title]);

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
        // 업로드 성공 시 안전한 R2 이미지 URL 생성 (파일명 인코딩)
        setImgUrl(
          buildR2ImageUrl(title, BASE_URL, imageFolder, "webp", language),
        );
        showToast("R2 업로드 완료!", "success");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetryUpload = () => {
    setUploadDone(false);
  };

  const handleRetrySend = () => {
    setInsertResult("");
  };

  const handleSelectAllAutomation = () => {
    if (isAllAutomationSelected) {
      setAutoUploadToR2(false);
      setAutoSendToSupabase(false);
      return;
    }
    setAutoUploadToR2(true);
    setAutoSendToSupabase(true);
  };

  const handleImgUrlChange = (newImgUrl: string) => {
    setImgUrl(newImgUrl);
    // imgUrl 변경 시 SQL 재생성 (title과 subtitle은 현재 값 유지)
    if (title) {
      setSqlText(
        buildProgramSqlText(
          {
            title: title.trim() || "제목 없음",
            subtitle: subtitle.trim(),
            imgUrl: newImgUrl,
          },
          type,
          language,
          categoryId || undefined,
          broadcastingId || undefined,
        ),
      );
    }
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
    localStorage.removeItem(PROGRAMS_FORM_STORAGE_KEY);
    setRssUrl("");
    setType("podcast");
    setLanguage(DEFAUKLT_LANGUAGE);
    setImageFolder(buildImageFolder(DEFAUKLT_LANGUAGE));
    setAutoUploadToR2(false);
    setAutoSendToSupabase(false);
    resetFields();
    resetSelects();
    clearLogs();
    setCompressedBlob(null);
    setCompressedFilename("");
    setCompressedSize(0);
    setIsCompressing(false);
    setIsUploading(false);
    setUploadDone(false);
    setInsertResult("");
    restoredSelects.current = true;
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
          imageFolder={imageFolder}
          categoryId={categoryId}
          broadcastingId={broadcastingId}
          categoryOptions={categoryOptions}
          broadcastingOptions={broadcastingOptions}
          optionsLoading={optionsLoading}
          isLoading={isLoading}
          autoUploadToR2={autoUploadToR2}
          autoSendToSupabase={autoSendToSupabase}
          hasProgram={!!title}
          onRssUrlChange={setRssUrl}
          onTypeChange={setType}
          onLanguageChange={setLanguage}
          onImageFolderChange={setImageFolder}
          onCategoryChange={setCategoryId}
          onBroadcastingChange={setBroadcastingId}
          onAutoUploadChange={setAutoUploadToR2}
          onAutoSendChange={setAutoSendToSupabase}
          automationToggleLabel={
            isAllAutomationSelected ? "전체 해제" : "전체 선택"
          }
          onSelectAllAutomation={handleSelectAllAutomation}
          onSubmit={handleSubmit}
          onReset={handleReset}
        />
        <ProcessStatus
          logs={logs}
          processState={processState}
          error={error}
          successInfo={
            insertResult &&
            ` - ${title} (ID: ${insertResult.replace("program_id : ", "")})`
          }
        />
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
          </div>
        </div>

        {title ? (
          <>
            <ProgramInfoEditor
              title={title}
              subtitle={subtitle}
              sourceImgUrl={sourceImgUrl}
              imgUrl={imgUrl}
              isCompressing={isCompressing}
              isUploading={isUploading}
              uploadDone={uploadDone}
              compressedBlob={compressedBlob}
              compressedFilename={compressedFilename}
              compressedSize={compressedSize}
              sqlText={sqlText}
              isSending={isSending}
              insertResult={insertResult}
              onTitleChange={setTitle}
              onSubtitleChange={setSubtitle}
              onImgUrlChange={handleImgUrlChange}
              onUpload={handleUploadImage}
              onRetryUpload={handleRetryUpload}
              onSendToSupabase={handleInsert}
              onRetrySend={handleRetrySend}
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
