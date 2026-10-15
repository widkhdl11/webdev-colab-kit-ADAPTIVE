-- 가입 닉네임 리뷰 반영 (2026-10-15): 크리에이터 이름 자리는 공개 이름(creators.name) · 미리 확인은 형식 검사가 한도보다 먼저.
--
-- A. 크리에이터를 남에게 보여 줄 때는 공개 이름을 쓴다.
-- 20261015000001 부터 크리에이터 닉네임(profiles.nickname)은 가입 때 적은 값 그대로이고 공개 이름과 다를 수 있다(signup INV-U13).
-- 그 전에는 닉네임이 늘 공개 이름과 같아서, 크리에이터 이름 자리에 닉네임을 읽어도 같은 글자가 나왔다. 이제는 아니다.
-- 로컬 DB 의 살아 있는 함수를 전부 훑어(profiles.nickname 을 읽는 함수 40개) 크리에이터 이름 자리에 닉네임을 쓰던 곳만 고친다.
--
-- 1) my_received_revgifts — 팬이 받은 역조공 목록의 creator_name. 보낸 크리에이터의 공개 이름.
-- 2) admin_review_payments — 운영자 「확인 필요」 결제 목록에서 역조공을 낸 사람(payer_nickname). 공개 이름, 크리에이터 줄이 없으면 닉네임.
--    팬 선물 쪽 결제자는 팬이라 닉네임 그대로다.
--
-- 고치지 않은 것(이유):
--   admin_payment_rows — 20261015000003_virtual_account_flow.sql 이 이미 coalesce(cr.name, cp.nickname) 로 다시 정의한다(무통장 입금 작업).
--   notification_claim · my_account · my_profile · issue_email_verification · request_password_reset — 받는 사람 본인을 부르는 닉네임이다.
--   admin_creator_verifications · admin_creators — 공개 이름(c.name)과 계정 닉네임을 따로 보여 준다.
--
-- B. signup_name_check — 형식이 틀린 값은 한도와 상관없이 invalid 다(signup INV-U14 2026-10-15 추가 줄). 형식 검사를 횟수 세기 앞으로 옮겨,
--    쉬는 중에도 invalid 로 답하고 횟수에도 넣지 않는다. 형식이 틀린 값은 계정 표를 찾지 않으니 긁는 데 쓸 수 없다. 나머지는 20261015000001 그대로.
--
-- 고치지 않고 남긴 중복(리뷰 low 7): 팬덤 이름 검사 블록이 create_creator_account·update_my_creator_profile 에 하나씩,
--   보이지 않는 글자 목록이 nickname_problem·두 함수에 하나씩 있다. 공용 함수로 빼려면 두 함수를 통째로 다시 정의해야 해서
--   마이그레이션 파일에 세 번째 사본이 생긴다 — 다음에 두 함수를 다른 이유로 고칠 때 같이 뺀다.
--
-- 운영 적용 순서: 20261015000001 뒤 아무 때나(앱 배포와 무관 — 함수 이름·인자·돌려주는 칸은 그대로다). 다시 적용해도 결과가 같다.

-- ── A1) 팬이 받은 역조공 ──────────────────────────────────

create or replace function public.my_received_revgifts()
returns table (order_no text, creator_name text, tier public.parcel_tier, reply text, deadline timestamptz, shipped boolean, returned boolean, cancelled boolean)
language sql
stable
security definer
set search_path = ''
as $fn$
  select s.order_no, coalesce(cr.name, cp.nickname), s.tier, s.reply, public.revgift_deadline(d.settled_at),
         s.shipped_at is not null, s.returned_at is not null, s.cancelled_at is not null
  from public.revgift_shares s
  join public.revgift_sends d on d.id = s.send_id
  join public.profiles cp on cp.id = d.sender_id
  left join public.creators cr on cr.profile_id = d.sender_id
  where s.fan_id = auth.uid() and d.status = 'done'
  order by d.settled_at desc;
$fn$;

revoke all on function public.my_received_revgifts() from public, anon;
grant execute on function public.my_received_revgifts() to authenticated, service_role;

-- ── A2) 운영자 「확인 필요」 결제 ──────────────────────────────────

