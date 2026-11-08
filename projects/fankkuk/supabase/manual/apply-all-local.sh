#!/usr/bin/env bash
# 로컬 DB 를 db reset 으로 새로 깐 뒤, 개인정보 구역 수동 SQL 을 번호순으로 모두 넣는다 — 사람이 직접 실행한다(에이전트는 실행하지 않는다).
# 순서: 0001 → 0002 → 0002 로컬 시험 계정(local-seed) → 0003 … 0027 → 0028 두 개 → 번호 암호화 변환(.env.local 의 키 사용) → 0029 → 0030 → 0031.
# 파일마다 한 트랜잭션이라 실패하면 그 파일은 아무것도 남지 않고, 스크립트는 거기서 멈춘다(어느 파일인지 출력한다).
# 운영·시험 사이트에는 쓰지 않는다 — 그쪽 순서는 docs/deploy-runbook.md.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
cd "$root"

apply() {
  echo "== $(basename "$1")"
  docker exec -i supabase_db_fankkuk psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$1" > /dev/null
}

for f in $(ls "$here"/*.sql | grep -v -e local-seed -e check-applied -e purge-keep-review-account -e 0029_ -e 0030_ -e 0031_ | sort); do
  apply "$f"
  if [[ "$(basename "$f")" == 0002_account_contacts.sql ]]; then
    apply "$here/0002_account_contacts.local-seed.sql"
  fi
done

echo "== 번호 암호화 변환"
node --env-file=.env.local scripts/phone-encrypt-backfill.mjs

apply "$here/0029_phone_plaintext_drop.sql"
apply "$here/0030_surcharge_region.sql"
apply "$here/0031_revgift_box_address.sql"
echo "수동 SQL 모두 적용됨 — 에이전트에게 「적용했어」라고 알려 주면 통합 시험을 돌린다."
