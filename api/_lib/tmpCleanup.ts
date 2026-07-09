import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Vercel은 warm container를 재사용하므로, 이전 호출이 타임아웃/크래시로
 * finally 블록을 못 돌고 죽으면 /tmp에 파일이 남아 다음 호출에서
 * ENOSPC(디스크 공간 부족)로 이어진다. 새 작업 시작 전에 남은 찌꺼기를 무조건 청소한다.
 *
 * 이 앱에서 변환 엔드포인트는 항상 순차 호출되므로(동시 호출 없음),
 * 나이 기준으로 판단할 필요 없이 이전에 남은 디렉터리는 전부 죽은 요청의 것이다.
 */
export const cleanupStaleTmpDirs = (prefix: string) => {
  const tmpRoot = os.tmpdir();
  let entries: string[];
  try {
    entries = fs.readdirSync(tmpRoot);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const fullPath = path.join(tmpRoot, entry);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch {
      // 이미 지워졌거나 접근 불가 - 무시
    }
  }
};
