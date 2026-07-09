import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { cleanupStaleTmpDirs } from "./_lib/tmpCleanup.js";

// m4a(ipod) 컨테이너는 mp3 오디오 스트림 copy를 지원하지 않는다.
const M4A_REMUX_CODECS = new Set(["aac", "alac"]);

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
};

const colorizeError = (message: string) => `${ANSI.red}${message}${ANSI.reset}`;
const colorizeSuccess = (message: string) =>
  `${ANSI.green}${message}${ANSI.reset}`;

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

  return `[convertAndUploadAudio]${p}${e} ${channel} ${episode}`;
};

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const getSourceAudioCodec = async (filePath: string) => {
  const probeData = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });

  const audioStream = probeData.streams.find(
    (stream) => stream.codec_type === "audio",
  );
  return {
    codec: audioStream?.codec_name?.toLowerCase(),
    durationSec: probeData.format.duration,
  };
};

const runM4aConvert = async (
  inputPath: string,
  outputPath: string,
  mode: "copy" | "aac",
  logPrefix?: string,
) => {
  await new Promise<void>((resolve, reject) => {
    if (fs.existsSync(outputPath)) {
      fs.rmSync(outputPath, { force: true });
    }

    const stderrLines: string[] = [];
    const command = ffmpeg(inputPath).noVideo().output(outputPath);

    if (mode === "copy") {
      command.outputOptions(["-c:a copy", "-movflags +faststart"]);
    } else {
      command
        .audioCodec("aac")
        .audioBitrate("320k")
        .outputOptions(["-movflags +faststart", "-profile:a aac_low"]);
    }

    let lastProgressLog = 0;
    command
      .on("stderr", (line) => {
        stderrLines.push(line);
        if (stderrLines.length > 80) {
          stderrLines.shift();
        }
      })
      .on("progress", (progress) => {
        const now = Date.now();
        if (now - lastProgressLog < 15000) return;
        lastProgressLog = now;
        console.log(
          `${logPrefix ?? "[convertAndUploadAudio]"} 인코딩 진행: ${progress.timemark ?? "?"} (${progress.percent ? progress.percent.toFixed(1) + "%" : "?"})`,
        );
      })
      .on("end", () => resolve())
      .on("error", (err) => {
        const stderrTail = stderrLines.slice(-12).join("\n").trim();
        const detail = stderrTail
          ? `${err.message}\n${stderrTail}`
          : err.message;
        reject(new HttpError(500, detail));
      })
      .run();
  });
};

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
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
  const R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
  const R2_PUBLIC_BASE_URL = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;

  if (
    !R2_BUCKET ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_ENDPOINT
  ) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "R2 환경변수 누락" }));
    return;
  }

  let body = "";
  await new Promise<void>((resolve) => {
    req.on("data", (chunk) => (body += chunk));
    req.on("end", resolve);
  });

  let parsed: {
    url?: string;
    file?: string;
    originalFilename?: string;
    filename?: string;
    folder?: string;
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
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { url, file, originalFilename, filename, folder, logContext } = parsed;
  if ((!url && !file) || !filename) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "url/file, filename 누락" }));
    return;
  }

  const contextPrefix = buildLogPrefix(logContext);
  cleanupStaleTmpDirs("audio-");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-"));
  const sourceExt = originalFilename
    ? path.extname(originalFilename).toLowerCase() || ".mp3"
    : ".mp3";
  const inputPath = path.join(tmpDir, `input${sourceExt}`);
  const m4aPath = path.join(tmpDir, "output.m4a");

  try {
    // 1. 오디오 입력 확보 (URL 또는 base64 파일)
    const downloadStart = Date.now();
    if (file) {
      const inputBuffer = Buffer.from(file, "base64");
      fs.writeFileSync(inputPath, inputBuffer);
    } else {
      const upstream = await fetch(url!);
      if (!upstream.ok) {
        throw new HttpError(
          502,
          `원본 오디오 다운로드 실패 (${upstream.status})`,
        );
      }
      const arrayBuffer = await upstream.arrayBuffer();
      fs.writeFileSync(inputPath, Buffer.from(arrayBuffer));
      const sizeMB = arrayBuffer.byteLength / 1024 / 1024;
      console.log(
        `${contextPrefix} 다운로드 완료: ${sizeMB.toFixed(1)}MB, ${((Date.now() - downloadStart) / 1000).toFixed(1)}s`,
      );
    }

    // 2. m4a 변환
    const convertStart = Date.now();
    const { codec: sourceCodec, durationSec } =
      await getSourceAudioCodec(inputPath);
    const canRemux = !!sourceCodec && M4A_REMUX_CODECS.has(sourceCodec);
    console.log(
      `${contextPrefix} 원본 길이: ${durationSec ? (durationSec / 60).toFixed(1) + "분" : "?"}, codec: ${sourceCodec ?? "unknown"}`,
    );

    if (canRemux) {
      try {
        await runM4aConvert(inputPath, m4aPath, "copy", contextPrefix);
      } catch (copyErr) {
        const copyMessage =
          copyErr instanceof Error ? copyErr.message : String(copyErr);
        console.warn(
          colorizeError(
            `${contextPrefix} copy 변환 실패, AAC로 재시도: ${copyMessage}`,
          ),
        );
        await runM4aConvert(inputPath, m4aPath, "aac", contextPrefix);
      }
    } else {
      await runM4aConvert(inputPath, m4aPath, "aac", contextPrefix);
    }
    console.log(
      `${contextPrefix} 변환 완료 (codec: ${sourceCodec ?? "unknown"}, remux: ${canRemux}): ${((Date.now() - convertStart) / 1000).toFixed(1)}s`,
    );

    // 3. R2 직접 업로드 (base64 변환 없음)
    const s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const trimmedFolder = folder
      ? folder.replace(/^\/+/, "").replace(/\/+$/g, "")
      : "";
    const key = trimmedFolder ? `${trimmedFolder}/${filename}` : filename;

    const fileBuffer = fs.readFileSync(m4aPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: "audio/mp4",
      }),
    );

    const baseUrl = R2_PUBLIC_BASE_URL || R2_ENDPOINT;
    const resultUrl = `${baseUrl}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;

    console.log(colorizeSuccess(`${contextPrefix} 변환+업로드 완료: ${key}`));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url: resultUrl }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const statusCode =
      err instanceof HttpError
        ? err.statusCode
        : message.toLowerCase().includes("timeout")
          ? 504
          : 500;
    console.error(colorizeError(`${contextPrefix} 실패: ${message}`));
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          statusCode === 504
            ? "변환 시간 초과"
            : statusCode === 502
              ? "원본 오디오 다운로드 실패"
              : "변환/업로드 실패",
        details: message,
      }),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
