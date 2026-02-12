import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
) {
  const { url: targetUrl } = request.query;

  if (!targetUrl || typeof targetUrl !== "string") {
    return response.status(400).json({ error: "Missing url query parameter." });
  }

  try {
    const upstream = await fetch(targetUrl);

    if (!upstream.ok) {
      return response
        .status(upstream.status)
        .send(`Failed to download file: ${upstream.statusText}`);
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    response.setHeader("Content-Type", contentType);

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      response.setHeader("Content-Length", contentLength);
    }

    const disposition = upstream.headers.get("content-disposition");
    if (disposition) {
      response.setHeader("Content-Disposition", disposition);
    }

    const buffer = await upstream.arrayBuffer();
    return response.status(200).send(Buffer.from(buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return response.status(502).json({ error: `Proxy error: ${message}` });
  }
}
