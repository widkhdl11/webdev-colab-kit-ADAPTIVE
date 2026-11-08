#!/usr/bin/env bash
# manual/0030_surcharge_region.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 마이그레이션 20261108000001 과 0017·0019 가 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(앱 배포와 같은 때 — 옛 앱의 주소 저장은 이 파일 뒤에 실패한다).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0030_surcharge_region.sql"
echo "manual/0030 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts surcharge-region-db creator-address-db fan-address-db"
