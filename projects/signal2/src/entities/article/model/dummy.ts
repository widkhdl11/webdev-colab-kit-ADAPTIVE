/* 화면을 확인하기 위한 가짜 소식 16건.
 *
 * 진짜 데이터는 수집 파이프라인이 Supabase 에 넣는다(docs/specs/ingestion-ranking.md, 지금 parked).
 * 그때 이 파일은 통째로 빠지고 같은 Article 모양이 DB 에서 온다 — 화면 코드는 안 바뀐다.
 *
 * 일부러 섞어 둔 상태들: 요약이 없는 소식 · 공식 표시 두 종류 · 키워드가 다섯인 소식 ·
 * 키워드가 없는 소식 · 한글 출처와 로마자 출처(표식 글자 수가 갈린다).
 * 점수 순서와 시각 순서를 일부러 어긋나게 뒀다 — 그래야 핫이슈/최신 토글이 실제로 다르게 보인다.
 */

import { kstDayStartMs } from "@/shared/lib/kst";

import type { Article, Keyword, OfficialMark } from "./types";

type Seed = {
  id: string;
  title: string;
  originalTitle?: string;
  summary?: string;
  source: string;
  sourceUrl: string;
  /** 오늘부터 며칠 전인가. 0 = 오늘. */
  dayOffset: 0 | 1 | 2;
  /** 그날의 KST 시각(0~23). */
  hourKst: number;
  score: number;
  keywords?: Keyword[];
  official?: OfficialMark;
  isTrending?: boolean;
};

const field = (name: string): Keyword => ({ name, axis: "field" });
const kind = (name: string): Keyword => ({ name, axis: "kind" });

