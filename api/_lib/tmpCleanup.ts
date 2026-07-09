import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dirSizeBytes = (dirPath: string): number => {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      try {
        total += fs.statSync(path.join(dirPath, entry)).size;
      } catch {
        // 무시
      }
    }
  } catch {
    // 무시
  }
  return total;
};

// Vercel Hobby maxDuration(300s)보다 여유를 둔 값. 이보다 오래된 디렉터리만
// "죽은 요청이 남긴 찌꺼기"로 간주해 삭제한다.
const STALE_DIR_AGE_MS = 6 * 60 * 1000;

/**
 * Vercel은 warm container를 재사용하므로, 이전 호출이 타임아웃/크래시로
 * finally 블록을 못 돌고 죽으면 /tmp에 파일이 남아 다음 호출에서
 * ENOSPC(디스크 공간 부족)로 이어진다. 새 작업 시작 전에 남은 찌꺼기를 청소한다.
 *
 * 로컬 개발 환경 등 변환 엔드포인트가 동시에 여러 개 호출될 수 있으므로,
 * 방금 생성되어 아직 사용 중인 디렉터리까지 지우지 않도록 나이 기준으로 판단한다.
 */
export const cleanupStaleTmpDirs = (prefix: string, logPrefix?: string) => {
  const tag = logPrefix ?? "[tmpCleanup]";
  const tmpRoot = os.tmpdir();
  let entries: string[];
  try {
    entries = fs.readdirSync(tmpRoot);
  } catch (err) {
    console.warn(
      `${tag} /tmp 목록 조회 실패: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  logTmpFreeSpace(tag, "청소 전");

  const now = Date.now();
  const matched = entries.filter((entry) => {
    if (!entry.startsWith(prefix)) return false;
    try {
      const mtimeMs = fs.statSync(path.join(tmpRoot, entry)).mtimeMs;
      return now - mtimeMs > STALE_DIR_AGE_MS;
    } catch {
      return false;
    }
  });
  if (matched.length === 0) {
    console.log(`${tag} 청소할 찌꺼기 없음 (/tmp 내 audio-* 0개)`);
    return;
  }

  let removedCount = 0;
  let removedBytes = 0;
  for (const entry of matched) {
    const fullPath = path.join(tmpRoot, entry);
    const size = dirSizeBytes(fullPath);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      removedCount++;
      removedBytes += size;
    } catch (err) {
      console.warn(
        `${tag} ${entry} 삭제 실패: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log(
    `${tag} 찌꺼기 청소: ${removedCount}/${matched.length}개, ${(removedBytes / 1024 / 1024).toFixed(1)}MB 회수`,
  );
  logTmpFreeSpace(tag, "청소 후");
};

const logTmpFreeSpace = (tag: string, when: string) => {
  try {
    // Node 18.15+/20+ 에서 사용 가능. 없으면 조용히 건너뛴다.
    const statfsSync = (
      fs as unknown as {
        statfsSync?: (p: string) => { bavail: number; bsize: number };
      }
    ).statfsSync;
    if (!statfsSync) return;
    const stat = statfsSync(os.tmpdir());
    const freeMB = (stat.bavail * stat.bsize) / 1024 / 1024;
    console.log(`${tag} /tmp 여유 공간(${when}): ${freeMB.toFixed(1)}MB`);
  } catch {
    // 무시
  }
};
