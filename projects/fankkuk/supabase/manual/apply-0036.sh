#!/usr/bin/env bash
# manual/0036_revgift_box_waitlist.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 사본 삭제 함수에 까닭 「마감 때 고르지 않은 대기 신청」(waitlist_at_close)을 더한다. 지우는 표·데이터 없음.
# 마이그레이션 20261109000040 과 manual 0034 가 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0035 다음, 선물함 대기자 배포와 같은 때).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0036_revgift_box_waitlist.sql"
echo "manual/0036 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts revgift-box-waitlist-db"