create or replace function public.admin_review_payments()
returns table (source text, toss_order_id text, order_no text, payer_nickname text, amount_krw integer, balance_krw integer, review_at timestamptz,
               cancel_status text, cancel_error text, cancel_attempts integer, cancel_requested_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
begin
  if not public.is_operator() then
    raise exception '운영자만 읽는다' using errcode = '42501';
  end if;
  return query
  with rows as (
    select p.kind as source, p.toss_order_id, o.order_no, fp.nickname as payer_nickname, p.amount_krw, p.review_balance_krw as balance_krw, p.review_at
    from public.payments p
    join public.orders o on o.id = p.order_id
    join public.profiles fp on fp.id = o.fan_id
    where p.status = 'confirming' and p.review_at is not null
    union all
    -- 역조공을 낸 사람은 크리에이터 — 공개 이름으로 보인다
    select 'revgift', d.toss_order_id,
           (select string_agg(s.order_no, ', ' order by s.order_no) from public.revgift_shares s where s.send_id = d.id),
           coalesce(cr.name, cp.nickname), d.amount_krw, d.review_balance_krw, d.review_at
    from public.revgift_sends d
    join public.profiles cp on cp.id = d.sender_id
    left join public.creators cr on cr.profile_id = d.sender_id
    where d.status = 'confirming' and d.review_at is not null
  )
  select r.source, r.toss_order_id, r.order_no, r.payer_nickname, r.amount_krw, r.balance_krw, r.review_at,
         coalesce(c.status, 'none'), c.last_error, coalesce(c.attempts, 0), c.requested_at
  from rows r
  left join public.review_cancels c on c.toss_order_id = r.toss_order_id
  order by r.review_at desc
  limit 200;
end $fn$;

revoke all on function public.admin_review_payments() from public, anon;
grant execute on function public.admin_review_payments() to authenticated, service_role;

-- ── B) 미리 확인 — 형식 먼저 ──────────────────────────────────

create or replace function public.signup_name_check(p_ip_hash text, p_kind text, p_value text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_value text := btrim(coalesce(p_value, ''));
  v_row public.signup_check_hits;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception '접속 주소는 64자리 해시로만 받는다' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('login_id', 'nickname') then
    raise exception '확인 종류는 login_id·nickname 이다' using errcode = '22023';
  end if;

  -- 형식이 틀린 값은 한도와 상관없이 invalid — 계정 표를 찾지 않고 횟수에도 넣지 않는다
  if p_kind = 'login_id' and v_value !~ '^[a-z0-9_]{4,20}$' then -- 가입 아이디 꼴(INV-U6)과 같다
    return 'invalid';
  end if;
  if p_kind = 'nickname' and public.nickname_problem(v_value) is not null then
    return 'invalid';
  end if;

  -- 10분 넘게 조용하고 쉬는 중이 아닌 주소의 줄은 지운다 — 해시도 오래 남기지 않는다
  delete from public.signup_check_hits h
  where h.touched_at < now() - interval '10 minutes' and (h.blocked_until is null or h.blocked_until < now());

  -- 같은 주소의 확인은 이 줄에서 차례로 지나간다(동시에 와도 한도를 넘지 않게)
  insert into public.signup_check_hits (ip_hash) values (p_ip_hash) on conflict (ip_hash) do nothing;
  select * into v_row from public.signup_check_hits h where h.ip_hash = p_ip_hash for update;

  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    update public.signup_check_hits h set touched_at = now() where h.ip_hash = p_ip_hash;
    return 'rate_limited';
  end if;
  if v_row.window_started_at <= now() - interval '1 minute' then
    v_row.window_started_at := now();
    v_row.hits := 0;
  end if;
  v_row.hits := v_row.hits + 1;
  if v_row.hits > 30 then
    update public.signup_check_hits h
    set window_started_at = v_row.window_started_at, hits = v_row.hits, blocked_until = now() + interval '1 minute', touched_at = now()
    where h.ip_hash = p_ip_hash;
    return 'rate_limited';
  end if;
  update public.signup_check_hits h
  set window_started_at = v_row.window_started_at, hits = v_row.hits, blocked_until = null, touched_at = now()
  where h.ip_hash = p_ip_hash;

  if p_kind = 'login_id' then
    return case when exists (select 1 from public.profiles p where p.login_id = v_value) then 'taken' else 'available' end;
  end if;
  return case when exists (select 1 from public.profiles p where lower(btrim(p.nickname)) = lower(v_value)) then 'taken' else 'available' end;
end $fn$;

revoke all on function public.signup_name_check(text, text, text) from public, anon, authenticated;
grant execute on function public.signup_name_check(text, text, text) to service_role;

notify pgrst, 'reload schema';
