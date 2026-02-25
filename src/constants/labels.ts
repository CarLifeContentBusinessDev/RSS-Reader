export const LABELS = {
  // 페이지 제목 / 설명
  PAGE: {
    PROGRAM: {
      TITLE: "Program Builder",
      DESCRIPTION: "RSS에서 채널 정보를 가져와 programs 테이블에 추가합니다.",
    },
    EPISODE: {
      TITLE: "Episode Builder",
      DESCRIPTION:
        "RSS에서 에피소드 정보를 가져와 episodes 테이블에 추가합니다.",
    },
  },

  // 섹션 헤더
  SECTION: {
    PROGRAM_INFO: {
      TITLE: "프로그램 정보",
      DESCRIPTION: "RSS 파싱 결과",
    },
    EPISODE_INFO: {
      TITLE: "에피소드 정보",
      DESCRIPTION: "RSS 파싱 결과",
    },
  },

  // 초기 상태 메시지
  EMPTY: {
    PROGRAM: "프로그램 불러오기를 실행하면 결과가 표시됩니다.",
    EPISODE: "에피소드 불러오기를 실행하면 결과가 표시됩니다.",
  },

  // 버튼
  BUTTON: {
    FETCH_PROGRAM: "프로그램 불러오기",
    FETCH_EPISODE: "에피소드 불러오기",
    SEND_SUPABASE: "Supabase로 전송",
    SENDING: "전송 중...",
    PROCESSING: "처리 중...",
    RESET: "초기화",
    RESTORE: "원래대로",
    APPLY: "변경 반영",
    COPY_SQL: "SQL 복사",
    DOWNLOAD_ALL_MP3: "mp3 전체 다운로드",
    DOWNLOAD_IMAGE: "이미지 다운로드",
    VIEW_ORIGINAL: "원본 보기",
    CHECK_R2: "R2 확인",
    OPEN_R2_FOLDER: "R2 폴더 바로가기",
    OPEN_FOLDER: "폴더 바로가기",
    SEARCH: "검색",
    SEARCHING: "검색 중...",
    DIRECT_INPUT: "직접 입력",
    SEARCH_RESULT: "검색 결과",
    CLOSE: "닫기",
  },
} as const;
