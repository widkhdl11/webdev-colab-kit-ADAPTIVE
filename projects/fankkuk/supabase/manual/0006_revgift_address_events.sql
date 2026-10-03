-- 역조공 팬 주소를 지운 기록(reverse-gift INV-R9 「지운 사실은 열람 기록처럼 남지만 주소 값은 남지 않는다」).
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md). 0005_revgift_address.sql 다음에 적용한다.
--
-- 적용(로컬, PowerShell):
--   Get-Content projects/fankkuk/supabase/manual/0006_revgift_address_events.sql -Raw -Encoding utf8 | docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1
--
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 기록 표에는 몫·사건·결과·시각만 있다. 주소·이름·전화 칸은 없다.
create table public.revgift_address_events (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.revgift_shares (id) on delete cascade,
  event text not null check (event in ('deleted')),
  outcome text not null check (outcome in ('shipped', 'returned', 'cancelled')),
  at timestamptz not null default now()
);
alter table public.revgift_address_events enable row level security;

-- 추가만 된다 — 고치거나 지우지 못한다(몫이 통째로 지워질 때의 연쇄 삭제는 예외).
create function public.revgift_address_events_append_only()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '주소 기록은 고치거나 지울 수 없다' using errcode = '42501';
end $$;

create trigger revgift_address_events_no_update before update on public.revgift_address_events
for each row execute function public.revgift_address_events_append_only();

-- 몫 닫기: 상태를 바꾸는 같은 처리 안에서 주소를 지우고, 지운 사실을 한 줄 남긴다.
create or replace function public.close_revgift_share(p_order_no text, p_outcome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_deleted integer;
begin
  if p_outcome not in ('shipped', 'returned', 'cancelled') then
    raise exception 'shipped·returned·cancelled 만' using errcode = '22023';
  end if;
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.shipped_at is not null or v_share.returned_at is not null or v_share.cancelled_at is not null then
    raise exception '이미 닫힌 몫이다' using errcode = 'P0022';
  end if;

  if p_outcome = 'shipped' then
    if v_share.reply <> 'accepted' or v_share.inspected_at is null then
      raise exception '받기와 검수가 끝난 몫만 출고한다' using errcode = 'P0022';
    end if;
    update public.revgift_shares set shipped_at = now() where id = v_share.id;
  elsif p_outcome = 'returned' then
    update public.revgift_shares set returned_at = now() where id = v_share.id;
  else
    update public.revgift_shares set cancelled_at = now() where id = v_share.id;
  end if;

  delete from pii.revgift_addresses where share_id = v_share.id;
  get diagnostics v_deleted = row_count;
  if v_deleted > 0 then
    insert into public.revgift_address_events (share_id, event, outcome) values (v_share.id, 'deleted', p_outcome);
  end if;
end $$;

revoke all on function public.revgift_address_events_append_only() from public, anon, authenticated;
revoke all on function public.close_revgift_share(text, text) from public, anon, authenticated;
grant execute on function public.close_revgift_share(text, text) to service_role;

commit;
