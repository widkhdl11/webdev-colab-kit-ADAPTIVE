-- 1:1 문의에 분류·주문번호 두 칸 (결정 d25, admin-console INV-K11).
-- - 분류(kind): 여섯 코드만 — gift(선물 보내기)·fee(요금)·shipping(배송)·creator(크리에이터)·account(계정)·etc(기타).
--   이 파일 전에 들어온 문의는 'etc' 로 채운다(열 추가의 기본값으로 — 조건 없는 update 를 쓰지 않는다).
-- - 주문번호(order_no): 없어도 된다. 있으면 주문번호 꼴(orders.order_no 와 같은 꼴)만.
--   실제 주문과 잇지 않는다 — 외래키도 조회도 없다. 있는 번호인지 알려 주면 남의 주문번호를 떠보는 데 쓰인다.
-- - 답이 달린 문의는 두 칸도 바뀌지 않는다(고정 트리거).

-- ── 칸 ──────────────────────────────────────────────────

alter table public.inquiries add column kind text not null default 'etc'
  check (kind in ('gift', 'fee', 'shipping', 'creator', 'account', 'etc'));
-- 기본값은 기존 행을 채우는 데만 쓴다 — 새 문의는 분류를 반드시 골라야 한다
alter table public.inquiries alter column kind drop default;

alter table public.inquiries add column order_no text
  check (order_no is null or order_no ~ '^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$');

-- ── 답이 달린 문의 고정: 분류·주문번호까지 ─────────────────

create or replace function public.inquiries_freeze_answered()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'answered' and (
    new.title is distinct from old.title or new.body is distinct from old.body or new.answer is distinct from old.answer
    or new.status is distinct from old.status or new.author_id is distinct from old.author_id
    or new.answered_by is distinct from old.answered_by or new.answered_at is distinct from old.answered_at
    or new.kind is distinct from old.kind or new.order_no is distinct from old.order_no
  ) then
    raise exception '답이 달린 문의는 고칠 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;

-- ── 주문번호 다듬기: 앞뒤 공백 제거·대문자, 빈칸은 없음 ──────

create function public.inquiry_order_no_checked(p_order_no text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := upper(btrim(coalesce(p_order_no, '')));
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$' then
    raise exception '주문번호 꼴이 아니다' using errcode = '22023';
  end if;
  return v;
end $$;

-- ── 쓰기: 분류·주문번호를 받는다. 옛 2인자 함수는 지운다 ─────

drop function public.create_inquiry(text, text);

-- 작성자는 인자로 받지 않는다 — 로그인 토큰의 사람이다
create function public.create_inquiry(p_kind text, p_title text, p_body text, p_order_no text)
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

-- ── 읽기: 반환 칸이 늘어 지우고 다시 만든다 ────────────────

drop function public.my_inquiries();

create function public.my_inquiries()
returns table (
  id uuid, kind text, title text, body text, order_no text, status text, answer text,
  created_at timestamptz, answered_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.kind, q.title, q.body, q.order_no, q.status, q.answer, q.created_at, q.answered_at
  from public.inquiries q where q.author_id = auth.uid()
  order by q.created_at desc, q.id;
$$;

drop function public.admin_inquiries();

create function public.admin_inquiries()
returns table (
  id uuid, kind text, title text, body text, order_no text, status text, answer text,
  created_at timestamptz, answered_at timestamptz,
  author_login_id text, author_nickname text, answered_by_nickname text
)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.kind, q.title, q.body, q.order_no, q.status, q.answer, q.created_at, q.answered_at,
    au.login_id, au.nickname, an.nickname
  from public.inquiries q
  join public.profiles au on au.id = q.author_id
  left join public.profiles an on an.id = q.answered_by
  where public.is_operator()
  order by (q.status = 'answered'), q.created_at desc, q.id
  limit 500;
$$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.inquiries_freeze_answered() from public, anon, authenticated;
revoke all on function public.inquiry_order_no_checked(text) from public, anon, authenticated;

revoke all on function public.create_inquiry(text, text, text, text) from public, anon;
revoke all on function public.my_inquiries() from public, anon;
revoke all on function public.admin_inquiries() from public, anon;

grant execute on function public.create_inquiry(text, text, text, text) to authenticated;
grant execute on function public.my_inquiries() to authenticated;
grant execute on function public.admin_inquiries() to authenticated;
