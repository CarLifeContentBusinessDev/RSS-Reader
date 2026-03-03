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

export const EPISODE_GUIDE_STEPS = [
  {
    step: "1",
    text: "RSS URL, Language, Program ID, Limit 입력 - RSS와 Language 입력 후 Program ID 검색",
    details: [
      "Program ID는 RSS의 채널명과 language를 기반으로 supabase에서 조회하며 직접 입력버튼을 통해 수동 입력도 가능",
    ],
  },
  {
    step: "2",
    text: "에피소드 불러오기 클릭 - RSS 파싱 후 m4a 변환 자동 시작 (최대 5개 병렬)",
  },
  {
    step: "3",
    text: "R2 업로드 - 변환된 m4a 파일 일괄 업로드",
  },
  {
    step: "4",
    text: "정보 확인 및 수정 - 채널명, R2 폴더, duration(R2확인으로 실제값 확인) 편집 후 변경 반영",
  },
  {
    step: "5",
    text: "Supabase로 전송 - episodes 테이블에 insert",
  },
];

export const PROGRAM_GUIDE_STEPS = [
  {
    step: "1",
    text: "RSS URL, Type, Language 입력 - Category / Broadcasting ID는 Language 기준으로 자동 조회 (선택 사항)",
  },
  {
    step: "2",
    text: "프로그램 불러오기 클릭 - RSS 채널 정보 파싱 후 SQL 자동 생성",
  },
  {
    step: "3",
    text: "정보 확인 및 수정 - 자동 이미지 변환/압축 → 업로드 → R2 확인 → 변경 반영",
  },
  {
    step: "4",
    text: "Supabase로 전송 - SQL 출력 콘솔 기준으로 programs 테이블에 insert",
  },
];
