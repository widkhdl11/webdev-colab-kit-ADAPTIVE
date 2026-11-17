#!/usr/bin/env bash
# manual/0040_creator_address_sign.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 크리에이터 주소 등록·변경에 카카오 서명(요청 표·요청/결과 함수), 옛 바로 저장 함수 지움(address-protection INV-P22).
# manual/0030·0037 이 적용돼 있어야 한다(파일 첫 검사가 본다). 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(앱 배포와 같은 때).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0040_creator_address_sign.sql"
echo "manual/0040 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts creator-address-sign-db creator-address-db"
