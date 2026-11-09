#!/usr/bin/env bash
# manual/0035_delivery_copy_drop.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 역조공 몫의 팬 주소 사본을 지우는 때를 배송 단계 설정값에 묶는다(estimate = 출고 + 72시간 그대로, webhook = 배달 완료 + 24시간). 지우는 표·데이터 없음.
# 마이그레이션 20261109000010 과 manual 0032 가 적용돼 있어야 한다(파일 첫 검사가 본다). 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(0034 다음, 배송 조회 연결 배포와 같은 때 — 설정값을 webhook 으로 바꾸기 전).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0035_delivery_copy_drop.sql"
echo "manual/0035 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts delivery-tracking-db"
