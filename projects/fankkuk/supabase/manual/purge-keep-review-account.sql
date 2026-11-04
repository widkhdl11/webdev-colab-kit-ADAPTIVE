-- 시험 사이트 DB 에서 남길 계정(토스 심사 계정)만 두고 나머지 회원과 그 회원들의 데이터를 전부 지운다.
-- 사람이 직접 실행한다(에이전트는 로컬에도 실행하지 않는다). 되돌릴 수 없다 — 실행 전에 Supabase 백업을 확인한다.
--
-- 쓰는 법
--   1. 아래 keep_login_ids 에 남길 계정의 로그인 아이디를 적는다(여러 개면 쉼표로).
--   2. apply 를 false 로 둔 채 Supabase SQL 편집기에 통째로 붙여 넣고 Run.
--      → 끝에서 일부러 오류를 내며 전부 되돌린다. 오류 문구에 「무엇이 몇 줄 지워질지」가 나온다. 아무것도 바뀌지 않는다.
--   3. 숫자가 맞으면 apply 를 true 로 바꿔 다시 Run. 이때만 실제로 지워진다.
--
-- 무엇이 지워지나
--   · 남길 계정이 아닌 회원 전부(auth.users·profiles). 운영자 계정도 지워진다 — 남기려면 keep_login_ids 에 넣는다.
--   · 지운 회원을 가리키던 행 전부, 그리고 그 행을 가리키던 행 전부(크리에이터 페이지·선물·상자·결제·환불·역조공·
--     사무실 처리 기록·알림·문의·주소·연락처·서명 기록 …). 지운 운영자가 만든 배너·공지·가격 변경 기록도 같이 지워진다.
--   · 회원과 이어지지 않은 접속 기록: 휴대폰 확인 코드, 로그인 실패·비밀번호 시도, 가입 확인 횟수.
-- 무엇이 남나
--   · 남길 계정과 그 계정의 연락처·약관 동의·알림 설정·주소(다른 회원과 이어지지 않은 것).
--   · 사이트 설정: 상자 가격표, 금지 품목, 태그 목록·금지어, 예약된 이름, 카카오 알림 양식, 인증 플랫폼 목록.
--   · 저장소(Storage)의 사진 파일 — SQL 로는 파일이 안 지워진다. 화면에서는 더 이상 보이지 않는다.
--
-- 작동 방식: 이 트랜잭션 안에서만 트리거를 끈다(session_replication_role = replica). 그래야 「기록은 지울 수 없다」
-- 보호 트리거를 지나갈 수 있다. 트리거가 꺼지면 FK 의 연쇄 삭제도 꺼지므로, 부모가 없어진 행을 직접 찾아 지우기를
-- 더 지울 것이 없을 때까지 되풀이한다. 마지막에 public·pii·auth 의 모든 FK 를 다시 훑어 부모 없는 행이 하나라도
-- 있으면 전부 되돌린다.

begin;

set local session_replication_role = replica;

create temp table _purge_report (tbl text, n bigint) on commit drop;

do $purge$
declare
  -- ▼ 여기만 고친다
  keep_login_ids text[] := array['여기에_심사_아이디'];
  apply boolean := false;
  -- ▲

  keep_ids uuid[];
  r record;
  cond text;
  pass int := 0;
  changed bigint;
  n bigint;
  report text;
