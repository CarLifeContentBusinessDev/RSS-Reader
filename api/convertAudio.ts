import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
};

const colorizeError = (message: string) => `${ANSI.red}${message}${ANSI.reset}`;

const buildLogPrefix = (logContext?: {
  channelName?: string;
  episodeTitle?: string;
  programId?: number;
  episodeId?: number;
  programIndex?: number;
  programTotal?: number;
  episodeIndex?: number;
  episodeTotal?: number;
}) => {
  const p =
    logContext?.programIndex && logContext?.programTotal
      ? `[P ${String(logContext.programIndex)}/${String(logContext.programTotal)}]`
      : "[P --/--]";
  const e =
    logContext?.episodeIndex && logContext?.episodeTotal
      ? `[E ${String(logContext.episodeIndex)}/${String(logContext.episodeTotal)}]`
      : "[E --/--]";
  const channel = logContext?.programId
    ? `[채널(${logContext.programId}): ${logContext.channelName || ""}]`
    : logContext?.channelName
      ? `[채널: ${logContext.channelName}]`
      : "[채널: ]";
  const episode = logContext?.episodeId
    ? `[에피(${logContext.episodeId}): ${logContext.episodeTitle || ""}]`
    : logContext?.episodeTitle
      ? `[에피: ${logContext.episodeTitle}]`
      : "[에피: ]";

  return `[convertAudio]${p}${e} ${channel} ${episode}`;
};

// Vercel 환경에서 ffmpeg 바이너리 경로 설정
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "POST") {
    console.error(
      colorizeError("[convertAudio] 변환 실패: Method not allowed"),
    );
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  await new Promise<void>((resolve) => {
    req.on("data", (chunk) => (body += chunk));
    req.on("end", resolve);
  });

  let parsed: {
    url?: string;
    filename?: string;
    logContext?: {
      channelName?: string;
      episodeTitle?: string;
      programId?: number;
      episodeId?: number;
      programIndex?: number;
      programTotal?: number;
      episodeIndex?: number;
      episodeTotal?: number;
    };
  };
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error(colorizeError("[convertAudio] 변환 실패: Invalid JSON"));
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { url, filename, logContext } = parsed;
  if (!url || !filename) {
    console.error(
      colorizeError("[convertAudio] 변환 실패: url, filename 누락"),
    );
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "url, filename 누락" }));
    return;
  }

  const contextPrefix = buildLogPrefix(logContext);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-"));
  const mp3Path = path.join(tmpDir, "input.mp3");
  const m4aPath = path.join(tmpDir, "output.m4a");

  try {
    const downloadStart = Date.now();

    // mp3 다운로드
    const upstream = await fetch(url);
    if (!upstream.ok) {
      throw new HttpError(
        502,
        `원본 오디오 다운로드 실패 (${upstream.status})`,
      );
    }
    const arrayBuffer = await upstream.arrayBuffer();
    const downloadTime = Date.now() - downloadStart;

    const sizeMB = arrayBuffer.byteLength / 1024 / 1024;
    void sizeMB;
    void downloadTime;

    fs.writeFileSync(mp3Path, Buffer.from(arrayBuffer));

    // ffmpeg 변환: AAC 저용량 프로필 (대용량 파일 대응)
    const convertStart = Date.now();

    await new Promise<void>((resolve, reject) => {
      ffmpeg(mp3Path)
        .audioCodec("aac")
        .audioBitrate("192k")
        .audioChannels(2)
        .audioFrequency(44100)
        .noVideo()
        .outputOptions([
          "-movflags faststart", // 스트리밍/빠른 재생 최적화
          "-profile:a aac_low", // 가장 호환성 높은 AAC-LC 프로필 사용
        ])
        .output(m4aPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(new HttpError(500, err.message)))
        .run();
    });
    const convertTime = Date.now() - convertStart;
    void convertTime;

    const m4aBuffer = fs.readFileSync(m4aPath);
    const base64 = m4aBuffer.toString("base64");

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ file: base64, filename, fileSize: m4aBuffer.length }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const statusCode =
      err instanceof HttpError
        ? err.statusCode
        : message.toLowerCase().includes("timeout")
          ? 504
          : 500;
    console.error(colorizeError(`${contextPrefix} 변환 실패: ${message}`));
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: statusCode === 504 ? "변환 시간 초과" : "변환 실패",
        details: message,
      }),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
