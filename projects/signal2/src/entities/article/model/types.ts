/* 소식 한 건. 화면이 그리는 데 필요한 모양만 담는다.
 *
 * 여기 있는 값은 전부 "데이터가 들고 오는 것"이다 — 화면에서 계산하지 않는다.
 * 특히 isTrending 은 랭킹 규칙(docs/specs/ingestion-ranking.md, 지금 status: parked)이
 * 정할 값이라 화면이 대신 발명하면 안 된다.
 */

/**
 * 뱃지 키워드의 축. 분야 = 무엇에 대한 글인가, 사건종류 = 무슨 일이 일어났나.
 *
 * **값 목록이 먼저고 타입은 거기서 나온다.** 주소를 파싱하는 자리(`parseKeywordKey`)가
 * 축 이름을 문자열로 들고 있어야 하는데, 목록을 따로 적으면 축이 하나 늘었을 때 화면은
 * 그리고 클릭도 되는데 **주소를 거치는 순간만** 조용히 풀린다(새로고침·상세 이동·뒤로가기).
 * tsc 는 아무 말도 안 한다. 이렇게 두면 축 추가가 컴파일 에러가 된다.
 */
export const KEYWORD_AXES = ["field", "kind"] as const;
export type KeywordAxis = (typeof KEYWORD_AXES)[number];

export type Keyword = {
  name: string;
  axis: KeywordAxis;
};

/**
 * 공식 발표 표시의 근거. 두 값이 같은 확실성으로 보이면 안 된다 —
 * byUrl 은 원문 주소의 도메인을 기계가 대조한 것이고, byContent 는 모델 판단이라 틀릴 수 있다.
 */
export type OfficialMark = "byUrl" | "byContent";

export type Article = {
  id: string;
  /** 우리가 붙인 한국어 제목. */
  title: string;
  /** 출처가 쓴 원래 제목. 번역하지 않았으면 null 이고, 그때는 title 이 곧 원문 제목이다. */
  originalTitle: string | null;
  /** 근거가 없어 요약을 만들지 못한 소식이 있다. 그 빈칸은 말로 채우지 않는다. */
  summary: string | null;
  source: string;
  sourceUrl: string;
  /** ISO 8601. 그룹과 표기는 전부 KST 로 판정한다(shared/lib/kst). */
  publishedAt: string;
  keywords: Keyword[];
  official: OfficialMark | null;
  /**
   * 날짜 그룹 안의 정렬에 쓰는 점수. 이 값을 어떻게 만드는지는 랭킹 스펙이 정한다
   * (시간감쇠 × 소스 weight, 저장하지 않고 조회 시 계산). 화면은 받아서 정렬만 한다.
   */
  score: number;
  /** 그 날짜 그룹 안에서의 상위 여부. 전역 상위가 아니다. */
  isTrending: boolean;
};
