import type { SupabaseClient } from "@supabase/supabase-js";
import { SORT_ORDER, TIEBREAK_ORDER, type Sort } from "./post-order";

/**
 * 모집글 목록이 PostgREST 에 보내는 **질의 전체** — 고른 컬럼 · 필터 · 정렬이 한자리에 있다.
 *
 * 별도 파일인 이유는 채팅 쪽(`chat-select.ts`)과 같다. 조회 함수는 next 의 요청 맥락에
 * 붙어 있어 노드 검사에서 부를 수 없는데, 여기서 깨진 것은 로직이 아니라 질의의 모양이었다.
 *
 * **정렬 표만 내보내면 붙드는 것이 절반이다.** 검사가 자기 손으로 질의를 조립하면,
 * 조회 코드가 그 표를 안 쓰게 되어도(누가 `order("created_at", …)` 를 도로 인라인해도)
 * 검사는 초록불이다. 그리고 원래 결함의 모양 — 임베드가 있는 질의에서 정렬 옵션이
 * 오류 없이 아무 일도 안 하는 것 — 은 임베드가 없는 질의로는 재현되지 않는다.
 * 그래서 질의를 만드는 함수째로 내보내고, 조회와 검사가 **같은 함수**를 부른다.
 */

/**
 * 카드가 필요로 하는 것만 고른다.
 *
 * `accepted_count` · `recruiting` · `likes_count` · `is_latest_for_study` 는 컬럼이 아니라
 * **데이터베이스가 계산해 주는 값**이다(0002 · 0003 마이그레이션). 저장하지 않는 이유는
 * INV-P2·P6 이고, 여기서 세지 않는 이유는 참여자 행이 공개가 아니기 때문이다 —
 * 그래서 수만 내주는 함수를 거친다(INV-P9).
 */
export const CARD_COLUMNS = `
  id, title, summary, created_at, views_count, likes_count,
  study:studies!inner(
    id, category_id, region_code, location_detail, meeting_mode,
    max_participants, recruit_until, accepted_count, recruiting,
    category:categories!inner(name),
    region:regions!inner(name),
    slots:study_sessions(weekday, starts_at)
  )
`;

export type PostQuery = {
  /** 제목·요약 부분 일치 */
  readonly q?: string;
  /** 대분류 아이디. 비어 있으면 전체 */
  readonly categories?: readonly string[];
  readonly regionCode?: string;
  /** true 면 온라인 진행만 */
  readonly onlineOnly?: boolean;
  readonly openOnly?: boolean;
  readonly sort?: Sort;
  /** 1부터 */
  readonly page?: number;
  readonly perPage?: number;
};

/** PostgREST 의 패턴 문법에서 뜻을 갖는 글자를 없앤다 — 검색어가 필터를 깨지 않게 */
export function safePattern(q: string): string {
  return q.replace(/[%_,()]/g, " ").trim();
}

/**
 * 목록 질의. 쪽 나눔(`range`)은 부르는 쪽이 붙인다 — 검사는 전부를 보고 싶어 한다.
 *
 * **스터디마다 가장 최근 한 장만** 나온다(docs/IA.md). 그 판정은 데이터베이스가 한다 —
 * 여기서 걸러 내면 쪽을 나눈 순간 규칙이 깨진다.
 */
export function postsQuery(db: SupabaseClient, query: PostQuery = {}) {
  let q = db
    .from("posts")
    .select(CARD_COLUMNS, { count: "exact" })
    .eq("is_latest_for_study", true);

  if (query.q) {
    const pattern = safePattern(query.q);
    if (pattern) q = q.or(`title.ilike.%${pattern}%,summary.ilike.%${pattern}%`);
  }
  if (query.categories && query.categories.length > 0) {
    q = q.in("study.category_id", [...query.categories]);
  }
  if (query.regionCode) q = q.eq("study.region_code", query.regionCode);
  if (query.onlineOnly) q = q.in("study.meeting_mode", ["online", "hybrid"]);
  if (query.openOnly) q = q.eq("study.recruiting", true);

  // 어휘 밖의 값이 오면 최신순으로 떨어진다. `toSort` 가 이미 거르므로 이 가지는 그
  // 화이트리스트가 뚫렸을 때만 도는데, **이 되돌림이 없으면** 그때 undefined 를 순회하다
  // 목록 화면 전체가 500 이 된다 — 로그인 없이 누구나 낼 수 있는 500 이다.
  for (const key of SORT_ORDER[query.sort ?? "latest"] ?? SORT_ORDER.latest) {
    q = q.order(key.column, key.options);
  }
  return q.order(TIEBREAK_ORDER.column, TIEBREAK_ORDER.options);
}
