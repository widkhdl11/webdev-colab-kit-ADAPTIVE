/** 수집 소스 한 곳. 소식이 어디서 왔는지와, 그 출처를 얼마나 쳐주는지. */

/**
 * 소스의 성격 (content-selection INV-L1).
 * `daily` = 화제성 — 매일 훑는 것. `deep` = 전문적 — 시간 날 때 읽는 것.
 */
export type SourceTier = "daily" | "deep";

/**
 * 공식 발표가 나오는 자리 (content-selection INV-O3 의 "설정").
 *
 * 도메인 문자열 하나로 두지 않는 이유: 하위 도메인과 경로까지 싸잡으면 **사람이 글을 올릴 수
 * 있는 곳까지 확정 "공식 발표"가 된다.** `community.openai.com`(개발자 포럼),
 * `huggingface.co/<사용자>/<모델>` 이 실제로 그렇고, HN 프론트페이지를 거쳐 들어올 수 있다.
 * 그러면 INV-O2 가 막으려던 상태(기계 근거인데 틀림)가 그대로 생긴다.
 */
export interface SubjectSite {
  /** 정확히 이 호스트여야 한다 (`www.` 는 무시). 하위 도메인은 **포함하지 않는다.** */
  host: string;
  /**
   * 이 경로로 시작할 때만 공식으로 본다. 없으면 그 호스트 전체.
   * 호스트 전체를 여는 것은 그 호스트에 그 주체의 글만 있을 때뿐이다.
   */
  pathPrefix?: string;
}

export interface Source {
  /** 항목이 들고 다니는 값. 바뀌면 기존 항목의 출처를 잃으므로 고정이다. */
  id: string;
  /** 화면 메타 줄에 그대로 쓰인다. */
  name: string;
  /**
   * 랭킹 가중치 (ingestion-ranking INV-R2·R4).
   *
   * **항목에 스냅샷으로 복사하지 않는다.** weight 는 소스에 귀속하는 값이라,
   * 여기를 고치면 다음 조회부터 그 소스의 모든 항목 순위가 바로 따라온다.
   * 항목에 박아 두면 설정을 고쳐도 옛 값이 남아 아무 일도 안 일어난다.
   */
  weight: number;
  /** 수집할 피드 주소. 수집기가 읽는다. */
  feedUrl: string;
  /**
   * 층 (INV-L1). 항목이 아니라 소스에 귀속한다 — 항목마다 다르면
   * "어느 소스가 어느 층인가"를 알 수 없어진다.
   */
  tier: SourceTier;
}