const SEEDS: Seed[] = [
  // ── 오늘 ────────────────────────────────────────────────────────────
  {
    id: "a01",
    title: "에이전트에게 도구를 몇 개까지 쥐여줘야 할까",
    originalTitle: "How many tools should an agent have?",
    summary:
      "도구 목록이 길어질수록 모델이 엉뚱한 도구를 고르는 빈도가 늘어난다는 관찰. 설명을 짧게 다듬고 비슷한 기능은 하나로 묶는 쪽이 낫다는 정리.",
    source: "Anthropic",
    sourceUrl: "https://www.anthropic.com/engineering/agent-tools",
    dayOffset: 0,
    hourKst: 16,
    score: 92,
    keywords: [field("에이전트"), field("도구 설계"), kind("실험")],
    official: "byUrl",
    isTrending: true,
  },
  {
    id: "a02",
    title: "MCP 서버를 처음 붙일 때 자주 막히는 지점 정리",
    originalTitle: "Common MCP server pitfalls",
    summary:
      "권한 범위, 스키마 검증, 타임아웃 세 군데에서 대부분 막힌다. 각 경우에 로그를 어디부터 봐야 하는지 순서대로 짚어둔 글.",
    source: "GitHub",
    sourceUrl: "https://github.blog/mcp-pitfalls",
    dayOffset: 0,
    hourKst: 14,
    score: 88,
    keywords: [field("MCP"), field("개발 환경"), kind("가이드")],
    isTrending: true,
  },
  {
    id: "a03",
    title: "컨텍스트 창이 넓어져도 프롬프트를 줄여야 하는 이유",
    originalTitle: "Long context is not free",
    summary:
      "넣을 수 있는 양과 실제로 활용되는 양은 다르다. 중간 부분의 정보가 묻히는 현상을 어떻게 확인하고 줄일지에 대한 실무 메모.",
    source: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/item?id=00000001",
    dayOffset: 0,
    hourKst: 12,
    score: 61,
    // 키워드 다섯 — 카드에 4개까지만 보이고 나머지는 +N 으로 접힌다(뱃지 줄은 1-B).
    keywords: [
      field("AI 모델"),
      field("프롬프트"),
      field("성능"),
      kind("분석"),
      kind("논쟁"),
    ],
  },
  {
    id: "a04",
    title: "사내 문서 검색에 임베딩 대신 키워드를 먼저 붙여본 후기",
    summary:
      "벡터 검색부터 도입하기 전에 태그와 키워드 필터로 후보를 좁히는 편이 비용과 정확도 모두에서 나았다는 팀의 기록.",
    source: "개인 블로그",
    sourceUrl: "https://example.blog/keyword-first-search",
    dayOffset: 0,
    hourKst: 10,
    score: 44,
    keywords: [field("검색"), kind("후기")],
  },
  {
    id: "a05",
    // 요약이 없는 소식 — 근거가 없어 호출 자체를 건너뛴 경우다(2026-08-10 실측 101건 중 9건).
    // 빈칸을 문구로 채우지 않는다. 곧 채워질 것처럼 읽히는 말이 사실과 다르기 때문이다.
    title: "코딩 에이전트 평가를 자동화하려다 배운 것",
    originalTitle: "What we learned automating coding agent evals",
    source: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/item?id=00000002",
    dayOffset: 0,
    hourKst: 9,
    score: 71,
    keywords: [field("에이전트"), field("평가"), kind("회고")],
  },
  {
    id: "a06",
    title: "새 추론 모델을 공개했습니다",
    originalTitle: "Introducing our new reasoning model",
    summary:
      "긴 사고 과정을 스스로 조절하는 방식으로 바꿨고, 같은 비용에서 수학·코딩 지표가 올랐다고 밝혔다. 가격과 한도는 문서에 정리돼 있다.",
    source: "OpenAI",
    sourceUrl: "https://openai.com/index/new-reasoning-model",
    dayOffset: 0,
    hourKst: 8,
    score: 85,
    keywords: [field("AI 모델"), kind("출시")],
    official: "byUrl",
  },

  // ── 어제 ────────────────────────────────────────────────────────────
  {
    id: "b01",
    title: "오픈소스 모델을 로컬에서 돌릴 때 부딪히는 현실적인 병목",
    summary:
      "메모리보다 먼저 걸리는 건 대개 입출력과 양자화 설정이었다는 정리. 장비를 늘리기 전에 확인할 항목들.",
    source: "기술 뉴스레터",
    sourceUrl: "https://example.news/local-llm-bottlenecks",
    dayOffset: 1,
    hourKst: 17,
    score: 90,
    keywords: [field("AI 모델"), field("인프라"), kind("가이드")],
    isTrending: true,
  },
  {
    id: "b02",
    title: "타입 안전한 도구 스키마를 만드는 작은 패턴",
    originalTitle: "A small pattern for type-safe tool schemas",
    summary:
      "스키마 정의 하나에서 런타임 검증과 타입을 함께 끌어내는 방식. 도구가 늘어날수록 손으로 맞추던 부분이 줄어든다.",
    source: "GitHub",
    sourceUrl: "https://github.blog/type-safe-tool-schemas",
    dayOffset: 1,
    hourKst: 15,
    score: 52,
    keywords: [field("도구 설계"), field("타입스크립트"), kind("가이드")],
  },
  {
    id: "b03",
    title: "검색 단계를 걷어내고 파일을 통째로 넣어본 팀의 기록",
    summary:
      "문서 수가 적을 때는 파이프라인을 줄이는 쪽이 유지보수에 유리했다는 이야기. 어느 규모부터 다시 검색이 필요해졌는지도 함께.",
    source: "개인 블로그",
    sourceUrl: "https://example.blog/no-rag-for-now",
    dayOffset: 1,
    hourKst: 11,
    score: 67,
    keywords: [field("검색"), kind("후기")],
  },
  {
    id: "b04",
    title: "MCP의 리소스와 툴, 언제 무엇을 쓰나",
    originalTitle: "Resources vs tools in MCP",
    summary:
      "읽기만 하면 리소스, 부수효과가 있으면 툴로 나누는 기준을 예제와 함께 설명한다. 애매한 경우의 판단법도 정리.",
    source: "문서 사이트",
    sourceUrl: "https://modelcontextprotocol.io/docs/resources-vs-tools",
    dayOffset: 1,
    hourKst: 10,
    score: 74,
    keywords: [field("MCP"), kind("가이드")],
    official: "byContent",
  },
  {
    id: "b05",
    title: "사내 코드 어시스턴트를 6개월 굴리고 남은 숫자",
    summary:
      "채택률보다 재사용률이 먼저 떨어졌다는 관찰. 어떤 작업에서 도움이 됐고 어디서 방해가 됐는지를 기간별로 갈라 정리했다.",
    source: "기술 뉴스레터",
    sourceUrl: "https://example.news/six-months-of-code-assist",
    dayOffset: 1,
    hourKst: 9,
    score: 48,
    keywords: [field("개발 생산성"), kind("회고"), kind("분석")],
  },

  // ── 그저께 ──────────────────────────────────────────────────────────
  {
    id: "c01",
    title: "모델을 갈아끼우는 비용을 낮추는 얇은 추상화 층",
    summary:
      "공급자별 차이를 한 겹으로 감싸되 너무 두껍게 만들지 않는 선을 어디에 둘지에 대한 논의. 실패 사례도 함께 실렸다.",
    source: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/item?id=00000003",
    dayOffset: 2,
    hourKst: 16,
    score: 80,
    keywords: [field("AI 모델"), field("아키텍처"), kind("논쟁")],
    isTrending: true,
  },
  {
    id: "c02",
    title: "에이전트 로그를 사람이 읽을 수 있게 만드는 법",
    summary:
      "호출 기록을 그대로 쌓으면 아무도 안 본다. 무엇을 접고 무엇을 펼칠지 정하는 것부터가 관측 가능성의 시작이라는 관점.",
    source: "개인 블로그",
    sourceUrl: "https://example.blog/readable-agent-logs",
    dayOffset: 2,
    hourKst: 14,
    score: 45,
    keywords: [field("에이전트"), field("관측"), kind("가이드")],
  },
  {
    id: "c03",
    title: "새 벤치마크가 나올 때마다 확인하는 세 가지",
    summary:
      "측정 대상, 재현 조건, 그리고 내 작업과의 거리. 점수표를 그대로 믿기 전에 짚어볼 항목을 짧게 정리했다.",
    source: "기술 뉴스레터",
    sourceUrl: "https://example.news/three-checks-for-benchmarks",
    dayOffset: 2,
    hourKst: 11,
    score: 63,
    keywords: [field("평가"), kind("가이드")],
  },
  {
    id: "c04",
    // 키워드가 하나도 안 붙은 소식 — 뱃지 줄이 비는 카드가 실제로 생긴다.
    title: "작은 팀이 사내 위키를 정리한 방법",
    summary:
      "도구를 바꾸는 대신 문서 수명을 정하는 규칙부터 만들었다는 이야기. 반년 뒤 남은 문서가 3분의 1이 됐다.",
    source: "개인 블로그",
    sourceUrl: "https://example.blog/wiki-cleanup",
    dayOffset: 2,
    hourKst: 10,
    score: 38,
  },
  {
    id: "c05",
    title: "우리 서비스의 데이터 처리 방침을 바꿉니다",
    originalTitle: "Changes to our data processing terms",
    summary:
      "기업 고객의 입력이 학습에 쓰이지 않는다는 조항을 명시하고, 보관 기간을 30일로 줄인다는 공지. 적용 시점이 함께 안내됐다.",
    source: "Google",
    sourceUrl: "https://blog.google/data-processing-update",
    dayOffset: 2,
    hourKst: 9,
    score: 76,
    keywords: [field("정책"), kind("공지")],
    official: "byContent",
  },
];

