import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 초안의 근거가 되는 스터디를 읽는 질의 (INV-G8).
 *
 * **`host_id` 조건이 이 질의의 전부다.** 스터디 자체는 누구나 읽을 수 있으므로
 * (`studies_read`), 「남의 스터디로 초안을 못 만든다」를 정책이 대신 막아 주지 않는다.
 *
 * **데이터베이스가 이미 막는데 왜 또 보나.** 정책은 모집글을 **저장할 때** 호스트를 판정한다
 * (`0014` 의 `posts_insert_author`). 초안은 그보다 앞이라, 남의 스터디 id 를 실어 보내면
 * 저장은 실패하지만 **그 전에 남의 스터디 설명이 프롬프트를 지나 초안으로 돌아온다.**
 * 거부되는 것은 쓰기지 읽기가 아니다.
 *
 * 별도 파일인 이유는 `evidence-query.ts` 와 같다 — 조회 함수는 요청 맥락에 묶여 검사에서
 * 못 부르는데, 붙들어야 하는 것은 이 질의의 모양이다. 조회와 검사가 같은 함수를 부른다.
 *
 * **`host_id` 조건은 정책이 아니라 필터다.** 스터디 조회는 공개라(`studies_read` 는
 * `using (true)`) 이 자리에 아무 id 나 넣으면 그 사람의 스터디가 그대로 온다 —
 * 실제로 통합 검사에서 확인했다(`tests/integration/draft-host-only.test.ts`).
 *
 * **그래서 INV-G8 을 지키는 것은 이 파일이 아니라 `userId` 의 출처다.** 부르는 자리
 * (`draft-post.ts`)는 `currentUser()` 가 확인한 세션의 id 만 넣고, 화면에서 받는 값은
 * `studyId` 하나뿐이다. 이 함수를 새로 부르게 되는 날 그 규칙을 같이 가져가야 한다.
 */
export function hostedStudyForDraftQuery(db: SupabaseClient, studyId: string, userId: string) {
  return db
    .from("studies")
    .select(
      "title, description, max_participants, meeting_mode, location_detail, category:categories!inner(name), region:regions!inner(name), slots:study_sessions(weekday, starts_at)",
    )
    .eq("id", studyId)
    .eq("host_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
}
