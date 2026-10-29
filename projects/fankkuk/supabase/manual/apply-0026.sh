#!/usr/bin/env bash
# manual/0026_phone_sms_code.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 0004·0013·0018 이 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(앱 배포와 같은 때 — 한쪽만 있으면 인증번호 요청이 막힌다).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0026_phone_sms_code.sql"
echo "manual/0026 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts phone-code-db signup-db phone-change account-routes"
