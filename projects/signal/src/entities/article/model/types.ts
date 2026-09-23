import type { ArticleKind, Gate } from "../lib/hot-issue";
import type { SignalPoint, SummaryTable } from "../lib/summary-format";

/** 수집된 소식 한 건. 피드·상세가 공유하는 도메인 모델. */

/**
 * 뱃지 키워드의 **축** (badge-keywords INV-B1, 마이그레이션 0006 의 `tag.axis`).
 *
 *   - `field`  — 분야. 무엇에 대한 글인가 (`코딩`·`보안`·`프론트엔드`). 글마다 1~3개.
 *   - `kind`   — 사건종류. 무슨 일이 일어났나 (`출시`·`규제`·`투자`). 글마다 0~2개.
 *   - `legacy` — 고정 5개 시절 태그. 뱃지 줄에서 걸러내려고 갈라 둔 값이다.
 *
 * DB 기본값이 `field` 라 **안 실어 보내면 사건종류가 분야로 저장된다.** 조용히 틀리는
 * 자리라 저장 경로 전체가 이 타입을 들고 다닌다.
 */
export const TAG_AXES = ["field", "kind", "legacy"] as const;

export type TagAxis = (typeof TAG_AXES)[number];

/**
 * 고정 5개 시절의 주제 태그.
 *
 * **새로 붙이는 데 쓰지 않는다.** 2026-08-30 부터 태그는 글마다 모델이 만들고
 * (badge-keywords INV-B1), 이 다섯은 마이그레이션 0006 이 `axis = 'legacy'` 로 갈라 뒀다.
 * 상수가 남아 있는 이유는 그 다섯 행을 이름으로 짚어 정리할 때까지다.
 */
export const ARTICLE_TAGS = [
  "모델",
  "에이전트",
  "MCP",
  "엔지니어링",
  "툴",
] as const;

/**
 * 글에 붙은 키워드 이름.
 *
 * **고정 목록이 아니다** — 모델이 글마다 만든다(INV-B1). 예전엔 `ARTICLE_TAGS` 의
 * 유니온이었고, 그래서 목록 밖의 말이 저장·읽기 세 군데에서 조용히 버려졌다.
 */
export type ArticleTag = string;

/**
 * 글에 붙은 키워드 하나 — 이름과 축.
 *
 * **축을 이름과 함께 들고 다닌다.** 화면이 두 축을 색으로 가르는데(design-rules 2026-08-27
 * 분야=청회색 / 사건종류=모래빛), 이름만 읽어 오면 화면에서 다시 알 방법이 없다.
 */
export interface ArticleKeyword {
  name: ArticleTag;
  axis: TagAxis;
}

/**
 * 공식 발표인지의 **근거** (content-selection INV-O2).
 *
 * "공식이다/아니다" 두 값으로 두지 않는 이유가 이 스펙의 요지다:
 *   - `byUrl` — 원문 주소가 그 주체의 도메인. 기계가 대조한 것이라 확실하다(INV-O3).
 *   - `byContent` — 글 내용을 보고 모델이 판단한 것. **틀릴 수 있다.**
 *   - `none` — 판단 근거가 없다. 표시하지 않는다.
 *
 * 둘을 한 값으로 합치면 모델 판단이 주소 근거와 같은 확실성으로 보이고,
 * 모델이 틀린 날 사용자가 그대로 믿는다.
 */
export const OFFICIAL_BASES = ["none", "byUrl", "byContent"] as const;

export type OfficialBasis = (typeof OFFICIAL_BASES)[number];

