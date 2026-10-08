-- 5분마다 저절로 도는 일 (office-workflow INV-W11 · notifications INV-N16, 정책 질문 ⑪ 「추천대로」 — 카드 d49).
-- 지금까지 시간 규칙(7일 반려·30일 닫기 등)과 알림 발송은 운영자의 「지금 돌리기」·「알림 지금 보내기」로만 돌았다.
--
-- 1) 확장: pg_cron(예약 작업) · pg_net(DB 에서 HTTP 요청). Supabase 무료 요금제에서도 쓸 수 있다.
-- 2) office_run_scheduled() — 자동 처리. 예약 작업 실행자(postgres)만 부른다(누구에게도 실행 권한을 주지 않는다).
--    승인 요청 3일 재알림 줄 넣기는 보내는 일꾼이 꺼내기 전에 매번 하므로 여기서 하지 않는다 — 같이 두면 그쪽 실패가 자동 처리 전체를 되돌린다.
--    실패하면 그 회차 전체가 되돌려지고 cron.job_run_details 에 오류가 남는다. 다음 회차가 다시 시도한다.
--    자동 처리 함수의 운영자 판정은 그대로 두고, 이 함수 안에서만 이 처리의 요청 정보를 앱 서버 키로 둔다 — 앱 경로(로그인 토큰)로는 열 수 없다.
-- 3) schedule_dispatch_notifications() — 비밀 보관소(vault)의 앱 주소(fankkuk_app_origin)와 비밀 값(fankkuk_schedule_secret, 32자 이상)으로
--    앱의 예약 발송 입구(/api/cron/notifications)를 부른다. 둘 중 하나라도 없거나 짧으면 부르지 않고 null.
--    주소는 https 만 — http 는 로컬 주소(localhost·127.0.0.1·host.docker.internal)일 때만. 비밀 값이 암호화 없이 나가지 않게.
--    요청 머리(비밀 값 포함)는 pg_net 이 보낼 때까지 net.http_request_queue 에 남는다 — net 스키마는 API 에 노출되지 않아 DB 에 직접 붙는 역할만 본다.
--    비밀 값은 이 파일·작업 명령에 쓰지 않는다 — 보관소에 손으로 넣는다(배포 때 할 일: docs/BACKLOG.md 「예약 실행 켜기」).
-- 4) 예약 작업 둘: fankkuk-expiry · fankkuk-notify, 5분마다. 같은 이름으로 다시 등록하면 덮어쓴다(다시 돌려도 하나).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 2) 자동 처리 ──────────────────────────────────

create function public.office_run_scheduled()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- 이 처리 안에서만(트랜잭션 범위) 요청 정보를 앱 서버 키로 둔다 — 자동 처리 함수의 운영자 판정을 그대로 통과시키려고.
  -- 이 함수는 실행 권한을 아무에게도 주지 않아, 예약 작업 실행자(postgres) 말고는 부를 수 없다.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_result := public.office_run_expiry(null);
  return v_result;
end $$;

revoke all on function public.office_run_scheduled() from public, anon, authenticated, service_role;

-- ── 3) 알림 발송 부르기 ──────────────────────────────────

create function public.schedule_dispatch_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_origin text;
  v_secret text;
begin
  select s.decrypted_secret into v_origin from vault.decrypted_secrets s where s.name = 'fankkuk_app_origin';
  select s.decrypted_secret into v_secret from vault.decrypted_secrets s where s.name = 'fankkuk_schedule_secret';
  if v_origin is null or v_secret is null or char_length(v_secret) < 32
     or not (v_origin ~ '^https://[^/?#@]+$' or v_origin ~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{1,5})?$') then
    return null;
  end if;
  return net.http_post(
    url := v_origin || '/api/cron/notifications',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end $$;

revoke all on function public.schedule_dispatch_notifications() from public, anon, authenticated, service_role;

-- ── 4) 예약 작업 ──────────────────────────────────

select cron.schedule('fankkuk-expiry', '*/5 * * * *', 'select public.office_run_scheduled()');
select cron.schedule('fankkuk-notify', '*/5 * * * *', 'select public.schedule_dispatch_notifications()');
