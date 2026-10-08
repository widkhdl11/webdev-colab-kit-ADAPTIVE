-- 비밀번호 확인 횟수 — 아이디마다 10분에 5번 틀리면 15분 막는다 (session-login INV-L14, DECISIONS 2026-10-08 — 정책 질문 ⑦).
-- 로그인·비밀번호 바꾸기·번호 바꾸기의 비밀번호 확인은 모두 앱 서버가 Supabase Auth 에 묻는다. Auth 의 시도 제한은 IP 기준인데
-- 요청이 전부 앱 서버 IP 에서 나가므로, 계정 하나를 노린 짐작이 계정 단위로 막히지 않는다. 그래서 아이디마다 여기서 센다.
--
-- 1) password_attempts — 아이디(소문자로 맞춘 값)·시각·결과(null = 결과 전, false = 틀림, true = 맞음). 비밀번호·IP 는 없다.
-- 2) password_attempt_begin(아이디) — 같은 아이디를 잠그고(트랜잭션 잠금) 막혔는지 본 뒤, 막히지 않았으면 「결과 전」 줄을 넣고 그 id 를,
--    막혔으면 null 을 돌려준다(줄도 넣지 않는다). 막힘: 마지막으로 맞은 뒤의 실패(결과 전 포함) 중 가장 최근 것을 t 라 할 때
--    (t − 10분, t] 안에 5개 이상이고 지금이 t + 15분 전이면. 결과 전 줄을 실패로 세므로 동시에 들어와도 한도를 넘지 않는다.
-- 3) password_attempt_finish(id, 맞음) — 결과 전 줄에만 결과를 적는다(한 번만). 이미 결과가 있으면 아무것도 바꾸지 않는다.
-- 4) password_attempt_clear(아이디) — 비밀번호 재설정이 끝났을 때 「맞음」 줄을 넣어 막힘을 푼다.
-- 세 함수는 서버 전용 키(service_role)로만 부른다 — 손님 키로 부를 수 있으면 남의 아이디를 일부러 막을 수 있다.
--
-- 오류 꼴: 22023 아이디 꼴(앞뒤 공백을 뗀 1~100자)

create table public.password_attempts (
  id bigint generated always as identity primary key,
  login_key text not null check (char_length(login_key) between 1 and 100 and login_key = lower(btrim(login_key))),
  ok boolean,
  at timestamptz not null default now()
);
create index password_attempts_key_at_idx on public.password_attempts (login_key, at desc);
alter table public.password_attempts enable row level security;
revoke all on public.password_attempts from public, anon, authenticated;

create function public.password_login_key(p_login_key text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v text := lower(btrim(coalesce(p_login_key, '')));
begin
  if char_length(v) not between 1 and 100 then
    raise exception '아이디 꼴이 아니다' using errcode = '22023';
  end if;
  return v;
end $$;

create function public.password_attempt_begin(p_login_key text)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := public.password_login_key(p_login_key);
  v_last_ok timestamptz;
  v_last_fail timestamptz;
  v_fails integer;
  v_id bigint;
begin
  -- 같은 아이디의 시작은 한 줄로 세운다 — 동시에 들어온 시작이 같은 횟수를 보고 함께 통과하지 않게
  perform pg_advisory_xact_lock(hashtextextended('password_attempts:' || v_key, 0));

  select max(a.at) into v_last_ok from public.password_attempts a where a.login_key = v_key and a.ok;
  select max(a.at) into v_last_fail from public.password_attempts a
  where a.login_key = v_key and a.ok is not true and a.at > coalesce(v_last_ok, '-infinity'::timestamptz);

  if v_last_fail is not null and now() < v_last_fail + interval '15 minutes' then
    select count(*) into v_fails from public.password_attempts a
    where a.login_key = v_key and a.ok is not true
      and a.at > coalesce(v_last_ok, '-infinity'::timestamptz)
      and a.at > v_last_fail - interval '10 minutes' and a.at <= v_last_fail;
    if v_fails >= 5 then
      return null;
    end if;
  end if;

  insert into public.password_attempts (login_key) values (v_key) returning id into v_id;
  return v_id;
end $$;

create function public.password_attempt_finish(p_id bigint, p_ok boolean)
returns void
language sql security definer set search_path = ''
as $$
  update public.password_attempts set ok = p_ok where id = p_id and ok is null and p_ok is not null;
$$;

create function public.password_attempt_clear(p_login_key text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.password_attempts (login_key, ok) values (public.password_login_key(p_login_key), true);
end $$;

revoke all on function public.password_login_key(text) from public, anon, authenticated;
revoke all on function public.password_attempt_begin(text) from public, anon, authenticated;
revoke all on function public.password_attempt_finish(bigint, boolean) from public, anon, authenticated;
revoke all on function public.password_attempt_clear(text) from public, anon, authenticated;
grant execute on function public.password_attempt_begin(text) to service_role;
grant execute on function public.password_attempt_finish(bigint, boolean) to service_role;
grant execute on function public.password_attempt_clear(text) to service_role;
