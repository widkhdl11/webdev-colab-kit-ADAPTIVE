-- 역할별 로그인 유지 기간 — DB 층 (docs/specs/session-login.md INV-L16·L19, 카드 fankkuk-20261031-1-d2, 2026-10-31)
--
-- 1) 세션별 마지막 사용 시각 표(session_activity): 세션 하나에 줄 하나. 앱 서버가 요청마다 판정하고 1분이 지났을 때만 고친다.
--    절대 기간의 시작은 Auth 가 기록한 그 세션의 로그인 시각(auth.sessions.created_at)이다 — 토큰 갱신·링크 로그인은 늘리지 않는다.
-- 2) 판정 재료 함수(session_lifetime_facts): 역할·대표 여부·로그인 시각·마지막 사용 시각·DB 지금 시각을 한 번에 — proxy 의 DB 왕복을 하나로.
--    세션이 그 사람의 것인지(auth.sessions 의 user_id)를 여기서 본다 — 남의 세션 id 를 넣으면 아무것도 돌려주지 않는다.
-- 3) 마지막 사용 고치기(session_touch)·세션 끝내기(session_end) — 기간이 지난 세션은 Auth 로그아웃과 별도로 DB 에서도 지운다(갱신 토큰 함께).
-- 4) 로그인 링크 템플릿 등록 여부(login_link_template_ready) — 기간으로 끝난 크리에이터에게 알림톡 안내를 보일지(INV-L17).
-- 기간 값은 DB 에 두지 않는다 — 앱의 상수 한 곳(src/entities/session/model/session-lifetime.ts)이 판정한다.
-- 표와 함수는 앱 서버 키 전용이다. 화면 쪽 키는 표에도 함수에도 닿지 않는다(사람 ID 는 앱이 로그인 토큰으로 확인한 값만 넘긴다, INV-L2·L3).

create table public.session_activity (
  session_id uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index session_activity_user on public.session_activity (user_id);

alter table public.session_activity enable row level security;
-- 정책은 만들지 않는다. 앱 서버 키도 표에 직접 닿지 않는다 — 아래 함수로만
revoke all on public.session_activity from public, anon, authenticated, service_role;

-- INV-L16: 그 사람의 그 세션의 판정 재료. 세션이 없거나(끝남) 남의 세션이면 빈 결과
create or replace function public.session_lifetime_facts(p_user_id uuid, p_session_id uuid)
returns table (role text, is_owner boolean, created_at timestamptz, last_seen_at timestamptz, db_now timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.role::text,
         exists (select 1 from public.owner_setting o where o.owner_user_id = p.id),
         s.created_at,
         a.last_seen_at,
         now()
  from auth.sessions s
  join public.profiles p on p.id = s.user_id
  left join public.session_activity a on a.session_id = s.id and a.user_id = s.user_id
  where s.id = p_session_id and s.user_id = p_user_id
$$;

-- INV-L16·L19: 마지막 사용 시각을 지금으로(1분 간격은 앱이 정한다 — [연장] 은 바로 부른다). 그 사람의 살아 있는 세션일 때만 true
create or replace function public.session_touch(p_user_id uuid, p_session_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id) then
    return false;
  end if;
  insert into public.session_activity (session_id, user_id, last_seen_at)
  values (p_session_id, p_user_id, now())
  on conflict (session_id) do update set last_seen_at = excluded.last_seen_at
  where public.session_activity.user_id = excluded.user_id;
  return true;
end $$;

-- INV-L16: 기간이 지난 세션을 끝낸다 — Auth 세션 줄(갱신 토큰이 함께 지워진다)과 마지막 사용 줄. 그 사람의 세션만
create or replace function public.session_end(p_user_id uuid, p_session_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id;
  delete from public.session_activity a where a.session_id = p_session_id and a.user_id = p_user_id;
end $$;

-- INV-L17: 승인 요청 로그인 링크 템플릿이 등록돼 있는가(link-login) — 기간으로 끝난 크리에이터에게 알림톡 안내를 보일지
create or replace function public.login_link_template_ready()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.notification_kakao_templates t where t.kind = 'approval_request' and t.login_link_template_code is not null)
$$;

revoke all on function public.session_lifetime_facts(uuid, uuid), public.session_touch(uuid, uuid), public.session_end(uuid, uuid), public.login_link_template_ready() from public, anon, authenticated;
grant execute on function public.session_lifetime_facts(uuid, uuid), public.session_touch(uuid, uuid), public.session_end(uuid, uuid), public.login_link_template_ready() to service_role;
