-- 1:1 문의 제한 (admin-console INV-K12, DECISIONS 2026-10-08 — 정책 질문 ⑧).
-- 보내는 횟수에는 상한이 없다. 대신 대표가 운영자 문의 목록의 문의로 그 문의를 쓴 계정을 「문의 제한」으로 바꾼다.
-- - 제한된 계정은 새 문의를 남길 수 없다(create_inquiry 가 거부, P0051). 지난 문의 읽기·답 전 고치기는 그대로.
-- - 제한·풀기는 대표만(is_owner), 사유 1~200자, 할 때마다 기록 한 줄(추가만). 운영자 계정은 제한하지 않는다.
-- - 화면은 계정 ID 를 보내지 않는다 — 문의 ID 로 고르고 DB 가 그 문의의 쓴 사람을 찾는다.
-- - 이미 그 상태면 거부(55000), 기록도 남지 않는다. 동시에 두 번 눌러도 지금 상태 표의 기본키가 하나만 받는다.
--
-- 오류 꼴: 42501 권한 없음 · 22023 사유 꼴 · P0002 대상 없음 · 55000 이미 그 상태 · P0051 문의가 제한된 계정 · P0052 운영자 계정이라 제한 안 함

-- ── 지금 상태 · 기록 ─────────────────────────────────────

create table public.inquiry_restrictions (
  account_id uuid primary key references public.profiles (id) on delete cascade,
  restricted_by uuid not null references public.profiles (id),
  restricted_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 1 and 200)
);
alter table public.inquiry_restrictions enable row level security;
revoke all on public.inquiry_restrictions from public, anon, authenticated;

create table public.inquiry_restriction_events (
  id bigint generated always as identity primary key,
  account_id uuid not null references public.profiles (id) on delete cascade,
  restricted boolean not null,
  reason text not null check (char_length(reason) between 1 and 200),
  acted_by uuid not null references public.profiles (id),
  at timestamptz not null default now()
);
create index inquiry_restriction_events_account_idx on public.inquiry_restriction_events (account_id, at desc);
alter table public.inquiry_restriction_events enable row level security;
revoke all on public.inquiry_restriction_events from public, anon, authenticated;
create trigger inquiry_restriction_events_no_update before update on public.inquiry_restriction_events
  for each row execute function public.append_only_log();
create trigger inquiry_restriction_events_no_delete before delete on public.inquiry_restriction_events
  for each row execute function public.append_only_log();

-- ── 제한 · 풀기 (대표만) ─────────────────────────────────

create function public.admin_set_inquiry_restriction(p_inquiry_id uuid, p_restricted boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_author uuid;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception '대표만 문의를 제한한다' using errcode = '42501';
  end if;
  if p_restricted is null or char_length(v_reason) not between 1 and 200 then
    raise exception '사유는 1~200자다' using errcode = '22023';
  end if;
  select q.author_id into v_author from public.inquiries q where q.id = p_inquiry_id;
  if v_author is null then
    raise exception '없는 문의다' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_author and p.role = 'operator') then
    raise exception '운영자 계정은 제한하지 않는다' using errcode = 'P0052';
  end if;

  if p_restricted then
    insert into public.inquiry_restrictions (account_id, restricted_by, reason)
    values (v_author, auth.uid(), v_reason)
    on conflict (account_id) do nothing;
  else
    delete from public.inquiry_restrictions r where r.account_id = v_author;
  end if;
  if not found then
    raise exception '이미 그 상태다' using errcode = '55000';
  end if;

  insert into public.inquiry_restriction_events (account_id, restricted, reason, acted_by)
  values (v_author, p_restricted, v_reason, auth.uid());
end $$;

-- ── 내 계정이 제한 중인가 (고객센터 양식을 그릴 때) ──────────

create function public.my_inquiry_restricted()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.inquiry_restrictions r where r.account_id = auth.uid());
$$;

-- ── 문의 남기기: 제한 확인을 더한다 (20261005000008 과 같고, 로그인 확인 바로 뒤에 한 줄) ──

create or replace function public.create_inquiry(p_kind text, p_title text, p_body text, p_order_no text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_order_no text;
  c record;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if exists (select 1 from public.inquiry_restrictions r where r.account_id = v_uid) then
    raise exception '문의가 제한된 계정이다' using errcode = 'P0051';
  end if;
  if p_kind is null or p_kind not in ('gift', 'fee', 'shipping', 'creator', 'account', 'etc') then
    raise exception '분류는 여섯 가지 중 하나다' using errcode = '22023';
  end if;
  select * into c from public.inquiry_checked(p_title, p_body);
  v_order_no := public.inquiry_order_no_checked(p_order_no);
  insert into public.inquiries (author_id, kind, title, body, order_no)
  values (v_uid, p_kind, c.title, c.body, v_order_no)
  returning id into v_id;
  return v_id;
end $$;

-- ── 운영자 문의 목록: 쓴 사람의 제한 여부·사유 두 칸 (반환 칸이 늘어 지우고 다시 만든다) ──

drop function public.admin_inquiries();

create function public.admin_inquiries()
returns table (
  id uuid, kind text, title text, body text, order_no text, status text, answer text,
  created_at timestamptz, answered_at timestamptz,
  author_login_id text, author_nickname text, answered_by_nickname text,
  author_restricted boolean, author_restriction_reason text
)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.kind, q.title, q.body, q.order_no, q.status, q.answer, q.created_at, q.answered_at,
    au.login_id, au.nickname, an.nickname,
    rs.account_id is not null, rs.reason
  from public.inquiries q
  join public.profiles au on au.id = q.author_id
  left join public.profiles an on an.id = q.answered_by
  left join public.inquiry_restrictions rs on rs.account_id = q.author_id
  where public.is_operator()
  order by (q.status = 'answered'), q.created_at desc, q.id
  limit 500;
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.admin_set_inquiry_restriction(uuid, boolean, text) from public, anon;
revoke all on function public.my_inquiry_restricted() from public, anon;
revoke all on function public.admin_inquiries() from public, anon;
grant execute on function public.admin_set_inquiry_restriction(uuid, boolean, text) to authenticated;
grant execute on function public.my_inquiry_restricted() to authenticated;
grant execute on function public.admin_inquiries() to authenticated;
