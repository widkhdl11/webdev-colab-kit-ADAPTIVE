-- 크리에이터 알림 두 칸 고치기 — 스펙: docs/specs/my-account.md (INV-A11, S11). 결정 카드 fankkuk-20261001-1-d35.
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md — 개인정보 구역에 쓰는 함수). 0002·0003_account_contacts 가 적용된 DB 에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0012_creator_notify.sql
-- 되돌리기: drop function public.update_my_creator_notify(boolean, boolean);
-- 확인: npx vitest run --config vitest.integration.config.mts tests/integration/creator-settings-db.integration.test.ts
--   → 「(manual/0012 뒤)」 시험 셋이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--
-- 무엇을 하나:
--   · 크리에이터의 알림 칸은 팬과 같은 두 칸(카카오·이메일)이다 — 연락처 줄(pii.account_contacts)의 같은 칸을 쓴다.
--     보내는 일꾼은 이미 이 두 칸을 보고(0011 notification_contact), 승인 요청과 그 재알림은 두 칸이 꺼져도 보낸다(INV-N6).
--   · 팬의 고치기 함수(update_my_account)는 닉네임 1~12자·이메일을 같이 받는데, 크리에이터의 계정 닉네임은 공개 이름(1~20자)이고
--     공개 이름은 공개 정보 고치기(update_my_creator_profile, INV-A9)로 바뀐다. 그래서 크리에이터는 알림 두 칸만 받는 이 함수를 쓴다.
--   · 계정 ID 를 받지 않는다 — 로그인 토큰의 계정만(INV-A3). 크리에이터 계정이 아니면 거부. 빈 값이면 아무 칸도 바꾸지 않는다(INV-A5).
--   · 연락처 줄이 없으면 만든다(update_my_account 와 같다). 이메일·휴대폰은 건드리지 않는다(INV-A4).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

do $$
begin
  if to_regclass('pii.account_contacts') is null then
    raise exception '연락처 표(pii.account_contacts)가 없다 — 0002_account_contacts.sql 을 먼저 적용한다';
  end if;
end $$;

create or replace function public.update_my_creator_notify(p_notify_kakao boolean, p_notify_email boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요하다' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'creator') then
    raise exception '크리에이터 계정만 고친다' using errcode = '42501';
  end if;
  if p_notify_kakao is null or p_notify_email is null then
    raise exception '알림 설정이 비었다' using errcode = '22023';
  end if;
  insert into pii.account_contacts (account_id) values (v_uid) on conflict (account_id) do nothing;
  update pii.account_contacts
     set notify_kakao = p_notify_kakao,
         notify_email = p_notify_email,
         updated_at = now()
   where account_id = v_uid;
end;
$$;

revoke all on function public.update_my_creator_notify(boolean, boolean) from public, anon;
grant execute on function public.update_my_creator_notify(boolean, boolean) to authenticated;

commit;
