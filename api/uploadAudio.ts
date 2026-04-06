import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { IncomingMessage, ServerResponse } from "node:http";

const ANSI = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

const colorize = (message: string, color: keyof typeof ANSI) =>
  `${ANSI[color]}${message}${ANSI.reset}`;

type LogContext = {
  channelName?: string;
  episodeTitle?: string;
  programId?: number;
  episodeId?: number;
  programIndex?: number;
  programTotal?: number;
  episodeIndex?: number;
  episodeTotal?: number;
};

interface RequestWithBody extends IncomingMessage {
  body?: {
    folder?: string;
    filename?: string;
    file?: string; // base64
    logContext?: LogContext;
  };
}

const toLogContext = (value: unknown): LogContext | undefined => {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return value as LogContext;
};

const buildLogPrefix = (logContext?: LogContext) => {
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

  return `[uploadAudio]${p}${e} ${channel} ${episode}`;
};

export default async function handler(
  req: RequestWithBody,
  res: ServerResponse,
) {
  if (req.method !== "POST") {
    console.error(
      colorize("[uploadAudio] 업로드 실패: Method not allowed", "red"),
    );
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
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
    console.error(
      colorize("[uploadAudio] 업로드 실패: R2 환경변수 누락", "red"),
    );
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "R2 환경변수 누락" }));
    return;
  }

  let rawBody = "";
  await new Promise<void>((resolve) => {
    req.on("data", (chunk) => (rawBody += chunk));
    req.on("end", resolve);
  });

  let parsedBody: {
    folder?: string;
    filename?: string;
    file?: string;
    logContext?: unknown;
  };
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { folder, filename, file, logContext } = parsedBody;

  if (!file || !filename) {
    console.error(
      colorize("[uploadAudio] 업로드 실패: file 또는 filename 누락", "red"),
    );
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "file 또는 filename 누락" }));
    return;
  }

  const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });

  const fileBuffer = Buffer.from(file, "base64");
  // 폴더/파일명 인코딩 없이 원본 문자열 그대로 사용
  let key = "";
  if (folder) {
    const trimmedFolder = folder.replace(/^\/+/, "").replace(/\/+$/g, "");
    key = `${trimmedFolder}/${filename}`;
  } else {
    key = filename;
  }

  const contextPrefix = buildLogPrefix(toLogContext(logContext));

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: "audio/mp4",
      }),
    );

    const baseUrl = R2_PUBLIC_BASE_URL || R2_ENDPOINT;
    const url = `${baseUrl}/${encodeURIComponent(key).replace(/%2F/g, "/")}`;
    console.log(colorize(`${contextPrefix} 업로드 완료: ${key}`, "green"));
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(colorize(`${contextPrefix} 업로드 실패: ${message}`, "red"));
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "R2 업로드 실패", details: message }));
  }
}
