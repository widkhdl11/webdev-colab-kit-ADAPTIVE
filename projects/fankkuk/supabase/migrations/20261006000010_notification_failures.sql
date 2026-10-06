-- 알림 — 운영자 실패 목록 (docs/specs/notifications.md INV-N10).
--
-- 발송 기록 표는 화면 쪽 키로 읽을 수 없다(20261006000009). 운영자는 이 함수 하나로만, 보내지 못한 줄(실패·건너뜀)을
-- 종류·주문번호·차례·통로·상태·시도 횟수·오류 코드·끝난 시각으로 본다. 받는 계정·연락처·본문은 돌려주지 않는다 —
-- 표에 연락처·본문 칸은 처음부터 없고, 받는 계정 ID 도 이 목록에는 내보내지 않는다(누구에게 못 갔는지는 주문 화면에서 본다).
-- 운영자(대표·직원)가 아니면 거부한다. 앱 서버 키도 거부한다 — 운영자 세션으로만 부른다.

create function public.notification_failures(p_limit integer default 100)
returns table (
  kind text,
  order_no text,
  round smallint,
  channel text,
  status text,
  attempts integer,
  error_code text,
  finished_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.is_operator(), false) then
    raise exception '운영자만 볼 수 있다' using errcode = '42501';
  end if;
  return query
  select n.kind, o.order_no, n.round, n.channel, n.status, n.attempts, n.error_code, n.finished_at
  from public.notification_outbox n
  join public.orders o on o.id = n.order_id
  where n.status in ('failed', 'skipped')
  order by n.finished_at desc, n.id
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end $$;

revoke all on function public.notification_failures(integer) from public, anon, service_role;
grant execute on function public.notification_failures(integer) to authenticated;
