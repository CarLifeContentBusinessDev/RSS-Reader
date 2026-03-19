import type { IncomingMessage, ServerResponse } from "node:http";

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

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

const colorizeSuccess = (message: string) =>
  `${ANSI.green}${message}${ANSI.reset}`;
const colorizeError = (message: string) => `${ANSI.red}${message}${ANSI.reset}`;

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

  return `[supabase]${p}${e} ${channel} ${episode}`;
};

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const reqWithBody = req as IncomingMessage & {
    body?: { stage?: string; reason?: string; logContext?: LogContext };
  };

  let parsed: { stage?: string; reason?: string; logContext?: LogContext } = {};

  // Some runtimes provide req.body already parsed. Prefer it when present.
  if (reqWithBody.body && typeof reqWithBody.body === "object") {
    parsed = reqWithBody.body;
  } else {
    let body = "";
    await new Promise<void>((resolve) => {
      req.on("data", (chunk) => (body += chunk));
      req.on("end", resolve);
    });

    if (body.trim()) {
      try {
        parsed = JSON.parse(body);
      } catch {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid JSON" }));
        return;
      }
    }
  }

  if (parsed.stage === "supabase-apply-done") {
    const prefix = buildLogPrefix(parsed.logContext);
    console.log(colorizeSuccess(`${prefix} Supabase 적용 완료`));
  }

  if (parsed.stage === "supabase-apply-failed") {
    const prefix = buildLogPrefix(parsed.logContext);
    const reason = parsed.reason || "원인 미상";
    console.error(colorizeError(`${prefix} Supabase 적용 실패: ${reason}`));
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true }));
}
