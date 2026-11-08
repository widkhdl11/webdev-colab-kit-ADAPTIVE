#!/usr/bin/env bash
# manual/0034_revgift_box_settle.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 선물함 송장 출력 때 신청 사본(봉인)을 내주는 함수를 만들고, 사본 삭제 함수에 까닭 「미결제 반송」·「출고 + 72시간」을 더한다. 지우는 표·데이터 없음.
# 마이그레이션 20261109000002 와 manual 0031·0032·0033 이 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0033 다음, 선물함 4부 배포와 같은 때).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0034_revgift_box_settle.sql"
echo "manual/0034 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts revgift-box-settle-db"
