#!/usr/bin/env bash
# manual/0038_signup_down_carry.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 크리에이터 가입 장애 대비 길 — 장애 기록을 다음 인증번호 번호표로 넘기고, 장애 기록 시간 기준을 한 함수로. 표·데이터는 바꾸지 않는다.
# manual/0037 이 적용돼 있어야 한다(파일 첫 검사가 본다). 한 트랜잭션이라 실패하면 아무것도 남지 않는다. 마지막 확인 셋이 모두 t 여야 한다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0037 다음).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0038_signup_down_carry.sql"
echo "manual/0038 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts signup-kakao-sign-db"
