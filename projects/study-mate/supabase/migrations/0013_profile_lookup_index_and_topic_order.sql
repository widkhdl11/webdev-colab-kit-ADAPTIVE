-- ═════════════════════════════════════════════════════════════════════════
-- 0013 — 리뷰가 잡은 둘: 프로필 판정이 세 표를 통째로 훑던 것 · 주제 검사의 평가 순서
-- ═════════════════════════════════════════════════════════════════════════


-- ── ① 판정 함수가 거는 조건에 인덱스가 없었다 ────────────────────────────
--
-- `private.profile_is_visible` 은 `security definer` 라 플래너가 인라인하지 못한다.
-- 그래서 **읽히는 프로필 행마다** 함수가 한 번씩 돌고, 그 안의 네 갈래가 각각 따로 계획된다.
-- 갈래가 거는 조건은 `posts.author_id` · `chat_messages.sender_id` · `studies.host_id` 인데
-- 앞의 둘에는 인덱스가 아예 없었고, `studies_host_idx` 는 `where deleted_at is null` 이 붙은
-- 부분 인덱스라 이 질의에서는 못 쓴다(그 조건이 불투명한 함수 안에 있어 플래너가 못 본다).
--
-- **실측했다.** 프로필 1000 · 스터디 20 · 모집글 40 · 메시지 40000 을 넣고
-- 비로그인으로 `select id from public.profiles` 를 다섯 번씩 돌린 중앙값:
--
--   인덱스 넣기 전  1103 ms
--   인덱스 넣은 뒤     9 ms      (120배)
--
-- 어느 갈래에도 안 걸리는 프로필 980개가 네 갈래를 전부 지나면서 나는 비용이다. 로그인 없이
-- 누구나 반복해서 낼 수 있고, `max_rows` 는 이걸 못 막는다 — 통과하는 행이 적어서 상한이
-- 일찍 끊을 수가 없다. 새는 것은 없고 깨지는 것은 응답 시간이다.
create index if not exists posts_author_idx on public.posts (author_id);
create index if not exists chat_messages_sender_idx on public.chat_messages (sender_id);
-- 부분 조건이 없는 것으로 하나 더. `studies_host_idx`(부분)는 지우지 않는다 —
-- `deleted_at is null` 을 평문으로 쓰는 화면 질의는 여전히 그쪽이 낫다.
create index if not exists studies_host_all_idx on public.studies (host_id);


-- ── ② 「모양을 먼저 보고 나서 형변환한다」가 and 로는 보장되지 않았다 ─────
--
-- 0012 는 조건을 이렇게 썼다:
--
--   realtime.topic() ~* '<모양>'  and  private.is_chat_member(substring(...)::uuid, ...)
--
-- 그리고 주석에 "모양을 먼저 보고 나서 형변환한다"고 적었다. **그건 `and` 가 보장하는 것이
-- 아니다** — PostgreSQL 은 `and` 피연산자의 평가 순서를 비용으로 재배열한다. 재배열되면
-- 모양이 틀린 주제에서 형변환이 먼저 평가돼 정책 평가 중에 오류가 나고, 그것이 0012 가
-- 없애려던 바로 그 상태다.
--
-- 순서를 지키라고 부탁하는 대신 **예외가 날 자리를 없앤다.** 모양 검사와 형변환을 한 함수로
-- 묶으면 `case` 의 평가 순서가 문법으로 정해지고, 모양이 아니면 오류 대신 null 이 나온다.
-- 그러면 순서가 무의미해지고, 검사도 이 함수를 직접 부를 수 있다(정책을 흉내 낼 필요가 없다).
create or replace function private.chat_topic_uuid(p_topic text)
returns uuid language sql immutable set search_path = '' as $fn$
  -- 대소문자를 가리지 않는다: 형변환은 둘 다 받으므로, 표기 때문에 인가가 갈려서는 안 된다.
  select case
           when p_topic ~* '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             then substring(p_topic from 6)::uuid
         end;
$fn$;

comment on function private.chat_topic_uuid(text) is
  '주제 이름에서 대화 id 를 꺼낸다. 모양이 아니면 오류가 아니라 null — 정책 평가 중에 예외가 나지 않게 하는 것이 이 함수의 존재 이유다.';

revoke all on function private.chat_topic_uuid(text) from public;
grant execute on function private.chat_topic_uuid(text) to anon, authenticated, service_role;

drop policy if exists chat_broadcast_read on realtime.messages;
create policy chat_broadcast_read on realtime.messages for select to authenticated
using (
  private.is_chat_member(
    private.chat_topic_uuid(realtime.topic()),
    (select auth.uid())
  )
);

comment on policy chat_broadcast_read on realtime.messages is
  'INV-P8 의 강제 위치(실시간). 모양 검사와 형변환이 private.chat_topic_uuid 안에 함께 있어서, 평가 순서와 무관하게 정책 평가 중 예외가 나지 않는다.';
