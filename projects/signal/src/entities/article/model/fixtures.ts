import { dummyBody } from "./dummy-body";
import type { Article } from "./types";

/**
 * 임시 더미 데이터.
 *
 * Supabase 프로비저닝 전이라 화면이 붙을 데이터가 아직 없다. 조회 계층이 생기면
 * 이 파일만 걷어내고 같은 `Article[]` 를 돌려주면 된다 — 화면은 그대로 둔다.
 * score·isTrending 은 계산하지 않고 그대로 실어 둔다(types.ts 주석 참조).
 */

interface Seed {
  id: string;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  /** 기준 시각으로부터 몇 시간 전에 발행됐는지. 날짜 그룹은 이 값에서 파생된다. */
  hoursAgo: number;
  tags: Article["tags"];
  score: number;
  isTrending?: boolean;
  /** 요약의 핵심 항목. 실제 요약은 항목이 없을 수도 있어서 대부분 비워뒀다. */
  points?: string[];
}

const SEEDS: Seed[] = [
  {
    id: "agent-tool-count",
    title: "에이전트에게 도구를 몇 개까지 쥐여줘야 할까",
    summary:
      "도구 목록이 길어질수록 모델이 엉뚱한 도구를 고르는 빈도가 늘어난다는 관찰. 설명을 짧게 다듬고 비슷한 기능은 하나로 묶는 쪽이 낫다는 정리.",
    sourceName: "Anthropic 블로그",
    sourceUrl: "https://www.anthropic.com/engineering",
    hoursAgo: 2,
    tags: ["에이전트"],
    score: 92,
    isTrending: true,
    points: [
      "비슷한 일을 하는 도구가 여러 개면 모델이 고민을 시작한다 — 묶을 수 있으면 묶는다",
      "도구 설명은 길게 쓰는 것보다 무엇을 안 하는지 적는 쪽이 효과적이었다",
      "도구를 늘리기 전에 지금 쓰는 도구의 호출 로그부터 본다",
    ],
  },
  {
    id: "mcp-first-setup",
    title: "MCP 서버를 처음 붙일 때 자주 막히는 지점 정리",
    summary:
      "권한 범위, 스키마 검증, 타임아웃 세 군데에서 대부분 막힌다. 각 경우에 로그를 어디부터 봐야 하는지 순서대로 짚어둔 글.",
    sourceName: "GitHub",
    sourceUrl: "https://github.com/modelcontextprotocol",
    hoursAgo: 4,
    tags: ["MCP", "툴"],
    score: 88,
    isTrending: true,
  },
  {
    id: "shorter-prompts",
    title: "컨텍스트 창이 넓어져도 프롬프트를 줄여야 하는 이유",
    summary:
      "넣을 수 있는 양과 실제로 활용되는 양은 다르다. 중간 부분의 정보가 묻히는 현상을 어떻게 확인하고 줄일지에 대한 실무 메모.",
    sourceName: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/",
    hoursAgo: 6,
    tags: ["엔지니어링"],
    score: 74,
  },
  {
    id: "keyword-before-embedding",
    title: "사내 문서 검색에 임베딩 대신 키워드를 먼저 붙여본 후기",
    summary:
      "벡터 검색부터 도입하기 전에 태그와 키워드 필터로 후보를 좁히는 편이 비용과 정확도 모두에서 나았다는 팀의 기록.",
    sourceName: "개인 블로그",
    sourceUrl: "https://example.com/posts/keyword-first",
    hoursAgo: 8,
    tags: ["엔지니어링"],
    score: 66,
  },
  {
    id: "coding-agent-eval",
    title: "코딩 에이전트 평가를 자동화하려다 배운 것",
    summary:
      "“통과/실패”만 세면 실제 품질과 어긋난다. 무엇을 실패로 볼지 정의하는 데 대부분의 시간이 들어갔다는 회고.",
    sourceName: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/",
    hoursAgo: 9,
    tags: ["에이전트"],
    score: 61,
  },
  {
    id: "local-model-bottleneck",
    title: "오픈소스 모델을 로컬에서 돌릴 때 부딪히는 현실적인 병목",
    summary:
      "메모리보다 먼저 걸리는 건 대개 입출력과 양자화 설정이었다는 정리. 장비를 늘리기 전에 확인할 항목들.",
    sourceName: "기술 뉴스레터",
    sourceUrl: "https://example.com/newsletter/local-models",
    hoursAgo: 20,
    tags: ["모델"],
    score: 84,
    isTrending: true,
  },
  {
    id: "typed-tool-schema",
    title: "타입 안전한 도구 스키마를 만드는 작은 패턴",
    summary:
      "스키마 정의 하나에서 런타임 검증과 타입을 함께 끌어내는 방식. 도구가 늘어날수록 손으로 맞추던 부분이 줄어든다.",
    sourceName: "GitHub",
    sourceUrl: "https://github.com/colinhacks/zod",
    hoursAgo: 22,
    tags: ["툴", "엔지니어링"],
    score: 71,
  },
  {
    id: "drop-retrieval",
    title: "검색 단계를 걷어내고 파일을 통째로 넣어본 팀의 기록",
    summary:
      "문서 수가 적을 때는 파이프라인을 줄이는 쪽이 유지보수에 유리했다는 이야기. 어느 규모부터 다시 검색이 필요해졌는지도 함께.",
    sourceName: "개인 블로그",
    sourceUrl: "https://example.com/posts/no-retrieval",
    hoursAgo: 26,
    tags: ["엔지니어링"],
    score: 63,
  },
  {
    id: "mcp-resource-vs-tool",
    title: "MCP의 리소스와 툴, 언제 무엇을 쓰나",
    summary:
      "읽기만 하면 리소스, 부수효과가 있으면 툴로 나누는 기준을 예제와 함께 설명한다. 애매한 경우의 판단법도 정리.",
    sourceName: "문서 사이트",
    sourceUrl: "https://modelcontextprotocol.io/docs",
    hoursAgo: 30,
    tags: ["MCP"],
    score: 58,
  },
  {
    id: "thin-model-abstraction",
    title: "모델을 갈아끼우는 비용을 낮추는 얇은 추상화 층",
    summary:
      "공급자별 차이를 한 겹으로 감싸되 너무 두껍게 만들지 않는 선을 어디에 둘지에 대한 논의. 실패 사례도 함께 실렸다.",
    sourceName: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/",
    hoursAgo: 44,
    tags: ["모델", "엔지니어링"],
    score: 69,
    isTrending: true,
  },
  {
    id: "readable-agent-logs",
    title: "에이전트 로그를 사람이 읽을 수 있게 만드는 법",
    summary:
      "호출 기록을 그대로 쌓으면 아무도 안 본다. 무엇을 접고 무엇을 펼칠지 정하는 것부터가 관측 가능성의 시작이라는 관점.",
    sourceName: "개인 블로그",
    sourceUrl: "https://example.com/posts/agent-logs",
    hoursAgo: 46,
    tags: ["에이전트"],
    score: 57,
  },
  {
    id: "reading-benchmarks",
    title: "새 벤치마크가 나올 때마다 확인하는 세 가지",
    summary:
      "측정 대상, 재현 조건, 그리고 내 작업과의 거리. 점수표를 그대로 믿기 전에 짚어볼 항목을 짧게 정리했다.",
    sourceName: "기술 뉴스레터",
    sourceUrl: "https://example.com/newsletter/benchmarks",
    hoursAgo: 52,
    tags: ["모델"],
    score: 52,
  },
  {
    id: "prompts-as-files",
    title: "프롬프트를 파일로 관리하기 시작하고 달라진 것",
    summary:
      "코드 리뷰에 프롬프트가 올라오면서 바뀐 점들. 버전을 되돌릴 수 있게 된 것이 가장 컸다는 이야기.",
    sourceName: "개인 블로그",
    sourceUrl: "https://example.com/posts/prompts-as-files",
    hoursAgo: 68,
    tags: ["엔지니어링"],
    score: 60,
    isTrending: true,
  },
  {
    id: "tool-error-feedback",
    title: "도구 호출 실패를 모델에게 어떻게 돌려줄까",
    summary:
      "스택 트레이스를 그대로 넘기면 모델이 같은 실패를 반복한다. 무엇을 고쳐야 하는지 한 줄로 요약해 돌려주는 편이 나았다는 정리.",
    sourceName: "문서 사이트",
    sourceUrl: "https://modelcontextprotocol.io/docs",
    hoursAgo: 70,
    tags: ["에이전트", "툴"],
    score: 55,
  },
  {
    id: "when-small-models",
    title: "작은 모델로 충분한 작업을 가려내는 기준",
    summary:
      "분류·추출처럼 출력 형태가 좁은 일부터 옮겨 본 결과. 어디서 품질이 꺾이는지 미리 재는 방법도 함께 실렸다.",
    sourceName: "기술 뉴스레터",
    sourceUrl: "https://example.com/newsletter/small-models",
    hoursAgo: 74,
    tags: ["모델"],
    score: 50,
  },
  {
    id: "mcp-internal-permissions",
    title: "MCP 서버를 사내에 배포할 때의 권한 설계",
    summary:
      "누가 어떤 도구를 부를 수 있는지를 서버 바깥에서 정하는 구조. 감사 로그를 남기는 위치에 대한 논의도 있다.",
    sourceName: "GitHub",
    sourceUrl: "https://github.com/modelcontextprotocol",
    hoursAgo: 78,
    tags: ["MCP"],
    score: 47,
  },
];

/**
 * 기준 시각을 받아 더미 목록을 만든다.
 *
 * 시각을 인자로 받는 이유: 서버에서 한 번 만들어 화면으로 내려보내야 서버 렌더와
 * 브라우저 렌더가 같은 값을 본다. 각자 `new Date()` 를 부르면 상대시각이 어긋난다.
 */
export function createDummyArticles(now: Date): Article[] {
  return SEEDS.map(({ hoursAgo, isTrending, points, ...rest }) => ({
    ...rest,
    publishedAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
    isTrending: isTrending ?? false,
    summaryPoints: points ?? [],
    contentHtml: dummyBody(rest),
  }));
}
