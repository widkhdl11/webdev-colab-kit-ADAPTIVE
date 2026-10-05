-- 송장이 안 나온 출력 시도를 돌려준다 — 결정 카드 fankkuk-20261001-1-d31. address-protection INV-P15, INV-P5(횟수 = 연 줄 − 돌려준 줄), INV-P7.
--
-- 주소를 연 뒤 송장이 나오기 전에 출력이 실패하면(봉투 열기 실패·키 풀기 실패·송장 마무리 실패) 그 시도가 상자의 3회를 깎았다.
-- 일시 장애 세 번이면 그 상자는 송장을 뽑을 수 없어 출고가 막힌다. 이제 출력 함수가 그 「연 줄」을 돌려받는다.
--
-- 1) 돌려줌은 열람 기록 표(decrypt_log)에 새 결과 값으로 넣지 않고 따로 둔 표(decrypt_releases)에 남긴다. 원래 연 줄은 그대로다(INV-P7).
--    이 표에 직접 넣고·고치고·지우는 권한은 아무에게도 없다 — 돌려주기 함수(소유자 권한으로 실행)만 넣는다. 고치기·지우기는 트리거가 막는다.
-- 2) 복호화 전용 역할이 기록 표에 직접 넣을 수 있는 줄을 거부 줄로 좁힌다(INV-P15 (a)). 연 줄은 주소를 내주는 함수만 넣는다.
--    (앱의 거부 기록 — 판정 거부·봉인 속 크리에이터 불일치 — 은 지금처럼 직접 넣는다.)
-- 3) invoice_release_print: 상자·주문을 잠근 자리에서 (b)~(e)를 보고 돌려준다. pii 를 읽지 않으므로 이 파일에 둔다.
-- 4) 판정 재료(invoice_print_context)의 횟수 = 그 상자 연 줄 − 그 상자 돌려준 줄.
-- 5) 크리에이터 열람 기록: 돌려준 줄은 released = true 로 내준다(화면에 「출력 실패」). 이번 달 재출력 수에서 뺀다.
-- 주소를 내주는 함수(invoice_claim_print)의 횟수와 연 줄 id 반환은 pii 를 읽으므로 manual/0010_print_release.sql(사람이 적용).
--
-- 한쪽만 적용된 상태:
--   · 이 파일만 → 주소를 내주는 함수는 연 줄 id 를 돌려주지 않아 앱이 돌려주기를 부르지 않는다 — 출력은 지금과 같다.
--     그 함수는 여전히 연 줄 전부를 세므로 상한은 지금처럼 3이다. 판정 재료는 돌려준 줄을 빼지만 돌려준 줄이 생기지 않는다
--     (돌려주기 함수를 직접 불러 줄을 만들어도 상한을 지키는 쪽은 주소를 내주는 함수다 — 판정 재료가 더 적게 세면 그 함수가 거부한다).
--   · manual/0010 만 → 그 파일이 처음에 돌려줌 표가 있는지 보고 없으면 멈춘다(아무것도 안 바뀜).

-- ── 1) 돌려줌 표 ─────────────────────────────────────────

create table public.decrypt_releases (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  -- (b) 연 줄 하나는 한 번만 돌려준다
  opened_log_id bigint not null unique references public.decrypt_log (id),
  box_id uuid not null references public.boxes (id),
  requester_id uuid not null
);
create index decrypt_releases_box on public.decrypt_releases (box_id);

alter table public.decrypt_releases enable row level security;
-- 정책이 없으므로 RLS 를 따르는 역할은 아무 줄도 넣거나 읽지 못한다. 권한도 걷는다(Supabase 기본값은 service_role 에 전부를 준다).
revoke all on public.decrypt_releases from public, anon, authenticated, service_role, address_decryptor;

create function public.decrypt_releases_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'decrypt_releases 는 고치거나 지울 수 없다 (INV-P15·P7)' using errcode = '42501';
end $$;

create trigger decrypt_releases_no_update before update or delete on public.decrypt_releases
  for each row execute function public.decrypt_releases_append_only();
create trigger decrypt_releases_no_truncate before truncate on public.decrypt_releases
  for each statement execute function public.decrypt_releases_append_only();

-- ── 2) 기록 표 직접 넣기는 거부 줄만 ─────────────────────

drop policy decrypt_log_append on public.decrypt_log;
create policy decrypt_log_append on public.decrypt_log for insert to address_decryptor with check (result = 'denied');

-- ── 3) 돌려주기 ─────────────────────────────────────────

