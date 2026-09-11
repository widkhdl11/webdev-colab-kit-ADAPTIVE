import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 추천의 근거를 읽는 **질의 셋** — 고른 컬럼·필터·정렬이 한자리에 있다.
 *
 * 별도 파일인 이유는 `entities/post/api/post-query.ts` 와 같다. 조회 함수는 요청 맥락
 * (`cookies()`)에 붙어 있어 검사에서 부를 수 없는데, 여기서 붙들어야 하는 것은 로직이
 * 아니라 **이 질의가 정책에 걸리는가**다(INV-G2). 질의를 만드는 함수째로 내보내면 조회와
 * 검사가 같은 함수를 부른다 — 검사가 자기 손으로 질의를 조립하면, 조회 코드가 다른
 * 질의를 쓰게 되어도 검사는 초록불이다.
 *
 * **읽는 연결은 부르는 쪽이 준다.** 앱은 요청자의 세션을 주고, 검사는 로그인한 공개 키
 * 연결을 준다. 어느 쪽이든 정책이 판정한다 — 정책을 우회하는 키를 이 앱은 갖지 않는다.
 */

/** 프롬프트에 실어 보내는 제목의 개수 상한. 근거는 신호이지 목록이 아니다 */
export const EVIDENCE_TITLE_MAX = 10;

/** 프로필의 관심 분야·지역. 본인 행은 `profiles_read` 의 ① 갈래가 허용한다 */
export function profileEvidenceQuery(db: SupabaseClient, userId: string) {
  return db.from("profiles").select("interest_category, region").eq("id", userId).maybeSingle();
}

/** 좋아요 누른 모집글의 제목. 담아 오는 것은 **남이 쓴 글자**다 */
export function likedTitlesQuery(db: SupabaseClient, userId: string) {
  return db
    .from("likes")
    .select("post:posts!inner(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(EVIDENCE_TITLE_MAX);
}

/**
 * 신청한 스터디의 제목.
 *
 * **셋 중 이 표만 남의 행이 안 보인다**(`participants_read` 는 본인과 그 스터디의 호스트에게만
 * 허용한다). 그래서 INV-G2 가 깨졌을 때 — 정책을 우회하는 키가 들어왔을 때 — 제일 먼저
 * 달라지는 자리가 여기다. 검사도 여기를 본다.
 */
export function appliedTitlesQuery(db: SupabaseClient, userId: string) {
  return db
    .from("participants")
    .select("study:studies!inner(title)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(EVIDENCE_TITLE_MAX);
}
