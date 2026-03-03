import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { IncomingMessage, ServerResponse } from "node:http";

const execAsync = promisify(exec);

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body = "";
  await new Promise<void>((resolve) => {
    req.on("data", (chunk) => (body += chunk));
    req.on("end", resolve);
  });

  let parsed: { url?: string; filename?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const { url, filename } = parsed;
  if (!url || !filename) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "url, filename 누락" }));
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audio-"));
  const mp3Path = path.join(tmpDir, "input.mp3");
  const m4aPath = path.join(tmpDir, "output.m4a");

  try {
    // mp3 다운로드
    const upstream = await fetch(url);
    if (!upstream.ok) {
      throw new Error(`mp3 fetch 실패: ${upstream.status}`);
    }
    const arrayBuffer = await upstream.arrayBuffer();
    fs.writeFileSync(mp3Path, Buffer.from(arrayBuffer));

    // ffmpeg 변환: AAC 128k
    await execAsync(
      `ffmpeg -y -i "${mp3Path}" -vn -c:a aac -b:a 128k "${m4aPath}"`,
    );

    const m4aBuffer = fs.readFileSync(m4aPath);
    const base64 = m4aBuffer.toString("base64");

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ file: base64, filename, fileSize: m4aBuffer.length }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[convertAudio] error:", message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "변환 실패", details: message }));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
