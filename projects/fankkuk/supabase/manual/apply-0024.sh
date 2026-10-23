#!/usr/bin/env bash
# manual/0024_address_copy_72h.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 앞서 마이그레이션 20261023000001_reprint_after_close 가 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(마이그레이션 20261023000001 을 먼저).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0024_address_copy_72h.sql"
echo "manual/0024 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts revgift-print-db revgift-close-db revgift-address-db return-address-confirm-db"
