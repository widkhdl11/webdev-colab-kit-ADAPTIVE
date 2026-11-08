#!/usr/bin/env bash
# manual/0031_revgift_box_address.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 마이그레이션 20261108000004 와 manual 0005·0019·0030 이 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(마이그레이션 뒤, 선물함 화면을 여는 배포와 같은 때).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0031_revgift_box_address.sql"
echo "manual/0031 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts revgift-box-apply-db"
