#!/usr/bin/env bash
# manual/0037_signup_kakao_sign.sql 을 로컬 Supabase DB 에 적용한다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 하는 일: 크리에이터 가입 3단계 카카오 서명 — 가입 서명 요청 표(pii.signup_sign_requests)·번호표 칸 셋·연결 칸 하나·함수(계정 만들기·인증번호 요청·번호 바꾸기 포함)·10분마다 정리 작업.
# 지우는 표·데이터 없음. 마이그레이션 20261110000040 과 manual 0027·0028(둘)·0029 가 적용돼 있어야 한다(파일 첫 검사가 본다).
# 파일이 한 트랜잭션이라 실패하면 아무것도 남지 않는다. 마지막 확인 넷이 모두 t 여야 한다.
# 운영 DB 는 Supabase SQL 편집기에 파일 내용을 그대로 붙여 넣어 적용한다(마이그레이션 20261110000040 과 같은 때, 앱 배포 전).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 < "$here/0037_signup_kakao_sign.sql"
echo "manual/0037 적용됨 — 확인: npx vitest run --config vitest.integration.config.mts signup-kakao-sign-db"
