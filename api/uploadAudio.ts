import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { IncomingMessage, ServerResponse } from "node:http";

interface RequestWithBody extends IncomingMessage {
  body?: {
    folder?: string;
    filename?: string;
    file?: string; // base64
  };
}

export default async function handler(
  req: RequestWithBody,
  res: ServerResponse,
) {
  if (req.method !== "POST") {
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
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "R2 환경변수 누락" }));
    return;
  }

  const { folder, filename, file } = req.body ?? {};

  if (!file || !filename) {
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
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ url }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[uploadAudio] S3 error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "R2 업로드 실패", details: message }));
  }
}
