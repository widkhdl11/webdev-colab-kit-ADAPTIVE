-- 개인정보 구역(pii) — 사람이 직접 적용한다(.claude/rules/supabase-fankkuk.md).
-- 이 폴더는 supabase/migrations 밖이라 `supabase db reset` 이 자동으로 넣지 않는다.
--
-- 적용(로컬): docker exec -i supabase_db_fankkuk psql -U postgres -d postgres < supabase/manual/0001_pii_schema.sql
-- 확인: anon·authenticated 로 pii 의 어떤 것도 부를 수 없어야 한다(INV-P9).
--   - pii 는 config.toml 의 [api] schemas 에 넣지 않는다 → REST 로 노출되지 않는다.
--   - 그래도 스키마 사용 권한과 표 권한을 같이 걷는다(노출 목록이 실수로 바뀌어도 읽히지 않게).
--
-- 표(실명·휴대폰·주소 암호문)는 계정 스펙·주소 등록 때 이 구역에 만든다. 지금은 구역만 만든다.

create schema if not exists pii;

revoke all on schema pii from public, anon, authenticated;
alter default privileges in schema pii revoke all on tables from public, anon, authenticated;
alter default privileges in schema pii revoke all on sequences from public, anon, authenticated;
alter default privileges in schema pii revoke execute on functions from public, anon, authenticated;
