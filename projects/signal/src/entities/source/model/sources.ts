import type { Source, SubjectSite } from "./types";

/**
 * 소스 목록 — ingestion-ranking 의 "설정파일"이 이 파일이다.
 *
 * MVP 에 소스 관리 화면은 없다(PRODUCT 비범위). 소스를 늘리거나 weight 를 조정하려면
 * 여기를 고치고 배포한다. DB 에 두지 않는 이유는 INV-R4 와 같다 — 소스에 귀속하는 값이
 * 항목 쪽에 흩어지면 어느 것이 진짜인지 알 수 없어진다.
 *
 * weight 의 뜻: 1.0 을 기준으로 한 배수다. 시간감쇠에 곱해지므로(INV-R2),
 * weight 2.0 인 소스의 글은 같은 시각의 weight 1.0 글보다 정확히 두 배 점수를 받는다.
 */
// tier 는 content-selection.md 의 "열린 값" 분류를 따른다 (INV-L1).
// `daily` = 매일 훑는 화제성, `deep` = 시간 날 때 읽는 전문적인 것.
//
// weight 를 나눈 기준 (1.0 = 기준값):
//   1.5~1.6  회사·연구소가 자기 이름으로 내는 발표 — 이 제품이 제일 쳐주는 것
//   1.2~1.3  큐레이션되거나 깊이가 있는 곳
//   0.9~1.1  언론사 기사 — 사실 전달이지 1차 발표가 아니다
//   1.0      Hacker News — 화제성은 높지만 주제가 안 좁혀져 있다
//
// **id 는 고치지 않는다.** 항목이 들고 다니는 값이라 바꾸면 이미 적재된 글이 출처를 잃는다.
// `hn-frontpage` 는 주소만 100점 이상으로 바꿨다 — id 가 같아 기존 73건이 그대로 붙어 있다.
export const SOURCES: readonly Source[] = [
  // ── 공식 발표 (회사·연구소가 스스로 내는 글) ──
  {
    id: "openai-blog",
    name: "OpenAI",
    weight: 1.6,
    feedUrl: "https://openai.com/blog/rss.xml",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    id: "google-ai-blog",
    name: "Google AI",
    weight: 1.5,
    feedUrl: "https://blog.google/technology/ai/rss/",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    id: "deepmind-blog",
    name: "Google DeepMind",
    weight: 1.5,
    feedUrl: "https://deepmind.google/blog/rss.xml",
    needsTopicCheck: false,
    tier: "deep",
  },
  {
    // 요약글을 한 글자도 안 준다(실측 0자). 본문 추출이 실패하면 제목만 남고
    // 근거가 없어 요약을 아예 안 만든다(INV-S3) — 카드가 제목 한 줄이 된다.
    id: "huggingface-blog",
    name: "Hugging Face",
    weight: 1.3,
    feedUrl: "https://huggingface.co/blog/feed.xml",
    needsTopicCheck: false,
    tier: "deep",
  },

  // ── 커뮤니티 (사람이 골라 올리는 곳) ──
  {
    // 한국 기술 커뮤니티 중 RSS 를 공식 제공하는 유일한 곳. 이미 사람이 한 번 걸렀다.
    //
    // weight 1.3 인 이유 (2026-08-13 리뷰에서 1.5 → 1.3): 위 기준표대로면 여기는
    // "큐레이션되는 곳"이라 1.2~1.3 이다. 1.5 는 "회사·연구소가 자기 이름으로 내는 발표"
    // 자리인데 여기는 **사용자가 투고하는 곳**이다. 값이 기준과 어긋난 것도 문제지만
    // 결과가 더 문제였다 — 고빈도 소스라 요약 예산 상위를 매일 독식했다.
    id: "geeknews",
    name: "GeekNews",
    weight: 1.3,
    feedUrl: "https://news.hada.io/rss/news",
    needsTopicCheck: true,
    tier: "daily",
  },
  {
    // 100점 이상만 받는다(프론트 20건 → 14건). 주제가 안 좁혀진 소스라
    // 투구게·칵테일 레시피가 여기서 들어왔다 — 점수 문턱이 1차 방벽이다.
    id: "hn-frontpage",
    name: "Hacker News",
    weight: 1.0,
    feedUrl: "https://hnrss.org/frontpage?points=100",
    needsTopicCheck: true,
    tier: "daily",
  },

  // ── 해외 매체 ──
  //
  // **전부 AI 섹션 주소다. 전체 피드를 쓰지 않는다.**
  // 2026-08-13 실측: The Verge·Ars Technica 전체 피드는 첫 항목이 둘 다 "Pixel 11 발표"였다.
  // 소비자 기기 기사가 그대로 들어와 매 건 주제 판정에 3.8초와 요금을 쓰고 대부분 걸러진다.
  // 주소를 섹션으로 좁히면 그 비용이 통째로 사라진다 — 판정보다 앞선 단계에서 거르는 것이 싸다.
  {
    id: "techcrunch-ai",
    name: "TechCrunch",
    weight: 0.9,
    feedUrl: "https://techcrunch.com/category/artificial-intelligence/feed/",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    // 요약글에 본문을 통째로 준다(실측 16,000자). 본문 추출이 필요 없는 대신
    // 요약 호출의 입력 토큰이 다른 소스의 5~10배다.
    id: "venturebeat-ai",
    name: "VentureBeat",
    weight: 0.9,
    feedUrl: "https://venturebeat.com/category/ai/feed/",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    id: "mit-techreview",
    name: "MIT Technology Review",
    weight: 1.2,
    feedUrl: "https://www.technologyreview.com/topic/artificial-intelligence/feed/",
    needsTopicCheck: false,
    tier: "deep",
  },
  {
    id: "theverge",
    name: "The Verge",
    weight: 0.8,
    feedUrl: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    id: "arstechnica",
    name: "Ars Technica",
    weight: 0.9,
    feedUrl: "https://arstechnica.com/ai/feed/",
    needsTopicCheck: false,
    tier: "daily",
  },

  // ── 국내 언론 (한국어라 제목 번역이 필요 없다) ──
  {
    id: "aitimes",
    name: "AI타임스",
    weight: 1.1,
    feedUrl: "https://www.aitimes.com/rss/allArticle.xml",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    id: "aitimes-kr",
    name: "인공지능신문",
    weight: 0.9,
    feedUrl: "https://www.aitimes.kr/rss/allArticle.xml",
    needsTopicCheck: false,
    tier: "daily",
  },
  {
    // 전자신문의 AI 섹션. 전체 피드가 아니라 섹션 주소다 —
    // rss.etnews.com/ 목록에서 04046 이 AI, 04 가 SW 다.
    id: "etnews-ai",
    name: "전자신문",
    weight: 0.9,
    feedUrl: "https://rss.etnews.com/04046.xml",
    needsTopicCheck: false,
    tier: "daily",
  },
];

