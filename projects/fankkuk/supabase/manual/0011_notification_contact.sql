-- 알림 — 보내는 순간 연락처 읽기. 스펙: docs/specs/notifications.md (INV-N3·N6·N10)
-- 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md — 개인정보 구역을 읽는 함수). 마이그레이션 20261006000009_notifications.sql
-- (발송 대기 줄 표·일꾼 함수) 다음에, 0002_account_contacts.sql 이 적용된 DB 에 적용한다.
--
-- 적용(로컬, bash):
--   docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /c/Users/PC/Desktop/dev/webdeb-colab-kit-ADAPTIVE/projects/fankkuk/supabase/manual/0011_notification_contact.sql
-- 되돌리기: drop function public.notification_contact(uuid);
--
-- 무엇을 하나:
--   · 발송 대기 줄 하나(꺼내서 「보내는 중」인 줄)의 id 를 받아, 그 줄의 받는 계정·통로에 맞는 연락처 하나를 돌려준다.
--     이메일 통로 → 확인된 이메일(확인 대기 이메일은 쓰지 않는다, my-account INV-A7). 카카오 통로 → 휴대폰 번호.
--   · 그 통로의 알림 칸이 꺼져 있으면 빈 값(null) — 일꾼은 빈 값을 받으면 건너뜀으로 끝낸다(INV-N6).
--     예외는 꼭 가는 알림(승인 요청과 그 재알림)뿐이고, 꼭 가는 알림인지는 줄의 종류로 DB 가 정한다 — 앱이 넘기는 값이 아니다.
--   · 계정·통로·꼭 가는 알림 여부를 인자로 받지 않는 이유: 받는 계정은 줄을 만들 때 DB 가 주문에서 골랐다(INV-N3).
--     인자로 받으면 앱 서버의 실수 하나로 남의 연락처나 끈 통로의 연락처를 읽을 수 있다. 「보내는 중」인 줄만 받으므로
--     이 함수로 아무 계정의 연락처나 훑어볼 수도 없다.
--   · 앱 서버 키만 실행한다. 로그인 사용자·익명은 거부(S3b).
-- 0002 의 notification_email(uuid) 은 그대로 둔다(다른 곳에서 쓰지 않지만 지우면 되돌리기가 길어진다).
-- 파일 전체가 한 트랜잭션이다 — 중간에 실패하면 아무것도 남지 않는다.

begin;

-- 마이그레이션이 먼저 적용됐는지 본다. 없으면 여기서 멈춘다.
do $$
begin
  if to_regclass('public.notification_outbox') is null then
    raise exception '발송 대기 줄 표(notification_outbox)가 없다 — 마이그레이션 20261006000009_notifications.sql 을 먼저 적용한다';
  end if;
  if to_regclass('pii.account_contacts') is null then
    raise exception '연락처 표(pii.account_contacts)가 없다 — 0002_account_contacts.sql 을 먼저 적용한다';
  end if;
end $$;

create function public.notification_contact(p_outbox_id uuid)
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
      n.kind = 'approval_request'                       -- 꼭 가는 알림: 칸을 무시한다(결정 d33 ②)
      or (n.channel = 'email' and c.notify_email)
      or (n.channel = 'kakao' and c.notify_kakao)
    );
$$;

revoke all on function public.notification_contact(uuid) from public, anon, authenticated;
grant execute on function public.notification_contact(uuid) to service_role;

commit;
