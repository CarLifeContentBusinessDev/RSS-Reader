export const TYPE_OPTIONS = [
  { value: "podcast", label: "podcast" },
  { value: "radio", label: "radio" },
];
export const BASE_URL = "https://pub-a45bc992c0594356a8d32a71510a246b.r2.dev";
export const DEFAULT_IMAGE_FOLDER = "images/program";
export const ITUNES_NS = "http://www.itunes.com/dtds/podcast-1.0.dtd";

export const DEFAUKLT_LANGUAGE = "ko";

export const buildImageFolder = (language: string) =>
  language === "ko"
    ? "/images/program"
    : language === "en"
      ? "/eng_images/program"
      : `/${language}_images/program`;

export const buildEpisodeFolder = (language: string) =>
  language === "en"
    ? "/en-episodes-audio/episodes"
    : language === "jp"
      ? "/jp_episodes-audio"
      : `/${language}-episodes-audio/episodes`;

export const PROGRAM_GUIDE_STEPS = [
  {
    step: "1",
    text: "RSS URL, Type, Language, R2 폴더 입력 - Category / Broadcasting ID는 Language 기준으로 자동 조회 (선택 사항)",
  },
  {
    step: "2",
    text: "프로그램 불러오기 클릭 - 자동 진행 설정 기준으로 작업 실행",
  },
  {
    step: "3",
    text: "정보 확인 및 수정 - 자동 이미지 변환/압축 → R2업로드",
  },
  {
    step: "4",
    text: "Supabase로 전송 - programs 테이블에 데이터 추가",
  },
];

export const EPISODE_GUIDE_STEPS = [
  {
    step: "1",
    text: "RSS URL, Language, Program ID, Limit, R2 폴더 입력",
    details: [
      "Program ID는 RSS 채널명과 language 기준으로 조회되며, 필요 시 직접 입력 가능",
    ],
  },
  {
    step: "2",
    text: "에피소드 불러오기 클릭 - 자동 진행 설정 기준으로 작업 실행",
  },
  {
    step: "3",
    text: "m4a 변환 및 R2 업로드 - 변환된 m4a 파일 일괄 업로드",
  },
  {
    step: "4",
    text: "정보 확인 및 수정 - 채널명, R2 폴더, duration(R2확인으로 실제값 확인) 편집",
    details: ["R2 폴더는 채널명 기준으로 입력한 경로에 자동 생성"],
  },
  {
    step: "5",
    text: "Supabase로 전송 - episodes 테이블에 데이터 추가",
  },
];

export const AUDIO_REMAPPING_GUIDE_STEPS = [
  {
    step: "1",
    text: "엑셀 파일 업로드 - 시트와 적용 범위 입력",
  },
  {
    step: "2",
    text: "작업 시작 - 등록된 에피소드를 RSS에서 조회하여 일치하는 항목에 대해 오디오 변환 및 URL 업데이트",
  },
];

export const EPISODE_BULK_GUIDE_STEPS = [
  {
    step: "1",
    text: "엑셀 파일 업로드 - 시트, 적용 범위, 최신 몇 개까지 추가할지 입력",
    details: ["프로그램 식별: program_id 우선, 없으면 채널명으로 매칭"],
  },
  {
    step: "2",
    text: "작업 시작 - 프로그램별 RSS에서 최신 에피소드를 조회해 변환/업로드 후 episodes 테이블에 추가",
    details: ["이미 등록된(제목 일치) 에피소드는 자동으로 건너뜀"],
  },
];

export const PROGRAM_BULK_GUIDE_STEPS = [
  {
    step: "1",
    text: "엑셀 파일 업로드 - 시트와 적용 범위 입력 (RSS, type, 카테고리, 방송사 컬럼)",
    details: [
      "카테고리/방송사는 이름(title) 텍스트로 입력, language 기준 자동 매칭",
    ],
  },
  {
    step: "2",
    text: "작업 시작 - RSS를 조회해 이미지 자동 압축/업로드 후 programs 테이블에 추가",
    details: ["이미 등록된(제목 일치) 프로그램은 자동으로 건너뜀"],
  },
];
