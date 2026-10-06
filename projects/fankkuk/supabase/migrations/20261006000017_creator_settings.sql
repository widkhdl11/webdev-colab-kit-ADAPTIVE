-- 크리에이터 설정 저장 — 공개 이름·소개글·찾기 노출 (my-account INV-A9·A10, S9·S9b·S10). 결정 카드 fankkuk-20261001-1-d35.
-- 알림 두 칸(INV-A11)은 개인정보 구역의 연락처 줄에 있어 이 파일이 아니라 supabase/manual/0012_creator_notify.sql(사람이 적용)이다.
--
-- 1) 찾기 노출 칸(searchable). 처음 값은 켜짐. 찾기 목록(find_creators)은 「본인 확인됨 그리고 노출 켜짐」만 돌려준다.
--    크리에이터 페이지·팔로우·선물 등록이 쓰는 목록(list_creators)은 그대로 「본인 확인됨」만 본다 — 끈 동안에도 그 길은 열려 있다.
-- 2) 공개 이름 바꾼 기록(creator_name_changes). 추가만. 운영자 크리에이터 목록에서 읽는다(admin_creator_name_changes).
-- 3) 고치기 함수(update_my_creator_profile). 계정·크리에이터 ID 를 받지 않는다 — 로그인 토큰의 크리에이터 한 줄만.
--    고치는 칸은 공개 이름·소개글·노출 셋뿐이다. 채널·본인 확인·페이지 주소 이름·평균 승인 시간은 여기서 바뀌지 않는다.
--    입력 경계: 공개 이름 앞뒤 공백을 뺀 1~20자, 소개글 0~200자, 노출 참·거짓. 하나라도 틀리면 아무 칸도 바꾸지 않는다.
--    공개 이름이 바뀌면 계정 닉네임(머리 메뉴·인사말)도 같이 바꾼다 — 가입 때 둘을 같게 정한 것과 맞춘다(20261006000005).
-- 4) 설정 화면 읽기(my_creator_settings) — 로그인한 크리에이터의 공개 이름·소개글·노출.
--
-- 오류 꼴: 42501 로그인 안 함·크리에이터 아님 · 22023 입력 꼴 · P0002 크리에이터 줄 없음

-- ── 1) 찾기 노출 ─────────────────────────────────────────

alter table public.creators add column searchable boolean not null default true;

create function public.find_creators()
returns table (
  id uuid,
  slug text,
  name text,
  channel text,
  channel_title text,
  category text,
  intro text,
  alias text,
  avg_approval_hours integer,
  face_tone text,
  approval_minutes_from_orders integer
)
language sql stable security definer set search_path = ''
as $$
  select l.* from public.list_creators() l
  join public.creators c on c.id = l.id
  where c.identity_verified and c.searchable;
$$;

revoke all on function public.find_creators() from public;
grant execute on function public.find_creators() to anon, authenticated;

-- ── 2) 공개 이름 바꾼 기록 ─────────────────────────────────

create table public.creator_name_changes (
  id bigint generated always as identity primary key,
  creator_id uuid not null references public.creators (id),
  at timestamptz not null default now(),
  before_name text not null,
  after_name text not null
);
create index creator_name_changes_creator_idx on public.creator_name_changes (creator_id, at desc);
alter table public.creator_name_changes enable row level security;
revoke all on public.creator_name_changes from anon, authenticated;

create trigger creator_name_changes_no_update before update on public.creator_name_changes
  for each row execute function public.append_only_log();
create trigger creator_name_changes_no_delete before delete on public.creator_name_changes
  for each row execute function public.append_only_log();

-- 운영자만. 크리에이터는 공개 이름·아이디로 보인다(admin-console INV-K8 — 사람은 닉네임·아이디로만).
create function public.admin_creator_name_changes()
returns table (at timestamptz, creator_id uuid, creator_name text, login_id text, before_name text, after_name text)
language sql stable security definer set search_path = ''
as $$
  select n.at, n.creator_id, c.name, p.login_id, n.before_name, n.after_name
  from public.creator_name_changes n
  join public.creators c on c.id = n.creator_id
  left join public.profiles p on p.id = c.profile_id
  where public.is_operator()
  order by n.at desc, n.id desc;
$$;

revoke all on function public.admin_creator_name_changes() from public, anon;
grant execute on function public.admin_creator_name_changes() to authenticated;

-- ── 3) 고치기 ───────────────────────────────────────────

create function public.update_my_creator_profile(p_name text, p_intro text, p_searchable boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_intro text := btrim(coalesce(p_intro, ''));
  v_creator public.creators;
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 20 then
    raise exception '공개 이름은 1~20자다' using errcode = '22023';
  end if;
  if p_intro is null or char_length(v_intro) > 200 then
    raise exception '소개글은 0~200자다' using errcode = '22023';
  end if;
  if p_searchable is null then
    raise exception '찾기 노출은 참·거짓이다' using errcode = '22023';
  end if;

  select * into v_creator from public.creators c where c.profile_id = v_uid for no key update;
  if not found then
    raise exception '크리에이터 줄이 없다' using errcode = 'P0002';
  end if;

  update public.creators c set name = v_name, intro = v_intro, searchable = p_searchable where c.id = v_creator.id;
  if v_creator.name <> v_name then
    insert into public.creator_name_changes (creator_id, before_name, after_name) values (v_creator.id, v_creator.name, v_name);
    update public.profiles p set nickname = v_name where p.id = v_uid;
  end if;
end $$;

revoke all on function public.update_my_creator_profile(text, text, boolean) from public, anon;
grant execute on function public.update_my_creator_profile(text, text, boolean) to authenticated;

-- ── 4) 설정 화면 읽기 ─────────────────────────────────────

create function public.my_creator_settings()
returns table (name text, intro text, searchable boolean)
language sql stable security definer set search_path = ''
as $$
  select c.name, c.intro, c.searchable
  from public.creators c
  join public.profiles p on p.id = c.profile_id
  where c.profile_id = auth.uid() and p.role = 'creator';
$$;

revoke all on function public.my_creator_settings() from public, anon;
grant execute on function public.my_creator_settings() to authenticated;
