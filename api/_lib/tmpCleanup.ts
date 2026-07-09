import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Vercel 함수의 maxDuration(300s)보다 넉넉히 큰 값. 이보다 오래된 디렉터리는
// 생성한 요청이 이미 플랫폼에 의해 강제 종료됐다고 확신할 수 있다.
const STALE_MS = 330 * 1000;

/**
 * Vercel은 warm container를 재사용하므로, 이전 호출이 타임아웃/크래시로
 * finally 블록을 못 돌고 죽으면 /tmp에 파일이 남아 다음 호출에서
 * ENOSPC(디스크 공간 부족)로 이어진다. 새 작업 시작 전에 남은 찌꺼기를 청소한다.
 *
 * mtime은 디렉터리 안에 파일을 쓸 때마다 계속 갱신되므로(진행 중인 다운로드/
 * 인코딩과 구분이 안 됨) birthtime(생성 시각) 기준으로 판단한다.
 */
export const cleanupStaleTmpDirs = (prefix: string) => {
  const tmpRoot = os.tmpdir();
  let entries: string[];
  try {
    entries = fs.readdirSync(tmpRoot);
  } catch {
    return;
  }

  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const fullPath = path.join(tmpRoot, entry);
    try {
      const stat = fs.statSync(fullPath);
      const createdMs = stat.birthtimeMs || stat.ctimeMs;
      if (now - createdMs < STALE_MS) continue;
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch {
      // 이미 지워졌거나 접근 불가 - 무시
    }
  }
};
