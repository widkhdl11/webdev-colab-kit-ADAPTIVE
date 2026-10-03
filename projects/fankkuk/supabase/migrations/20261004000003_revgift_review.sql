-- 역조공 리뷰 반영(2026-10-03). 스펙: docs/specs/reverse-gift.md
-- - 받지 않기: 반송·취소된 몫은 거부(환불 경로가 둘이 되지 않게)
-- - 크리에이터 목록: 기한이 지났는데 기한 처리 전인 「기다리는 중」도 「받지 않았어요」로(INV-R8·R10)
-- - 팬 목록: 반송과 취소를 나눠 돌려준다 · 받기 화면용 한 줄 읽기
-- - 기한 처리: 서버 시각보다 미래의 기준 시각으로 앞당기지 않는다(INV-R10 「서버 시각 기준」)
-- - 팬 찾기: 크리에이터마다 10분에 30번까지(INV-R2 — 아이디를 대량으로 넣어 팔로워를 모으는 길을 좁힌다)

-- ── 받지 않기 ───────────────────────────────────────────

create or replace function public.decline_revgift(p_order_no text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_share public.revgift_shares;
  v_send public.revgift_sends;
begin
  select * into v_share from public.revgift_shares where order_no = p_order_no for update;
  if not found or v_share.fan_id is distinct from auth.uid() then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  select * into v_send from public.revgift_sends where id = v_share.send_id;
  if v_send.status <> 'done' then
    raise exception '몫을 찾을 수 없다' using errcode = 'P0002';
  end if;
  if v_share.reply <> 'waiting'
     or v_share.returned_at is not null or v_share.cancelled_at is not null
     or now() >= public.revgift_deadline(v_send.settled_at) then
    raise exception '지금은 받지 않기를 할 수 없다' using errcode = 'P0022';
  end if;
  update public.revgift_shares set reply = 'declined', replied_at = now() where id = v_share.id;
end $$;

-- ── 기한 처리 ───────────────────────────────────────────

create or replace function public.expire_revgifts(p_now timestamptz default now())
returns integer
language sql security definer set search_path = ''
as $$
  with clock as (select least(p_now, now()) as at),
  expired as (
    update public.revgift_shares s
    set reply = 'expired', replied_at = (select at from clock)
    from public.revgift_sends d
    where d.id = s.send_id
      and d.status = 'done'
      and s.reply = 'waiting'
      and (select at from clock) >= public.revgift_deadline(d.settled_at)
    returning 1
  )
  select count(*)::integer from expired;
$$;

-- ── 크리에이터 목록(INV-R8) ─────────────────────────────

create or replace function public.my_sent_revgifts()
returns table (order_no text, sent_at timestamptz, fan_login_id text, fan_nickname text, tier public.parcel_tier, state text)
language sql stable security definer set search_path = ''
as $$
  select s.order_no, d.settled_at, p.login_id, p.nickname, s.tier,
         case
           when s.reply = 'accepted' then 'accepted'
           when s.reply = 'waiting' and now() < public.revgift_deadline(d.settled_at) then 'waiting'
           else 'not_received'
         end
  from public.revgift_sends d
  join public.revgift_shares s on s.send_id = d.id
  join public.profiles p on p.id = s.fan_id
  where d.sender_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc, s.seq;
$$;

-- ── 팬 목록 · 한 줄 ─────────────────────────────────────

drop function public.my_received_revgifts();

create function public.my_received_revgifts()
returns table (
  order_no text, creator_name text, tier public.parcel_tier, reply text, deadline timestamptz,
  shipped boolean, returned boolean, cancelled boolean
)
language sql stable security definer set search_path = ''
as $$
  select s.order_no, cp.nickname, s.tier, s.reply, public.revgift_deadline(d.settled_at),
         s.shipped_at is not null, s.returned_at is not null, s.cancelled_at is not null
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  join public.profiles cp on cp.id = d.sender_id
  where s.fan_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc;
$$;

create function public.my_received_revgift(p_order_no text)
returns table (
  order_no text, creator_name text, tier public.parcel_tier, reply text, deadline timestamptz,
  shipped boolean, returned boolean, cancelled boolean
)
language sql stable security definer set search_path = ''
as $$
  select r.* from public.my_received_revgifts() r where r.order_no = p_order_no;
$$;

-- ── 팬 찾기 횟수 제한(INV-R2) ───────────────────────────

create table public.revgift_fan_lookups (
  creator_profile_id uuid not null references public.profiles (id) on delete cascade,
  at timestamptz not null default now()
);
create index revgift_fan_lookups_idx on public.revgift_fan_lookups (creator_profile_id, at);
alter table public.revgift_fan_lookups enable row level security;

drop function public.find_revgift_fan(text);

create function public.find_revgift_fan(p_login_id text)
returns table (fan_id uuid, login_id text, nickname text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- 크리에이터가 아니면 기록하지 않고 빈 결과(찾을 것이 없다)
  if v_uid is null or not exists (
    select 1 from public.profiles me join public.creators c on c.profile_id = me.id
    where me.id = v_uid and me.role = 'creator'
  ) then
    return;
  end if;
  -- 같은 크리에이터의 찾기가 동시에 와도 한도를 넘지 않게 그 사람 단위로 줄을 세운다
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  if (select count(*) from public.revgift_fan_lookups l
      where l.creator_profile_id = v_uid and l.at > now() - interval '10 minutes') >= 30 then
    raise exception '잠시 뒤에 다시 찾아 주세요' using errcode = 'P0029';
  end if;
  insert into public.revgift_fan_lookups (creator_profile_id) values (v_uid);

  return query
  select p.id, p.login_id, p.nickname
  from public.profiles p
  join public.follows f on f.fan_id = p.id
  join public.creators c on c.id = f.creator_id
  where p.login_id = p_login_id
    and p.role = 'fan'
    and c.profile_id = v_uid;
end $$;

revoke all on function public.find_revgift_fan(text) from public, anon;
grant execute on function public.find_revgift_fan(text) to authenticated;
revoke all on function public.my_received_revgifts() from public, anon;
grant execute on function public.my_received_revgifts() to authenticated;
revoke all on function public.my_received_revgift(text) from public, anon;
grant execute on function public.my_received_revgift(text) to authenticated;
