#!/usr/bin/env bash
# manual/0033_revgift_box_intake.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 선물함 명세서 생성이 신청 사본의 할증 구분을 읽는 pii 함수를 만들고, 사본 삭제 함수에 까닭 「도착 안 함」을 더한다. 지우는 표·데이터 없음.
# 마이그레이션 20261109000001 과 manual 0031·0032 가 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0032 다음, 선물함 3부 배포와 같은 때).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0033_revgift_box_intake.sql"
echo "manual/0033 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts revgift-box-intake-db"
