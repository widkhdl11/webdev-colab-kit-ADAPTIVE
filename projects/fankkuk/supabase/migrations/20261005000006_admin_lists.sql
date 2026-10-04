-- 관리자 3단계 — 보낼 수 없는 물품(INV-K9) · 크리에이터 본인 확인(INV-K10) · 공지·1:1 문의(INV-K11).
-- 판정은 1단계의 is_operator() 를 쓴다(INV-K1). 사람은 아이디·닉네임으로만 돌려준다(INV-K8).
-- 기록·문의 목록은 최근 500줄까지(2단계 결제 목록과 같다 — 더 많아지면 쪽 나누기를 단다).
-- 오류 꼴: 42501 권한 없음 · 22023 입력이 조건 밖 · P0002 대상 없음 · 55000 이미 그 상태.

-- ── 보낼 수 없는 물품 (INV-K9) ───────────────────────────

create table public.prohibited_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  description text not null default '' check (char_length(description) <= 120 and description = btrim(description)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.prohibited_items enable row level security;
revoke all on public.prohibited_items from anon, authenticated;

-- 첫 목록 — 지금까지 크리에이터 페이지에 코드로 박혀 있던 네 줄
insert into public.prohibited_items (name, description, created_at) values
  ('음식과 신선식품', '유통기한이 있는 것은 모두 보낼 수 없어요.', '2026-10-01T00:00:00+09:00'),
  ('살아 있는 동물과 식물', '', '2026-10-01T00:00:01+09:00'),
  ('폭발·인화성 물질 등 위험물', '', '2026-10-01T00:00:02+09:00'),
  ('현금과 상품권', '', '2026-10-01T00:00:03+09:00');

-- 바뀐 기록. 항목이 지워져도 남아야 하므로 항목 표를 참조하지 않는다.
create table public.prohibited_item_changes (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  changed_by uuid not null references public.profiles (id),
  item_id uuid not null,
  action text not null check (action in ('add', 'edit', 'delete')),
  name_before text,
  name_after text,
  description_before text,
  description_after text,
  check ((action = 'add') = (name_before is null)),
  check ((action = 'delete') = (name_after is null))
);
alter table public.prohibited_item_changes enable row level security;
revoke all on public.prohibited_item_changes from anon, authenticated;

-- 추가만 하는 기록 표들이 같이 쓰는 막이
create function public.append_only_log()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception '처리 기록은 고치거나 지울 수 없다' using errcode = '42501';
end $$;

create trigger prohibited_item_changes_no_update before update on public.prohibited_item_changes
  for each row execute function public.append_only_log();
create trigger prohibited_item_changes_no_delete before delete on public.prohibited_item_changes
  for each row execute function public.append_only_log();

-- 이름·설명 검사. 앞뒤 빈칸은 걷어 내고 본다.
create function public.prohibited_item_checked(p_name text, p_description text)
returns table (name text, description text)
language plpgsql immutable set search_path = ''
as $$
begin
  name := btrim(coalesce(p_name, ''));
  description := btrim(coalesce(p_description, ''));
  if char_length(name) not between 1 and 40 or char_length(description) > 120 then
    raise exception '이름은 1~40자, 설명은 120자까지다' using errcode = '22023';
  end if;
  return next;
end $$;

-- 공개 읽기 — 크리에이터 페이지·선물 보내기 화면
create function public.list_prohibited_items()
returns table (id uuid, name text, description text)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.name, i.description from public.prohibited_items i order by i.created_at, i.id;
$$;

create function public.admin_prohibited_items()
returns table (id uuid, name text, description text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.name, i.description, i.updated_at from public.prohibited_items i
  where public.is_operator() order by i.created_at, i.id;
$$;

create function public.admin_prohibited_changes()
returns table (
  at timestamptz, changed_by_nickname text, action text,
  name_before text, name_after text, description_before text, description_after text
)
language sql stable security definer set search_path = ''
as $$
  select c.at, p.nickname, c.action, c.name_before, c.name_after, c.description_before, c.description_after
  from public.prohibited_item_changes c join public.profiles p on p.id = c.changed_by
  where public.is_operator()
  order by c.at desc, c.id desc
  limit 500;
$$;

create function public.admin_add_prohibited_item(p_name text, p_description text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.prohibited_items;
  c record;
begin
  if not public.is_operator() then
    raise exception '운영자만 바꾼다' using errcode = '42501';
  end if;
  select * into c from public.prohibited_item_checked(p_name, p_description);
  insert into public.prohibited_items (name, description) values (c.name, c.description) returning * into v;
  insert into public.prohibited_item_changes (changed_by, item_id, action, name_after, description_after)
  values (auth.uid(), v.id, 'add', v.name, v.description);
  return v.id;
end $$;

create function public.admin_edit_prohibited_item(p_id uuid, p_name text, p_description text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.prohibited_items;
  c record;
begin
  if not public.is_operator() then
    raise exception '운영자만 바꾼다' using errcode = '42501';
  end if;
  select * into c from public.prohibited_item_checked(p_name, p_description);
  select * into v_old from public.prohibited_items where id = p_id for update;
  if v_old.id is null then
    raise exception '없는 항목이다' using errcode = 'P0002';
  end if;
  update public.prohibited_items set name = c.name, description = c.description, updated_at = now() where id = p_id;
  insert into public.prohibited_item_changes (changed_by, item_id, action, name_before, name_after, description_before, description_after)
  values (auth.uid(), p_id, 'edit', v_old.name, c.name, v_old.description, c.description);
end $$;

create function public.admin_delete_prohibited_item(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.prohibited_items;
begin
  if not public.is_operator() then
    raise exception '운영자만 바꾼다' using errcode = '42501';
  end if;
  delete from public.prohibited_items where id = p_id returning * into v_old;
  if v_old.id is null then
    raise exception '없는 항목이다' using errcode = 'P0002';
  end if;
  insert into public.prohibited_item_changes (changed_by, item_id, action, name_before, description_before)
  values (auth.uid(), p_id, 'delete', v_old.name, v_old.description);
end $$;

-- ── 크리에이터 본인 확인 (INV-K10) ───────────────────────
-- 찾기·팔로우·선물 등록은 이미 creators.identity_verified 로 거른다(list_creators·set_follow·register_order 등).
-- 여기서는 그 칸을 운영자만 바꾸게 하고, 바꿀 때마다 기록을 남긴다.

create table public.creator_verification_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  acted_by uuid not null references public.profiles (id),
  action text not null check (action in ('approve', 'revoke')),
  reason text not null default '' check (char_length(reason) <= 200)
);
create index creator_verification_events_creator_idx on public.creator_verification_events (creator_id, at desc);
alter table public.creator_verification_events enable row level security;
revoke all on public.creator_verification_events from anon, authenticated;

create trigger creator_verification_events_no_update before update on public.creator_verification_events
  for each row execute function public.append_only_log();
-- 지우기는 크리에이터가 지워질 때(cascade)만 일어난다 — 그 밖의 지우기는 막는다
create function public.creator_verification_events_no_delete()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.creators c where c.id = old.creator_id) then
    raise exception '처리 기록은 고치거나 지울 수 없다' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger creator_verification_events_no_delete before delete on public.creator_verification_events
  for each row execute function public.creator_verification_events_no_delete();

create function public.admin_set_creator_verified(p_creator_id uuid, p_verified boolean, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_now boolean;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_operator() then
    raise exception '운영자만 승인·취소한다' using errcode = '42501';
  end if;
  if p_verified is null or char_length(v_reason) > 200 then
    raise exception '사유는 200자까지다' using errcode = '22023';
  end if;
  -- 같은 크리에이터를 두 사람이 동시에 눌러도 한 사람만 바꾼다
  select c.identity_verified into v_now from public.creators c where c.id = p_creator_id for update;
  if not found then
    raise exception '없는 크리에이터다' using errcode = 'P0002';
  end if;
  if v_now = p_verified then
    raise exception '이미 그 상태다' using errcode = '55000';
  end if;
  update public.creators set identity_verified = p_verified where id = p_creator_id;
  insert into public.creator_verification_events (creator_id, acted_by, action, reason)
  values (p_creator_id, auth.uid(), case when p_verified then 'approve' else 'revoke' end, v_reason);
end $$;

create function public.admin_creators()
returns table (
  id uuid, slug text, name text, channel text, channel_title text,
  login_id text, verified boolean, last_action_at timestamptz, last_actor_nickname text
)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.slug, c.name, c.channel, c.channel_title, p.login_id, c.identity_verified, e.at, a.nickname
  from public.creators c
  left join public.profiles p on p.id = c.profile_id
  left join lateral (
    select ev.at, ev.acted_by from public.creator_verification_events ev
    where ev.creator_id = c.id order by ev.at desc, ev.id desc limit 1
  ) e on true
  left join public.profiles a on a.id = e.acted_by
  where public.is_operator()
  order by c.identity_verified, c.created_at, c.id;
$$;

create function public.admin_creator_verification_events()
returns table (at timestamptz, actor_nickname text, creator_id uuid, creator_name text, action text, reason text)
language sql stable security definer set search_path = ''
as $$
  select e.at, a.nickname, e.creator_id, c.name, e.action, e.reason
  from public.creator_verification_events e
  join public.profiles a on a.id = e.acted_by
  join public.creators c on c.id = e.creator_id
  where public.is_operator()
  order by e.at desc, e.id desc
  limit 500;
$$;

-- ── 공지 (INV-K11) ───────────────────────────────────────

alter table public.notices add column author_id uuid references public.profiles (id);
alter table public.notices add column updated_at timestamptz;
alter table public.notices add column updated_by uuid references public.profiles (id);

-- 본문은 글자로 받아 빈 줄로 나눈 문단 덩어리로 바꾼다. 화면이 덩어리를 직접 보내지 않으므로
-- 링크 덩어리를 끼워 넣을 길이 없다.
create function public.notice_body_of(p_text text)
returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', 'text', 'parts', jsonb_build_array(para)) order by n), '[]'::jsonb)
  from (
    select btrim(x, E' \t\r\n') as para, n
    from regexp_split_to_table(replace(coalesce(p_text, ''), E'\r\n', E'\n'), E'\n[ \t]*\n') with ordinality as t(x, n)
  ) s
  where para <> '';
$$;

create function public.admin_notices()
returns table (slug text, title text, pinned boolean, published_at timestamptz, author_nickname text, body jsonb)
language sql stable security definer set search_path = ''
as $$
  select n.slug, n.title, n.pinned, n.published_at, p.nickname, n.body
  from public.notices n left join public.profiles p on p.id = n.author_id
  where public.is_operator()
  order by n.pinned desc, n.published_at desc, n.slug;
$$;

-- p_slug 가 없으면 새로 쓰고, 있으면 그 공지를 고친다. 쓴 사람은 그대로 두고 고친 사람·시각을 따로 남긴다. 돌려주는 값은 공지 slug.
create function public.admin_save_notice(p_slug text, p_title text, p_body text, p_pinned boolean)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body jsonb;
  v_slug text;
begin
  if not public.is_operator() then
    raise exception '운영자만 공지를 쓴다' using errcode = '42501';
  end if;
  if char_length(v_title) not between 1 and 100 or char_length(coalesce(p_body, '')) > 5000 then
    raise exception '제목은 1~100자, 본문은 5000자까지다' using errcode = '22023';
  end if;
  v_body := public.notice_body_of(p_body);
  if jsonb_array_length(v_body) = 0 then
    raise exception '본문이 비었다' using errcode = '22023';
  end if;

  if p_slug is null then
    v_slug := 'n-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    insert into public.notices (slug, title, body, published_at, pinned, author_id)
    values (v_slug, v_title, v_body, now(), coalesce(p_pinned, false), auth.uid());
  else
    update public.notices
    set title = v_title, body = v_body, pinned = coalesce(p_pinned, false), updated_by = auth.uid(), updated_at = now()
    where slug = p_slug
    returning slug into v_slug;
    if v_slug is null then
      raise exception '없는 공지다' using errcode = 'P0002';
    end if;
  end if;
  return v_slug;
end $$;

-- ── 1:1 문의 (INV-K11) ───────────────────────────────────

alter table public.inquiries add column answered_by uuid references public.profiles (id);

-- 답이 달린 문의는 함수를 거치지 않아도 바뀌지 않는다 — 제목·본문·답·작성자·답한 사람·답한 시각 모두
create function public.inquiries_freeze_answered()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.status = 'answered' and (
    new.title is distinct from old.title or new.body is distinct from old.body or new.answer is distinct from old.answer
    or new.status is distinct from old.status or new.author_id is distinct from old.author_id
    or new.answered_by is distinct from old.answered_by or new.answered_at is distinct from old.answered_at
  ) then
    raise exception '답이 달린 문의는 고칠 수 없다' using errcode = '55000';
  end if;
  return new;
end $$;
create trigger inquiries_freeze_answered before update on public.inquiries
  for each row execute function public.inquiries_freeze_answered();

create function public.inquiry_checked(p_title text, p_body text)
returns table (title text, body text)
language plpgsql immutable set search_path = ''
as $$
begin
  title := btrim(coalesce(p_title, ''));
  body := btrim(coalesce(p_body, ''));
  if char_length(title) not between 1 and 100 or char_length(body) not between 1 and 4000 then
    raise exception '제목은 1~100자, 본문은 1~4000자다' using errcode = '22023';
  end if;
  return next;
end $$;

-- 작성자는 인자로 받지 않는다 — 로그인 토큰의 사람이다
create function public.create_inquiry(p_title text, p_body text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  c record;
begin
  if v_uid is null or not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  select * into c from public.inquiry_checked(p_title, p_body);
  insert into public.inquiries (author_id, title, body) values (v_uid, c.title, c.body) returning id into v_id;
  return v_id;
end $$;

create function public.my_inquiries()
returns table (id uuid, title text, body text, status text, answer text, created_at timestamptz, answered_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.title, q.body, q.status, q.answer, q.created_at, q.answered_at
  from public.inquiries q where q.author_id = auth.uid()
  order by q.created_at desc, q.id;
$$;

-- 남의 문의는 「없다」로 답한다 — 있는지 없는지도 알려 주지 않는다
create function public.edit_my_inquiry(p_id uuid, p_title text, p_body text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  c record;
begin
  select * into c from public.inquiry_checked(p_title, p_body);
  -- 답 달기와 겹치면 먼저 잠근 쪽이 이긴다. 답이 먼저면 여기서 answered 를 읽고 거부한다.
  select q.status into v_status from public.inquiries q where q.id = p_id and q.author_id = auth.uid() for update;
  if not found then
    raise exception '없는 문의다' using errcode = 'P0002';
  end if;
  if v_status = 'answered' then
    raise exception '답이 달린 문의는 고칠 수 없다' using errcode = '55000';
  end if;
  update public.inquiries set title = c.title, body = c.body where id = p_id;
end $$;

create function public.admin_inquiries()
returns table (
  id uuid, title text, body text, status text, answer text, created_at timestamptz, answered_at timestamptz,
  author_login_id text, author_nickname text, answered_by_nickname text
)
language sql stable security definer set search_path = ''
as $$
  select q.id, q.title, q.body, q.status, q.answer, q.created_at, q.answered_at, au.login_id, au.nickname, an.nickname
  from public.inquiries q
  join public.profiles au on au.id = q.author_id
  left join public.profiles an on an.id = q.answered_by
  where public.is_operator()
  order by (q.status = 'answered'), q.created_at desc, q.id
  limit 500;
$$;

create function public.admin_answer_inquiry(p_id uuid, p_answer text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_answer text := btrim(coalesce(p_answer, ''));
begin
  if not public.is_operator() then
    raise exception '운영자만 답한다' using errcode = '42501';
  end if;
  if char_length(v_answer) not between 1 and 4000 then
    raise exception '답은 1~4000자다' using errcode = '22023';
  end if;
  select q.status into v_status from public.inquiries q where q.id = p_id for update;
  if not found then
    raise exception '없는 문의다' using errcode = 'P0002';
  end if;
  if v_status = 'answered' then
    raise exception '이미 답한 문의다' using errcode = '55000';
  end if;
  update public.inquiries
  set answer = v_answer, answered_at = now(), answered_by = auth.uid(), status = 'answered'
  where id = p_id;
end $$;

-- ── 실행 권한 ────────────────────────────────────────────

revoke all on function public.append_only_log() from public, anon, authenticated;
revoke all on function public.creator_verification_events_no_delete() from public, anon, authenticated;
revoke all on function public.inquiries_freeze_answered() from public, anon, authenticated;
revoke all on function public.prohibited_item_checked(text, text) from public, anon, authenticated;
revoke all on function public.inquiry_checked(text, text) from public, anon, authenticated;
revoke all on function public.notice_body_of(text) from public, anon, authenticated;

revoke all on function public.list_prohibited_items() from public;
grant execute on function public.list_prohibited_items() to anon, authenticated, service_role;

revoke all on function public.admin_prohibited_items() from public, anon;
revoke all on function public.admin_prohibited_changes() from public, anon;
revoke all on function public.admin_add_prohibited_item(text, text) from public, anon;
revoke all on function public.admin_edit_prohibited_item(uuid, text, text) from public, anon;
revoke all on function public.admin_delete_prohibited_item(uuid) from public, anon;
revoke all on function public.admin_set_creator_verified(uuid, boolean, text) from public, anon;
revoke all on function public.admin_creators() from public, anon;
revoke all on function public.admin_creator_verification_events() from public, anon;
revoke all on function public.admin_notices() from public, anon;
revoke all on function public.admin_save_notice(text, text, text, boolean) from public, anon;
revoke all on function public.create_inquiry(text, text) from public, anon;
revoke all on function public.my_inquiries() from public, anon;
revoke all on function public.edit_my_inquiry(uuid, text, text) from public, anon;
revoke all on function public.admin_inquiries() from public, anon;
revoke all on function public.admin_answer_inquiry(uuid, text) from public, anon;

grant execute on function public.admin_prohibited_items() to authenticated;
grant execute on function public.admin_prohibited_changes() to authenticated;
grant execute on function public.admin_add_prohibited_item(text, text) to authenticated;
grant execute on function public.admin_edit_prohibited_item(uuid, text, text) to authenticated;
grant execute on function public.admin_delete_prohibited_item(uuid) to authenticated;
grant execute on function public.admin_set_creator_verified(uuid, boolean, text) to authenticated;
grant execute on function public.admin_creators() to authenticated;
grant execute on function public.admin_creator_verification_events() to authenticated;
grant execute on function public.admin_notices() to authenticated;
grant execute on function public.admin_save_notice(text, text, text, boolean) to authenticated;
grant execute on function public.create_inquiry(text, text) to authenticated;
grant execute on function public.my_inquiries() to authenticated;
grant execute on function public.edit_my_inquiry(uuid, text, text) to authenticated;
grant execute on function public.admin_inquiries() to authenticated;
grant execute on function public.admin_answer_inquiry(uuid, text) to authenticated;
