#!/usr/bin/env bash
# 게이트웨이의 시험 사이트 표시를 켜고 끈다 (root 로 실행). 켜면 저장된 가짜 서명을 송장 출력 재검증에서 받는다.
#   sudo bash /opt/sign-gateway/scripts/set-test-site.sh on     FANKKUK_TEST_SITE=1 · APP_ORIGIN=시험 사이트 주소
#   sudo bash /opt/sign-gateway/scripts/set-test-site.sh off    둘 다 비운다
# 켜도 SUPABASE_URL 이 코드에 적힌 시험 DB(lib/config.mjs TEST_SITE_SUPABASE_HOSTS)가 아니면 서버가 뜨지 않는다.
# 바꾸는 줄은 그 두 칸뿐이고 다른 칸(비밀 값)은 읽기만 하며 화면에 찍지 않는다.

set -euo pipefail
ENV_FILE=/etc/sign-gateway/sign-gateway.env
TEST_ORIGIN=https://webdev-colab-kit-adaptive-xqne.vercel.app

[ "$(id -u)" -eq 0 ] || { echo "root 로 실행해야 한다 (sudo)"; exit 1; }
case "${1:-}" in
  on)  export SET_SITE=1 SET_ORIGIN="$TEST_ORIGIN" ;;
  off) export SET_SITE="" SET_ORIGIN="" ;;
  *)   echo "사용: sudo bash $0 on|off"; exit 2 ;;
esac

awk '
  BEGIN { site = 0; origin = 0 }
  /^FANKKUK_TEST_SITE=/ { print "FANKKUK_TEST_SITE=" ENVIRON["SET_SITE"]; site = 1; next }
  /^APP_ORIGIN=/        { print "APP_ORIGIN=" ENVIRON["SET_ORIGIN"]; origin = 1; next }
  { print }
  END {
    if (!site) print "FANKKUK_TEST_SITE=" ENVIRON["SET_SITE"]
    if (!origin) print "APP_ORIGIN=" ENVIRON["SET_ORIGIN"]
  }
' "$ENV_FILE" > "$ENV_FILE.tmp"
chown root:sign-gateway "$ENV_FILE.tmp"
chmod 0640 "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

systemctl restart sign-gateway
sleep 2
if systemctl is-active --quiet sign-gateway; then
  echo "시험 사이트 표시: $1 — 서비스 정상"
else
  echo "서비스가 뜨지 않았다 — sudo journalctl -u sign-gateway -n 5 --no-pager"
  exit 1
fi