/**
 * 기준 시각을 받아 소식 목록을 만든다.
 *
 * 서버 렌더와 하이드레이션이 같은 목록을 보게 하려고 `now` 를 밖에서 받는다 —
 * 안에서 현재 시각을 읽으면 두 번의 렌더가 다른 값을 갖는다.
 */
export function dummyArticles(nowIso: string): Article[] {
  const nowMs = Date.parse(nowIso);
  const dayStart = kstDayStartMs(nowIso);
  if (Number.isNaN(nowMs) || dayStart === null) return [];

  return SEEDS.map((seed) => {
    const seedDayStart = dayStart - seed.dayOffset * 86_400_000;
    const at = seedDayStart + seed.hourKst * 3_600_000;
    // 새벽에 열면 오늘 자리의 시각이 아직 오지 않았을 수 있다. 미래 시각을 그리면
    // "3시간 뒤"가 되므로 현재 직전으로 당긴다.
    //
    // **그 날의 자정 아래로는 안 내린다.** 자정 직후 60초 동안은 `nowMs - 60_000` 이
    // 전날이라, 당기기만 하면 오늘 자리의 6건이 통째로 어제 그룹으로 넘어가 첫 화면이
    // 「어제 12건」으로 떴다. 날짜 그룹은 그대로 둔다는 것이 이 클램프의 전제다.
    const clamped = Math.max(Math.min(at, nowMs - 60_000), seedDayStart);

    return {
      id: seed.id,
      title: seed.title,
      originalTitle: seed.originalTitle ?? null,
      summary: seed.summary ?? null,
      source: seed.source,
      sourceUrl: seed.sourceUrl,
      publishedAt: new Date(clamped).toISOString(),
      keywords: seed.keywords ?? [],
      official: seed.official ?? null,
      score: seed.score,
      isTrending: seed.isTrending ?? false,
    };
  });
}
