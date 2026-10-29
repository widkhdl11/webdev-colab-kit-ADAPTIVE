#!/usr/bin/env bash
# manual/0027_signature_link.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 0005·0025·0026 이 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 로컬 DB 에는 가짜 서명 허용 줄이 있어 시드 크리에이터가 시험 서명(fake)으로 연결된 상태로 들어간다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(앱 배포와 같은 때 — 운영의 기존 크리에이터는 모두 연결 전으로 시작해 새 주문이 막힌다).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0027_signature_link.sql"
echo "manual/0027 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts signature-link-db account-withdrawal-db creator-incoming-db admin-lists-db"
