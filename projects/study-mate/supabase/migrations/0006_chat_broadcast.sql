-- ═════════════════════════════════════════════════════════════════════════
-- 0006 — 실시간 대화를 브로드캐스트로 옮긴다
--
-- 0005 는 `chat_messages` 를 발행 목록에 넣어 "테이블 변경 구독"으로 실시간을 만들려 했다.
-- **채널은 「연결됨」이라고 답하는데 메시지가 하나도 안 왔다** — 오류도 안 나서 화면만
-- 보고는 멀쩡해 보였다. 이 Supabase 의 실시간 서버는 복제를 `realtime.messages` 하나에만
-- 걸고 있고(로그가 그렇게 말한다), 테이블 변경 구독 쪽은 그 경로를 안 탄다.
--
-- 그래서 **데이터베이스가 직접 방송한다.** 메시지가 들어오면 트리거가 그 방의 주제로
-- 한 건을 쏘고, 화면은 그 주제를 구독한다. 누가 그 주제를 들을 수 있는지는 여전히
-- 행 수준 접근 정책이 정한다 — 아래 `realtime.messages` 정책이 그 자리다.
-- ═════════════════════════════════════════════════════════════════════════

-- 테이블 변경 구독은 이 설치에서 동작하지 않으므로 발행 목록에서 뺀다.
-- 남겨 두면 "실시간이 켜져 있다"고 읽히는데 실제로는 아무것도 안 온다.
do $unpublish$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime drop table public.chat_messages;
  end if;
end;
$unpublish$;

-- ─────────────────────────────────────────────────────────────────────────
-- 방마다 주제 하나. 주제 이름은 `chat:<방 id>` 다.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.broadcast_chat_message() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform realtime.broadcast_changes(
    'chat:' || new.chat_id::text,  -- 주제
    'new_message',                 -- 사건 이름
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    null,
    'ROW'
  );
  return null;
end;
$fn$;

drop trigger if exists chat_messages_broadcast on public.chat_messages;
create trigger chat_messages_broadcast
  after insert on public.chat_messages
  for each row execute function public.broadcast_chat_message();

-- ─────────────────────────────────────────────────────────────────────────
-- 누가 그 주제를 들을 수 있나 — INV-P8 과 같은 판정이다
-- ─────────────────────────────────────────────────────────────────────────
-- 방송이 접근 정책을 우회하면 강퇴된 사람이 대화를 계속 듣는다. 여기서 같은 함수로
-- 판정하므로, 강퇴되는 순간 채팅 구성원에서 빠지고(0002 의 sync_study_chat) 방송도 끊긴다.
--
-- 주제 이름이 `chat:<uuid>` 모양이 아니면 아예 거부한다 — 모양을 확인하지 않고 형변환하면
-- 아무 주제나 구독하는 요청이 오류를 내면서 정책 판정을 흔든다.
drop policy if exists chat_broadcast_read on realtime.messages;
create policy chat_broadcast_read on realtime.messages for select to authenticated
using (
  realtime.topic() ~ '^chat:[0-9a-fA-F-]{36}$'
  and public.is_chat_member(
        substring(realtime.topic() from 6)::uuid,
        (select auth.uid())
      )
);
