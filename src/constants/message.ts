export const MESSAGES = {
  // 인증
  LOGIN_REQUIRED_FETCH: "로그인 후 불러올 수 있습니다.",
  LOGIN_REQUIRED_SEND: "로그인 후 전송할 수 있습니다.",

  // RSS
  RSS_REQUESTING: "RSS 요청 중...",
  RSS_PARSING: "RSS 수신 완료. 파싱 중...",
  RSS_REQUEST_FAIL: (status: number) => `요청 실패: 상태 코드 ${status}.`,

  // SQL
  SQL_GENERATED: "SQL 생성 완료.",
  SQL_COPIED: "SQL을 클립보드에 복사했습니다.",

  // Supabase
  SUPABASE_INSERTING: (count: number) =>
    `Supabase에 ${count}개 항목 전송 중...`,
  SUPABASE_INSERT_SUCCESS: "Supabase insert 완료.",
  SUPABASE_INSERT_FAIL: (message: string) => `Supabase insert 실패: ${message}`,

  // 다운로드
  DOWNLOAD_START: (filename: string) => `다운로드 시작: ${filename}`,
  DOWNLOAD_SUCCESS: (filename: string) => `다운로드 완료: ${filename}`,
  DOWNLOAD_FAIL: (filename: string, message: string) =>
    `다운로드 실패: ${filename} - ${message}`,
  DOWNLOAD_NO_URL: (filename: string) =>
    `다운로드 실패: ${filename} - 오디오 URL 없음`,
  DOWNLOAD_ALL_START: (count: number) => `전체 다운로드 시작 (${count}개)`,
  DOWNLOAD_ALL_DONE: "전체 다운로드 완료",

  // 프로세스 레이블
  PROCESS: {
    RSS_REQUESTING: "RSS 요청 중",
    RSS_PARSING: "RSS 파싱 중",
    SQL_GENERATED: "SQL 생성 완료",
    ERROR: "오류 발생",
    SUPABASE_SENDING: "Supabase 전송 중",
    SUPABASE_SUCCESS: "Supabase 전송 완료",
    SUPABASE_FAIL: "Supabase 전송 실패",
    DOWNLOADING: "다운로드 중",
    DOWNLOAD_SUCCESS: "다운로드 완료",
    DOWNLOAD_FAIL: "다운로드 실패",
    DOWNLOAD_ALL: "전체 다운로드 중",
    DOWNLOAD_ALL_SUCCESS: "전체 다운로드 완료",
    DOWNLOAD_ALL_PARTIAL_FAIL: "다운로드 일부 실패",
  },
} as const;
