import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { IncomingMessage, ServerResponse } from "node:http";

interface RequestWithBody extends IncomingMessage {
  body?: {
    folder?: string;
    filename?: string;
    contentType?: string;
    file?: string;
  };
}

export default async function handler(
  request: RequestWithBody,
  response: ServerResponse,
) {
  const R2_ACCESS_KEY_ID = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const R2_SECRET_ACCESS_KEY = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
  const R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT;
  const R2_PUBLIC_BASE_URL = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;

  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  if (
    !R2_BUCKET ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_ENDPOINT
  ) {
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "R2 환경변수 누락" }));
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

  const { folder, filename, contentType, file } = request.body ?? {};

  if (!file || !filename) {
    response.statusCode = 400;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "file 또는 filename 누락" }));
    return;
  }

  const fileBuffer = Buffer.from(file, "base64");
  const key = folder ? `${folder.replace(/^\//, "")}/${filename}` : filename;

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType || "image/webp",
      }),
    );

    const baseUrl = R2_PUBLIC_BASE_URL || R2_ENDPOINT;
    const url = `${baseUrl}/${key}`;
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ url }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[uploadImage] S3 error:", err);
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: "R2 업로드 실패", details: message }));
  }
}
