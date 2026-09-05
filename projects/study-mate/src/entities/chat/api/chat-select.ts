import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 채팅방 조회의 **질의 모양** — select 문자열과 필터를 한자리에 둔다.
 *
 * 별도 파일인 이유는 통합 검사가 이것을 그대로 눌러 보기 위해서다. 조회 함수는 next 의
 * 요청 맥락(쿠키)에 붙어 있어 노드 검사에서 부를 수 없는데, 지금까지 깨진 것은 로직이
 * 아니라 늘 이 모양이었다:
 *
 *   · `study:studies!inner(...)` 가 지워진 스터디의 방을 멤버에게서 떨어뜨렸다 (INV-Z6 위반)
 *   · `.eq("user_id", …)` 가 빠져 같은 방이 멤버 수만큼 여러 번 나왔고, 안 읽은 수가
 *     남의 `last_read_at` 으로 계산됐다
 *
 * **둘째 것이 select 가 아니라 필터에 있다.** 문자열만 내보내면 검사가 붙드는 것이 절반뿐이라,
 * 질의를 만드는 함수째로 내보낸다. 클라이언트를 인자로 받으므로 요청 맥락 문제는 그대로 피한다.
 */
export const CHAT_LIST_SELECT = `last_read_at,
       chat:chats!inner(
         id,
         study_id,
         study:studies(id, title, category_id, accepted_count)
       )`;

export const CHAT_ROOM_SELECT = "id, study_id, study:studies(id, title, category_id, accepted_count)";

/**
 * 내가 들어가 있는 방들.
 *
 * `user_id` 필터는 **인가가 아니라 중복 제거**다 — 조회 정책(`chatpart_read_member`)이
 * 내가 속한 방의 참여자 행을 전부 보여주기 때문에 필요하다. 그래서 넘기는 값은 반드시
 * 세션의 사용자여야 한다. 남의 id 를 넣으면 같은 방 안에서 그 사람의 「마지막으로 읽은 시각」이 나온다.
 */
export function myChatsQuery(db: SupabaseClient, sessionUserId: string) {
  return db.from("chat_participants").select(CHAT_LIST_SELECT).eq("user_id", sessionUserId);
}

/** 방 하나. 멤버가 아니면 정책이 행을 안 준다. */
export function chatRoomQuery(db: SupabaseClient, chatId: string) {
  return db.from("chats").select(CHAT_ROOM_SELECT).eq("id", chatId).maybeSingle();
}