// 2026-08-12 에 후보 19개 주소를 전부 받아 확인했다(200 + XML 파싱 + 항목 수).
//
// 죽은 주소 3개:
//   · https://www.etnews.com/rss/S1N1.xml        404 — 섹션 주소를 잘못 짚었다. 위 04046 이 맞다
//   · https://www.anthropic.com/news/rss.xml     404 — 누적 8번째 주소. 공개 RSS 가 없다고 본다
//   · https://hnrss.org/frontpage?points=200     502 — hnrss 가 200점을 지원하지 않는다(150 은 8건)
//
// 살아 있으나 **일부러 뺀 것 2개**:
//   · arXiv cs.AI (https://rss.arxiv.org/rss/cs.AI) — 한 번에 753건. 위 14개를 합친 것보다 많아
//     혼자 피드를 덮는다. 논문은 "핵심 트렌드"와 층이 달라 따로 다뤄야 한다.
//   · Reddit r/LocalLLaMA (https://www.reddit.com/r/LocalLLaMA/.rss) — 로컬에선 25건 정상인데
//     Reddit 은 데이터센터 IP 를 자주 403 으로 막는다. **로컬에서 됐다고 Vercel 에서 된다는
//     보장이 없다** — 배포 후 실제로 확인하고 넣는다.

/** 소스를 못 찾았을 때 쓰는 값. 0 이 아닌 이유는 아래 getSourceWeight 주석 참조. */
export const UNKNOWN_SOURCE_WEIGHT = 1;

/**
 * 공식 발표가 나오는 자리 (content-selection INV-O2·O3 의 "설정").
 *
 * 원문 주소가 여기 맞으면 **모델을 거치지 않고** 공식으로 친다. 소스 목록과 다른 목록이다 —
 * 우리가 수집하지 않는 곳도 들어간다. HN 을 거쳐 들어온 `anthropic.com` 글이 그 경우다.
 *
 * **넣는 기준은 하나다: 그 호스트·경로에 그 주체가 스스로 낸 발표만 있는가.**
 * "모델이 공식이라고 맞혔다"는 기준이 될 수 없다 — 모델을 안 쓰겠다는 목록을
 * 모델의 동의로 넓히는 셈이다. 사람이 글을 올릴 수 있는 곳(포럼·커뮤니티 업로드)은 뺀다:
 * `community.openai.com`, `huggingface.co/<사용자>/…`, `forums.developer.nvidia.com` 이
 * 그래서 없다. 뉴스 매체·개인 블로그도 안 넣는다 — 그쪽은 모델이 `byContent` 로 판단할 몫이다.
 */
export const SUBJECT_SITES: readonly SubjectSite[] = [
  { host: "anthropic.com", pathPrefix: "/news/" },
  { host: "anthropic.com", pathPrefix: "/engineering/" },
  { host: "openai.com", pathPrefix: "/index/" },
  { host: "openai.com", pathPrefix: "/blog/" },
  // 회사가 직접 쓰는 발표 호스트 — 사용자 업로드 경로가 없어 호스트 전체를 연다.
  { host: "blog.google" },
  { host: "ai.google" },
  { host: "deepmind.google" },
  { host: "blogs.microsoft.com" },
  { host: "ai.meta.com" },
  { host: "blogs.nvidia.com" },
  { host: "mistral.ai", pathPrefix: "/news/" },
  { host: "clickhouse.com", pathPrefix: "/blog/" },
];
