# RSS Reader

RSS Reader는 다양한 RSS 피드로부터 에피소드 정보를 조회, 관리, 다운로드, 변환, 업로드할 수 있는 프로젝트입니다.
Supabase를 통한 인증 및 데이터 관리, 오디오/이미지 파일 업로드, SQL 쿼리 실행 등 다양한 기능을 제공합니다.

## 주요 기능

### 프로그램 등록

- RSS URL로 프로그램 제목, 부제, 이미지 URL 자동 파싱
- 이미지 WebP 자동 압축 및 Cloudflare R2 업로드
- 제목, 부제, 이미지 폴더 수동 편집 후 SQL 재생성
- 카테고리 / 방송사 선택, 다국어 지원
- Supabase `programs` 테이블에 insert

### 에피소드 등록

- RSS 피드에서 에피소드 목록 자동 파싱
- 오디오 파일 다운로드 → MP3/M4A 변환 → R2 업로드
- 에피소드별 진행 상태 실시간 표시 (다운로드 / 변환 / 업로드)
- duration 수동 편집 지원
- Supabase `episodes` 테이블에 insert

## 기술 스택

| 분류         | 기술               |
| ------------ | ------------------ |
| 프레임워크   | React + TypeScript |
| 빌드 도구    | Vite               |
| 스타일링     | Tailwind CSS       |
| 데이터베이스 | Supabase           |
| 스토리지     | Cloudflare R2      |

## 설치 및 실행 방법

1. **의존성 설치**
   ```bash
   npm install
   ```
2. **환경 변수 설정**
   - Supabase 프로젝트의 URL, API 키 등 환경 변수를 `.env` 파일에 추가
3. **개발 서버 실행**
   ```bash
   npm run dev
   ```
4. **프로덕션 빌드**
   ```bash
   npm run build
   npm run preview
   ```

## 주요 폴더 및 파일 구조

```
api/                             # 서버리스 API 함수
├── convertAudio.ts              # 오디오 변환 처리
├── download.ts                  # 파일 다운로드 처리
├── rss.ts                       # RSS 피드 파싱 및 제공
├── uploadAudio.ts               # 오디오 업로드 처리
└── uploadImage.ts               # 이미지 업로드 처리
src/
├── components/
│   ├── ProgramInfoEditor.tsx   # 프로그램 정보 편집 UI
│   ├── EpisodeInfoEditor.tsx   # 에피소드 정보 편집 UI
│   ├── EpisodeCard.tsx         # 에피소드 카드 (진행 상태 포함)
│   ├── SqlOutput.tsx           # SQL 미리보기 및 수동 편집
│   ├── GuidePanel.tsx          # 단계별 가이드 패널
│   └── ProcessStatus.tsx       # 처리 로그 표시
├── hooks/
│   ├── useProgramFetch.ts      # RSS 파싱, SQL 생성, Supabase insert
│   ├── useImageDownload.ts     # 이미지 압축 및 R2 업로드
│   ├── useAudioConvert.ts      # 오디오 포맷 변환
│   ├── useAudioUpload.ts       # 오디오 R2 업로드
│   ├── useProgramOptions.ts    # 카테고리 / 방송사 옵션 로드
│   └── useProcessLog.ts        # 로그 및 진행 상태 관리
├── utils/
│   ├── sql.ts                  # SQL 빌더 및 파서
│   ├── rss.ts                  # RSS XML 파서
│   └── r2.ts                   # R2 URL 빌더
├── pages/
│   ├── ProgramsPage.tsx        # 프로그램 등록 페이지
│   └── EpisodesPage.tsx        # 에피소드 등록 페이지
└── types/                      # 공용 타입 정의
```

## 처리 흐름

```
RSS URL 입력
    ↓
RSS 파싱 → 제목 / 부제 / 이미지(오디오) URL 추출
    ↓
이미지: WebP 변환 및 압축   |   오디오: M4A 변환
    ↓
Cloudflare R2 업로드
    ↓
SQL 생성 (미리보기 및 수동 편집 가능)
    ↓
Supabase insert
```
