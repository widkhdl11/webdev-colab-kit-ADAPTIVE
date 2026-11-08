#!/usr/bin/env bash
# manual/0032_fan_address_removal.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 지우는 것: pii.fan_addresses 표(팬이 설정에 등록한 받을 주소 전부)와 팬 주소 등록·지우기·상태 읽기 함수, 등록 주소를 복사하던 받기·반송 확인 함수.
# manual 0019·0020·0024·0025·0031 과 마이그레이션 20261023000009 가 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0031 다음, 앱 배포와 같은 때).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0032_fan_address_removal.sql"
echo "manual/0032 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts order-return-address-db return-address-confirm-db revgift-address-db fan-address-db"
