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

export interface Article {
  id: string;
  title: string;
  /** 요약. 원문이 진실이고 요약은 신뢰 경계 밖이다 — 생성 실패 시 빈 문자열일 수 있다. */
  summary: string;
  /** 요약의 핵심 항목. 없을 수 있다(요약이 문단 하나뿐인 경우). */
  summaryPoints: string[];
  /**
   * 출처에서 가져온 원문 HTML. **신뢰 경계 밖**이다 —
   * 반드시 content-safety.md 의 sanitize 를 거친 뒤에만 렌더한다(INV-D1~D3).
   */
  contentHtml: string;
  /** 출처 이름(메타 줄 표시용). */
  sourceName: string;
  /** 원문 주소. 상세에서 "원문 보기"로 나간다. */
  sourceUrl: string;
  /** 발행 시각(ISO). 날짜 그룹과 최신순 정렬의 기준. */
  publishedAt: string;
  tags: ArticleTag[];
  /**
   * 랭킹 점수. '뜨는순' 정렬의 기준값이다.
   *
   * 계산식(시간감쇠 × 소스 weight)은 docs/specs/planned/ingestion-ranking.md(INV-R)에
   * 파킹돼 있고 아직 활성화되지 않았다. 그때까지 이 값은 조회 결과에 실려 오는 것으로 취급한다 —
   * 화면에서 점수를 만들어 내지 않는다.
   */
  score: number;
  /**
   * '뜨는 중' 뱃지 표시 여부. 승인된 디자인 기준상 "그룹 안에서의 상위"를 뜻한다.
   * 위 score 와 같은 이유로 지금은 데이터가 들고 온다.
   */
  isTrending: boolean;
}

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
