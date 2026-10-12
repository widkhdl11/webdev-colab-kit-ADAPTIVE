-- 알림 — 꼭 가는 알림 넓히기(연락처 함수). 스펙: docs/specs/notifications.md INV-N6 (종류별 표, 2026-10-12 문제집 D7)
-- 사람이 직접 적용한다(개인정보 구역을 읽는 함수). 마이그레이션 20261012000004_must_notifications.sql 다음에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0016_notification_contact_must.sql
-- 되돌리기: manual/0011_notification_contact.sql 의 함수 본문을 create or replace 로 다시 적용
-- 확인: npx vitest run --config vitest.integration.config.mts notifications-db
--   → 「(manual/0016 뒤)」 시험 셋(S6d · S6e · 종류마다 넣고 꺼내 보는 S6d·S6e)이 적용 전에는 실패하고 적용 뒤에는 통과한다.
--     notifications-dispatch 의 「manual/0016 뒤」 둘도 같다(모두 다섯).
--
-- 무엇을 바꾸나: 0011 과 같고, 칸을 무시하는 조건 하나만 바뀐다.
--   그 전: n.kind = 'approval_request'                          (승인 요청과 그 재알림만)
--   이후: public.notification_kind_must_deliver(n.kind)          (마이그레이션이 만든 판정 함수 — 끌 수 없음 9종)
-- 꼭 가는 알림인지는 여전히 줄의 종류로 DB 가 정한다 — 앱이 넘기는 값이 아니다. 인자·권한·「보내는 중인 줄만」은 그대로.
-- 파일 전체가 한 트랜잭션이다 — 판정 함수가 없으면(마이그레이션 전) 여기서 멈추고 아무것도 바뀌지 않는다.

begin;

do $$
begin
  if to_regprocedure('public.notification_kind_must_deliver(text)') is null then
    raise exception '꼭 가는 알림 판정 함수가 없다 — 마이그레이션 20261012000004_must_notifications.sql 을 먼저 적용한다';
  end if;
  if to_regprocedure('public.notification_contact(uuid)') is null then
    raise exception '연락처 함수가 없다 — 0011_notification_contact.sql 을 먼저 적용한다';
  end if;
end $$;

create or replace function public.notification_contact(p_outbox_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case n.channel
           when 'email' then c.email
           when 'kakao' then c.phone
         end
  from public.notification_outbox n
  join pii.account_contacts c on c.account_id = n.account_id
  where n.id = p_outbox_id
    and n.status = 'sending'
    and (
      public.notification_kind_must_deliver(n.kind)     -- 꼭 가는 알림: 칸을 무시한다(INV-N6 표, 2026-10-12 문제집 D7)
      or (n.channel = 'email' and c.notify_email)
      or (n.channel = 'kakao' and c.notify_kakao)
    );
$$;

revoke all on function public.notification_contact(uuid) from public, anon, authenticated;
grant execute on function public.notification_contact(uuid) to service_role;

commit;
