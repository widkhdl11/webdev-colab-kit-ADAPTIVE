-- ═════════════════════════════════════════════════════════════════════════
-- 0005 — 그룹 채팅을 실시간으로
--
-- 메시지가 실시간으로 오려면 그 테이블이 발행 목록에 있어야 한다. 없으면 화면은
-- 조용히 아무것도 못 받고, **증상이 "대화가 안 온다"가 아니라 "새로고침해야 보인다"**라
-- 원인을 찾는 데 오래 걸린다.
--
-- 발행은 행 수준 접근 정책을 우회하지 않는다 — 받는 쪽 연결의 권한으로 다시 판정되므로,
-- 멤버가 아닌 사람에게는 애초에 오지 않는다(messages_read_member).
-- ═════════════════════════════════════════════════════════════════════════

do $publish$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$publish$;

-- 「안 읽은 메시지」는 저장하지 않는다 — 마지막으로 읽은 시각 하나에서 파생된다(D1과 같은 결).
-- 방마다 세는 질의가 채팅방 목록의 기본 동작이라 인덱스를 맞춰 둔다.
create index if not exists chat_messages_chat_created_idx
  on public.chat_messages (chat_id, created_at);