-- 돌려받을 연 줄 id 와 요청자를 받는다. 결과 {result: released} | {result: denied, reason}.
-- 거부 사유: not_opened(연 줄이 아님·없음) · already_released(b) · not_latest·not_requester(c) · not_inspected(d) · release_limit_reached(e).
create function public.invoice_release_print(p_log_id bigint, p_requester uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_log public.decrypt_log;
  v_qr text;
  v public.office_parcels;
  v_reason text;
begin
  if p_log_id is null or p_requester is null then
    raise exception '돌려줄 줄과 요청자가 있어야 한다' using errcode = '22023';
  end if;
  -- 기록 줄은 고칠 수 없으므로 잠그기 전에 읽어도 바뀌지 않는다
  select * into v_log from public.decrypt_log where id = p_log_id;
  if v_log.id is null or v_log.result <> 'opened' or v_log.box_id is null then
    return jsonb_build_object('result', 'denied', 'reason', 'not_opened');
  end if;

  -- 잠금 순서는 주소를 내주는 함수와 같다 — 상자(office_lock_qr) 다음 주문
  select p.qr_code into v_qr from public.office_parcels p where p.box_id = v_log.box_id;
  if v_qr is null then
    return jsonb_build_object('result', 'denied', 'reason', 'not_opened');
  end if;
  v := public.office_lock_qr(v_qr);
  perform 1 from public.orders o join public.boxes b on b.order_id = o.id where b.id = v.box_id for update of o;

  if exists (select 1 from public.decrypt_releases r where r.opened_log_id = v_log.id) then
    v_reason := 'already_released';                                                                  -- (b)
  elsif v_log.id <> (select max(l.id) from public.decrypt_log l where l.box_id = v.box_id and l.result = 'opened') then
    v_reason := 'not_latest';                                                                        -- (c)
  elsif v_log.requester_id <> p_requester then
    v_reason := 'not_requester';                                                                     -- (c)
  elsif v.state <> 'inspected' then
    v_reason := 'not_inspected';                                                                     -- (d)
  elsif (select count(*) from public.decrypt_releases r where r.box_id = v.box_id) >= 2 then
    v_reason := 'release_limit_reached';                                                             -- (e)
  end if;
  if v_reason is not null then
    return jsonb_build_object('result', 'denied', 'reason', v_reason);
  end if;

  insert into public.decrypt_releases (opened_log_id, box_id, requester_id) values (v_log.id, v.box_id, p_requester);
  return jsonb_build_object('result', 'released');
end $$;

revoke all on function public.invoice_release_print(bigint, uuid) from public, anon, authenticated, service_role;
grant execute on function public.invoice_release_print(bigint, uuid) to address_decryptor;

-- ── 4) 판정 재료의 횟수 ─────────────────────────────────

create or replace function public.invoice_print_context(p_qr text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v public.office_parcels;
  r jsonb;
begin
  if p_qr is null or p_qr !~ '^Q-[0-9]{6}$' then
    raise exception 'QR 꼴이 아니다' using errcode = '22023';
  end if;
  select * into v from public.office_parcels where qr_code = p_qr;
  if v.id is null then
    return null;
  end if;
  if v.box_id is null then
    return jsonb_build_object('kind', 'share');
  end if;
  select jsonb_build_object(
    'kind', 'gift',
    'order_id', o.id,
    'box_id', b.id,
    'order_no', o.order_no,
    'order_status', o.status,
    'parcel_state', v.state,
    'creator_profile_id', c.profile_id,
    'difference_unpaid', exists (select 1 from public.payments d where d.order_id = o.id and d.kind = 'difference' and d.status <> 'done'),
    -- INV-P5: 이 상자에서 주소를 연 횟수 = 연 줄 − 돌려준 줄(INV-P15)
    'decrypt_count', (select count(*) from public.decrypt_log l where l.box_id = b.id and l.result = 'opened')
                   - (select count(*) from public.decrypt_releases r where r.box_id = b.id),
    'stored_payload', q.payload,
    'signed_content', s.signed_content,
    'signer_id', s.signer_id,
    'signer_method', s.method
  ) into r
  from public.boxes b
  join public.orders o on o.id = b.order_id
  join public.creators c on c.id = o.creator_id
  left join public.approval_requests q on q.order_id = o.id and q.status = 'approved'
  left join public.approval_signatures s on s.request_id = q.request_id
  where b.id = v.box_id;
  return r;
end $$;

-- ── 5) 크리에이터 열람 기록 ─────────────────────────────

-- 돌려준 줄은 released = true(화면에 「출력 실패」). 반환 칸이 늘어 다시 만든다 — 권한도 다시 준다.
drop function public.my_access_log(integer);

create function public.my_access_log(p_limit integer default null)
returns table (
  at timestamptz,
  order_no text,
  result text,
  print_no smallint,
  deny_reason text,
  requester text,
  released boolean
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is not null and (p_limit < 1 or p_limit > 100) then
    raise exception '읽을 줄 수는 1~100 이다' using errcode = '22023';
  end if;
  return query
  select l.at, o.order_no, l.result, l.print_no, l.deny_reason,
         case when l.deny_reason = 'not_owner' then 'other' else 'owner' end,
         exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id)
  from public.decrypt_log l
  join public.orders o on o.id = l.order_id
  join public.creators c on c.id = o.creator_id
  where c.profile_id = auth.uid()
  order by l.at desc, l.id desc
  limit p_limit; -- null 이면 제한 없음
end $$;

revoke all on function public.my_access_log(integer) from public, anon;
grant execute on function public.my_access_log(integer) to authenticated;

-- 이번 달 숫자: 돌려준 줄은 열림으로는 세고(주소는 열렸다) 재출력으로는 세지 않는다(송장이 안 나왔다).
create or replace function public.my_access_month_summary()
returns table (approved_count integer, opened_count integer, reprint_count integer, denied_count integer)
language sql stable security definer set search_path = ''
as $$
  with m as (
    select (t.start at time zone 'Asia/Seoul') as since,
           ((t.start + interval '1 month') at time zone 'Asia/Seoul') as until
    from (select date_trunc('month', now() at time zone 'Asia/Seoul') as start) t
  ),
  mine as (
    select o.id, o.approved_at
    from public.orders o
    join public.creators c on c.id = o.creator_id
    where c.profile_id = auth.uid()
  ),
  logs as (
    select l.result, l.print_no, exists (select 1 from public.decrypt_releases r where r.opened_log_id = l.id) as released
    from public.decrypt_log l
    join mine on mine.id = l.order_id
    cross join m
    where l.at >= m.since and l.at < m.until
  )
  select
    (select count(*) from mine cross join m where mine.approved_at >= m.since and mine.approved_at < m.until)::integer,
    (select count(*) from logs where logs.result = 'opened')::integer,
    (select count(*) from logs where logs.result = 'opened' and logs.print_no >= 2 and not logs.released)::integer,
    (select count(*) from logs where logs.result = 'denied')::integer;
$$;

notify pgrst, 'reload schema';