begin
  if exists (select 1 from unnest(keep_login_ids) x where x like '여기에%') then
    raise exception '남길 로그인 아이디를 keep_login_ids 에 적어 주세요';
  end if;

  select array_agg(p.id) into keep_ids
  from public.profiles p
  where p.login_id = any (keep_login_ids);

  if coalesce(array_length(keep_ids, 1), 0) <> array_length(keep_login_ids, 1) then
    raise exception '로그인 아이디 % 중 찾은 계정이 %개뿐입니다 — 아이디를 확인해 주세요',
      keep_login_ids, coalesce(array_length(keep_ids, 1), 0);
  end if;

  -- 1) 회원
  delete from auth.users where id <> all (keep_ids);
  get diagnostics n = row_count; insert into _purge_report values ('auth.users', n);
  delete from public.profiles where id <> all (keep_ids);
  get diagnostics n = row_count; insert into _purge_report values ('public.profiles', n);

  -- 2) 회원과 FK 로 이어지지 않은 접속 기록
  delete from pii.phone_verifications;
  get diagnostics n = row_count; insert into _purge_report values ('pii.phone_verifications', n);
  delete from public.phone_change_events where account_id <> all (keep_ids);
  get diagnostics n = row_count; insert into _purge_report values ('public.phone_change_events', n);
  delete from public.login_link_failures;
  get diagnostics n = row_count; insert into _purge_report values ('public.login_link_failures', n);
  delete from public.password_attempts;
  get diagnostics n = row_count; insert into _purge_report values ('public.password_attempts', n);
  delete from public.signup_check_hits;
  get diagnostics n = row_count; insert into _purge_report values ('public.signup_check_hits', n);

  -- 3) 부모가 없어진 행을 더 없을 때까지 지운다
  loop
    pass := pass + 1;
    changed := 0;
    for r in
      select c.conrelid::regclass as child, c.confrelid::regclass as parent, c.conkey, c.confkey
      from pg_constraint c
      where c.contype = 'f'
        and c.conrelid::regclass::text !~ '^pg_'
        and (select nspname from pg_namespace where oid = (select relnamespace from pg_class where oid = c.conrelid))
            in ('public', 'pii', 'auth')
    loop
      select
        string_agg(format('t.%I is not null', ca.attname), ' and ') || ' and not exists (select 1 from '
          || r.parent::text || ' p where '
          || string_agg(format('p.%I = t.%I', pa.attname, ca.attname), ' and ') || ')'
      into cond
      from unnest(r.conkey, r.confkey) as k(ck, pk)
      join pg_attribute ca on ca.attrelid = r.child and ca.attnum = k.ck
      join pg_attribute pa on pa.attrelid = r.parent and pa.attnum = k.pk;

      execute format('delete from %s t where %s', r.child, cond);
      get diagnostics n = row_count;
      if n > 0 then
        changed := changed + n;
        insert into _purge_report values (r.child::text, n);
      end if;
    end loop;
    exit when changed = 0;
    if pass > 50 then
      raise exception '부모 없는 행 지우기가 50번 넘게 돌았습니다 — 멈추고 되돌립니다';
    end if;
  end loop;

  -- 4) 마지막 확인: 부모 없는 행이 하나도 없어야 한다(위 반복이 끝난 조건과 같은 검사를 따로 한 번 더)
  for r in
    select c.conrelid::regclass as child, c.confrelid::regclass as parent, c.conkey, c.confkey
    from pg_constraint c
    where c.contype = 'f'
      and (select nspname from pg_namespace where oid = (select relnamespace from pg_class where oid = c.conrelid))
          in ('public', 'pii', 'auth')
  loop
    select
      string_agg(format('t.%I is not null', ca.attname), ' and ') || ' and not exists (select 1 from '
        || r.parent::text || ' p where '
        || string_agg(format('p.%I = t.%I', pa.attname, ca.attname), ' and ') || ')'
    into cond
    from unnest(r.conkey, r.confkey) as k(ck, pk)
    join pg_attribute ca on ca.attrelid = r.child and ca.attnum = k.ck
    join pg_attribute pa on pa.attrelid = r.parent and pa.attnum = k.pk;
    execute format('select count(*) from %s t where %s', r.child, cond) into n;
    if n > 0 then
      raise exception '% 에 부모(%) 없는 행이 %줄 남았습니다 — 전부 되돌립니다', r.child, r.parent, n;
    end if;
  end loop;

  if (select count(*) from public.profiles) <> array_length(keep_ids, 1) then
    raise exception '남은 회원 수가 맞지 않습니다 — 전부 되돌립니다';
  end if;

  select string_agg(tbl || ' ' || total, E'\n' order by total desc)
  into report
  from (select tbl, sum(n) as total from _purge_report group by tbl) s;

  if not apply then
    raise exception E'[미리보기 — 아무것도 바뀌지 않았습니다] 남는 회원 %명, 지워질 줄:\n%',
      array_length(keep_ids, 1), coalesce(report, '(없음)');
  end if;

  raise notice E'지웠습니다. 남은 회원 %명\n%', array_length(keep_ids, 1), report;
end
$purge$;

select tbl as "테이블", sum(n) as "지운 줄" from _purge_report group by tbl order by 2 desc;

commit;
