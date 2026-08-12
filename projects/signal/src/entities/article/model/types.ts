/** 수집된 소식 한 건. 피드·상세가 공유하는 도메인 모델. */

/** 주제 태그. 피드 필터의 기준이자 카드 칩에 그대로 쓰인다. */
export const ARTICLE_TAGS = [
  "모델",
  "에이전트",
  "MCP",
  "엔지니어링",
  "툴",
] as const;

export type ArticleTag = (typeof ARTICLE_TAGS)[number];

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
  tags: ArticleTag[];
  /**
   * 공식 발표 여부의 근거 (INV-O2). 화면은 `byUrl` 과 `byContent` 를 **다른 표시로** 그린다.
   *
   * 파생값이 아니라 저장된 값이다 — `byUrl` 은 적재 때 주소로 정하고(INV-O3),
   * `byContent` 는 요약 단계에서 모델이 정한다.
   */
  officialBasis: OfficialBasis;
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
}

/**
 * DB 에 실제로 들어 있는 모양 — 랭킹 파생값이 빠져 있다 (INV-R1).
 *
 * `score` 컬럼을 두지 않는다는 규칙을 타입으로도 붙들어 둔다. `never` 자리가 없으면
 * 구조적 타이핑에서 `Article` 이 그냥 대입돼, 조회 결과를 그대로 저장하는 한 줄이
 * 조용히 컴파일된다 (ArticleListItem 이 본문에 대해 쓰는 것과 같은 장치).
 */
export type StoredArticle = Omit<Article, "score" | "isTrending"> & {
  score?: never;
  isTrending?: never;
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
