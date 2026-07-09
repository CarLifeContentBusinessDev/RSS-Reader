import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";
import { cleanupStaleTmpDirs } from "./_lib/tmpCleanup.js";

// m4a(ipod) 컨테이너는 mp3 오디오 스트림 copy를 지원하지 않는다.
const M4A_REMUX_CODECS = new Set(["aac", "alac"]);
const MAX_BASE64_SAFE_BYTES = 380 * 1024 * 1024; // JS 문자열 한도 여유를 남긴 base64 안전 상한

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
      command.outputOptions([
        "-c:a copy",
        "-movflags +faststart", // 스트리밍/빠른 재생 최적화
      ]);
    } else {
      command.audioCodec("aac").audioBitrate("320k").outputOptions([
        "-movflags +faststart", // 스트리밍/빠른 재생 최적화
        "-profile:a aac_low",
      ]);
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
          `${logPrefix ?? "[convertAudio]"} 인코딩 진행: ${progress.timemark ?? "?"} (${progress.percent ? progress.percent.toFixed(1) + "%" : "?"})`,
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

  cleanupStaleTmpDirs("audio-");
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
    console.log(
      `${contextPrefix} 다운로드 완료: ${sizeMB.toFixed(1)}MB, ${(downloadTime / 1000).toFixed(1)}s`,
    );

    fs.writeFileSync(mp3Path, Buffer.from(arrayBuffer));

    // 가능한 코덱은 무재인코딩 리먹스, 그 외는 웹/앱 재생 호환성이 높은 AAC 인코딩
    const convertStart = Date.now();
    const { codec: sourceCodec, durationSec } =
      await getSourceAudioCodec(mp3Path);
    const canRemuxWithoutReencode =
      !!sourceCodec && M4A_REMUX_CODECS.has(sourceCodec);
    console.log(
      `${contextPrefix} 원본 길이: ${durationSec ? (durationSec / 60).toFixed(1) + "분" : "?"}, codec: ${sourceCodec ?? "unknown"}`,
    );

    if (canRemuxWithoutReencode) {
      try {
        await runM4aConvert(mp3Path, m4aPath, "copy", contextPrefix);
      } catch (copyErr) {
        const copyMessage =
          copyErr instanceof Error ? copyErr.message : String(copyErr);
        console.warn(
          colorizeError(
            `${contextPrefix} copy 변환 실패, AAC로 재시도: ${copyMessage}`,
          ),
        );
        await runM4aConvert(mp3Path, m4aPath, "aac", contextPrefix);
      }
    } else {
      await runM4aConvert(mp3Path, m4aPath, "aac", contextPrefix);
    }
    const convertTime = Date.now() - convertStart;
    console.log(
      `${contextPrefix} 변환 완료 (codec: ${sourceCodec ?? "unknown"}, remux: ${canRemuxWithoutReencode}): ${(convertTime / 1000).toFixed(1)}s`,
    );

    let outputSize = fs.statSync(m4aPath).size;
    if (outputSize > MAX_BASE64_SAFE_BYTES) {
      console.warn(
        colorizeError(
          `${contextPrefix} 무손실 결과가 너무 큼(${Math.round(outputSize / 1024 / 1024)}MB), AAC 320k로 재변환`,
        ),
      );
      await runM4aConvert(mp3Path, m4aPath, "aac", contextPrefix);
      outputSize = fs.statSync(m4aPath).size;
    }

    if (outputSize > MAX_BASE64_SAFE_BYTES) {
      throw new HttpError(
        413,
        "변환 결과 파일이 너무 커 base64 처리 불가 (AAC 재변환 후에도 초과).",
      );
    }

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
        error:
          statusCode === 504
            ? "변환 시간 초과"
            : statusCode === 413
              ? "변환 결과 파일이 너무 큼"
              : "변환 실패",
        details: message,
      }),
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
