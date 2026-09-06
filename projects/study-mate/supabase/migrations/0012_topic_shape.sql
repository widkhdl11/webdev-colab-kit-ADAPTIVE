-- ═════════════════════════════════════════════════════════════════════════
-- 0012 — 실시간 주제 이름이 uuid 모양인지 제대로 본다
--
-- 0006 이 만들고 0010 이 다시 건 `chat_broadcast_read` 의 조건이 이랬다:
--
--   realtime.topic() ~ '^chat:[0-9a-fA-F-]{36}$'
--
-- **길이 36 과 글자 종류만 본다.** 대시 36개(`chat:------------------------------------`)도
-- 통과하고, 그 뒤의 `::uuid` 형변환에서 죽는다. 정책 평가 중에 나는 오류라 구독이
-- 오류로 끝나고, 그것을 아무나 만들 수 있다.
--
-- 모양을 안 보고 형변환하지 않겠다는 것이 원래 이 줄의 의도였다(0006 의 주석이 그렇게
-- 적혀 있다). 의도대로 8-4-4-4-12 를 본다.
-- ═════════════════════════════════════════════════════════════════════════

drop policy if exists chat_broadcast_read on realtime.messages;
create policy chat_broadcast_read on realtime.messages for select to authenticated
using (
  -- 대소문자를 가리지 않는다: 클라이언트가 주제 이름을 만들 때 표기가 갈릴 수 있고,
  -- 그때 갈리는 것이 인가여서는 안 된다(형변환은 둘 다 받는다).
  realtime.topic() ~* '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and private.is_chat_member(
        substring(realtime.topic() from 6)::uuid,
        (select auth.uid())
      )
);

comment on policy chat_broadcast_read on realtime.messages is
  'INV-P8 의 강제 위치(실시간). 주제 이름의 모양을 먼저 보고 나서 형변환한다 — 전에는 대시 36개도 통과했다.';