export interface Article {
  id: string;
  /** 출처가 준 원문 제목. **번역문으로 덮지 않는다** (INV-S6) — 원문이 진실이다. */
  title: string;
  /**
   * 한국어로 옮긴 제목 (INV-S6). 아직 없거나 번역이 실패하면 null.
   *
   * 화면이 직접 고르지 않고 `displayTitle` 을 거친다 — 카드와 상세가 각자 판단하면
   * 두 화면이 다른 제목을 보여준다.
   */
  titleKo: string | null;
  /** AI 가 만든 요약. 원문이 진실이고 요약은 신뢰 경계 밖이다 — 없으면 빈 문자열. */
  summary: string;
  /**
   * 출처가 준 요약글 (INV-S2). AI 요약이 없을 때 화면이 대신 보여준다.
   * 없으면 null — 빈 문자열과 구별해야 "있는데 비었다"와 갈리지 않는다.
   */
  sourceExcerpt: string | null;
  /** 요약의 핵심 항목. 없을 수 있다(요약이 문단 하나뿐인 경우). */
  summaryPoints: string[];
  /**
   * 출처에서 가져온 원문 HTML. **신뢰 경계 밖**이다 —
   * 반드시 content-safety.md 의 sanitize 를 거친 뒤에만 렌더한다(INV-D1~D3).
   */
  contentHtml: string;
  /**
   * 출처의 안정 식별자. 소스 설정(entities/source)의 `id` 와 같은 값이다.
   *
   * 표시 이름과 따로 두는 이유: weight 조회 키가 표시 이름이면(INV-R4) 출처 이름을
   * 다듬는 순간 그 소스의 모든 글이 기본 배수로 떨어진다. 순위가 조용히 바뀐다.
   */
  sourceId: string;
  /** 출처 이름(메타 줄 표시용). */
  sourceName: string;
  /** 원문 주소. 상세에서 "원문 보기"로 나간다. */
  sourceUrl: string;
  /** 발행 시각(ISO). 날짜 그룹과 최신순 정렬의 기준. */
  publishedAt: string;
  /** 이 글에 붙은 뱃지 키워드. 축을 함께 들고 온다 — 화면이 색으로 가른다. */
  tags: ArticleKeyword[];
  /**
   * 공식 발표 여부의 근거 (INV-O2). 화면은 `byUrl` 과 `byContent` 를 **다른 표시로** 그린다.
   *
   * 파생값이 아니라 저장된 값이다 — `byUrl` 은 적재 때 주소로 정하고(INV-O3),
   * `byContent` 는 요약 단계에서 모델이 정한다.
   */
  officialBasis: OfficialBasis;
  /**
   * 문 배정 (hot-issue.md INV-H1). `gate1` 이면 핫이슈, `null` 이면 판정을 못 받았거나
   * 문턱을 못 넘었다.
   *
   * **`score`·`isTrending` 과 달리 저장된 값이다** — 모델 판정이라 다시 물으면 다른 값이
   * 나올 수 있고 요금도 다시 나간다(INV-H2).
   */
  gate: Gate | null;
  /**
   * 글의 종류 (hot-issue.md INV-G1). 한 글이 둘 다일 수 있고, 비어 있을 수도 있다.
   *
   * **화면 자리를 정하는 데 쓰는 것은 `tool` 하나다** (INV-G3). 비어 있어도 그 글은
   * 소식에 선다 — 종류로 거르면 갈 곳 없는 글이 조용히 사라진다.
   */
  kinds: ArticleKind[];
  /**
   * 랭킹 점수. '뜨는순' 정렬의 기준값이다.
   *
   * **저장된 값이 아니다** (ingestion-ranking INV-R1). 시간감쇠 × 소스 weight 로
   * 조회 시점에 계산해 실어 보낸다. 화면은 이 값을 만들지 않고 받기만 한다.
   */
  score: number;
  /**
   * '뜨는 중' 뱃지 표시 여부 — 날짜 그룹 안 상위 `TRENDING_TOP_N` 개 (INV-R5).
   *
   * score 와 마찬가지로 조회 시점 파생값이고, **필터·정렬을 걸기 전 목록** 기준으로
   * 정해진다. 그래서 태그 필터를 걸어도 이 값은 안 바뀐다.
   */
  isTrending: boolean;
  /**
   * 이슈성 (hot-issue.md INV-N3) — **핫이슈 자리의 순서**를 정하는 값이다.
   *
   * `score` 와 마찬가지로 저장하지 않고 조회 시점에 계산한다(INV-H2). 지금은 교차 발행처
   * 수가 항상 1 이라 `score` 와 값이 같은데, **같은 값을 두 칸에 두는 것이 요점이다** —
   * 같은 사건 묶기가 붙어 그 수가 1 을 넘는 날 이 칸만 달라지고 핫이슈 순서가 따라 바뀐다.
   * 한 칸으로 합치면 그날 아무것도 안 바뀌고, 그 사실을 아무도 모른다(2026-09-21 리뷰).
   */
  issueScore: number;
  /**
   * 한 줄 요약 (ingestion-ranking INV-S8). **있으면 새 요약 형식이다** — 화면이 새 순서로 그린다.
   * 옛 요약이면 null. 선택 칸인 이유: 목록 조회는 이 칸을 안 받는다(상세만 받는다).
   */
  oneLine?: string | null;
  /** 요약에 딸린 표 (INV-S8). 검사를 통과한 것만 온다(content-safety INV-D7). */
  summaryTable?: SummaryTable | null;
  /** 핫이슈 판정에서 참인 질문과 근거 (hot-issue INV-G2). 판정이 없으면 빈 목록. */
  signalPoints?: SignalPoint[];
}

/**
 * DB 에 실제로 들어 있는 모양 — 랭킹 파생값이 빠져 있다 (INV-R1).
 *
 * `score` 컬럼을 두지 않는다는 규칙을 타입으로도 붙들어 둔다. `never` 자리가 없으면
 * 구조적 타이핑에서 `Article` 이 그냥 대입돼, 조회 결과를 그대로 저장하는 한 줄이
 * 조용히 컴파일된다 (ArticleListItem 이 본문에 대해 쓰는 것과 같은 장치).
 */
export type StoredArticle = Omit<Article, "score" | "isTrending" | "issueScore"> & {
  score?: never;
  isTrending?: never;
  issueScore?: never;
};

/**
 * 목록 화면이 쓰는 투영. **원문 본문(`contentHtml`)이 빠져 있다.**
 *
 * 피드는 제목·요약·태그·메타만 그리는데, 목록에 Article 을 그대로 넘기면 본문 전체가
 * 클라이언트 번들로 직렬화돼 나간다. 더미 데이터에서는 티가 안 나지만 수집한 실제 본문은
 * 건당 수십~수백 KB라, 카드 열두 장 그리는 화면이 요청마다 수 MB를 실어 나르게 된다.
 *
 * 타입으로 빼두면 조회 계층이 붙을 때 "목록 쿼리는 본문 컬럼을 뽑지 않는다"가 강제된다.
 */
export type ArticleListItem = Omit<Article, "contentHtml"> & {
  /**
   * `Article` 을 그대로 대입하지 못하게 막는 자리다. 구조적 타이핑에서는 필드가 더 많은
   * 값이 그냥 들어가므로, 이게 없으면 `Omit` 은 관례일 뿐 강제가 아니다 —
   * 조회 결과를 목록에 바로 넘기는 한 줄이 조용히 컴파일된다.
   */
  contentHtml?: never;
};

/** Article → 목록 투영. 본문을 떼는 지점을 한 곳으로 모은다. */
export function toListItem(article: Article): ArticleListItem {
  const { contentHtml: _contentHtml, ...rest } = article;
  return rest;
}
