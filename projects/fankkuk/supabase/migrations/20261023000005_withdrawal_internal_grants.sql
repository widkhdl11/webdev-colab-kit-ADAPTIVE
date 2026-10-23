-- 탈퇴 처리 안쪽 함수 둘의 실행 권한을 서버 키에서도 거둔다 (2026-10-23 보안 리뷰 — my-account INV-A15, approval-signature INV-S14).
--
-- 20261023000002 는 두 함수의 실행 권한을 public·anon·authenticated 에서만 거뒀다. Supabase 는 새 함수의 실행 권한을 서버 키(service_role)에도 주므로
-- 서버 키로 withdrawal_toggle_append_only 를 한 번 부르면 아무 표의 「고치거나 지울 수 없다」 트리거가 꺼진 채 커밋되고 다시 켜지지 않는다
-- (서명 기록을 고칠 수 있게 된다). 두 함수는 withdraw_account·retention_purge 안에서만 쓰고, 그 함수들은 정의한 계정(security definer)으로 부르므로
-- 거둬도 동작은 그대로다. 같은 파일의 다른 내부 함수(retention_purge·order_ended_at)와 같은 꼴로 맞춘다.

revoke all on function public.withdrawal_toggle_append_only(regclass, boolean) from public, anon, authenticated, service_role;
revoke all on function public.account_has_open_work(uuid, uuid) from public, anon, authenticated, service_role;
