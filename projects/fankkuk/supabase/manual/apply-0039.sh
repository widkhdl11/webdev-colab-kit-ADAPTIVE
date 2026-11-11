#!/usr/bin/env bash
# manual/0039_creator_signup_no_nickname.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 크리에이터 가입은 닉네임 없이 계정을 만든다(채널 만들기 단계로 옮김). 표·데이터는 바꾸지 않는다.
# manual/0038 과 migrations/20261111000040 이 적용돼 있어야 한다(파일 첫 검사가 본다). 한 트랜잭션이라 실패하면 아무것도 남지 않는다. 마지막 확인이 t 여야 한다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0038·마이그레이션 다음).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0039_creator_signup_no_nickname.sql"
echo "manual/0039 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts creator-channel-create-db"
