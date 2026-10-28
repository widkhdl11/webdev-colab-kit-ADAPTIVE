#!/usr/bin/env bash
# 게이트웨이 토큰 교체 (root 로 실행). 토큰 값은 화면에 찍지 않는다.
#
#   sudo bash /opt/sign-gateway/scripts/rotate-token.sh start    새 토큰을 GATEWAY_TOKEN_NEXT 에 만든다 — 옛 것·새 것 둘 다 통과
#   (Vercel 의 SIGN_GATEWAY_TOKEN 을 새 값으로 바꾸고 재배포)
#   sudo bash /opt/sign-gateway/scripts/rotate-token.sh finish   새 토큰을 GATEWAY_TOKEN 으로 옮기고 NEXT 를 비운다 — 옛 것은 401
#   sudo bash /opt/sign-gateway/scripts/rotate-token.sh status   지금 어느 단계인지와, 각 토큰이 통과하는지
#
# 새 값 보기(Vercel 에 넣을 때): sudo grep '^GATEWAY_TOKEN_NEXT=' /etc/sign-gateway/sign-gateway.env

set -euo pipefail
ENV_FILE=/etc/sign-gateway/sign-gateway.env
DOMAIN="${SIGN_GATEWAY_DOMAIN:-sign.fankkuk.com}"

[ "$(id -u)" -eq 0 ] || { echo "root 로 실행해야 한다 (sudo)"; exit 1; }

value_of() { awk -F= -v k="$1" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE"; }

# 파일을 통째로 다시 쓴다. 바꿀 값은 환경 변수로 awk 에 넘겨 명령줄(ps)에 올리지 않는다
rewrite() {
  awk '
    $0 ~ /^GATEWAY_TOKEN=/      && ENVIRON["SET_TOKEN"] != ""  { print "GATEWAY_TOKEN=" ENVIRON["SET_TOKEN"]; next }
    $0 ~ /^GATEWAY_TOKEN_NEXT=/ && ENVIRON["SET_NEXT_DEFINED"] == "1" { print "GATEWAY_TOKEN_NEXT=" ENVIRON["SET_NEXT"]; next }
    { print }
  ' "$ENV_FILE" > "$ENV_FILE.tmp"
  chown root:sign-gateway "$ENV_FILE.tmp"
  chmod 0640 "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
}

# 토큰을 헤더 파일로만 curl 에 넘겨 응답 코드를 본다
probe() {
  local token="$1" hdr
  hdr="$(mktemp)"
  chmod 0600 "$hdr"
  printf 'Authorization: Bearer %s\n' "$token" > "$hdr"
  curl -s -o /dev/null -w '%{http_code}' -X POST -H @"$hdr" -H 'content-type: application/json' \
    --data '{}' "https://$DOMAIN/v1/sign/requests" || true
  rm -f "$hdr"
}

report() {
  local current next
  current="$(value_of GATEWAY_TOKEN)"
  next="$(value_of GATEWAY_TOKEN_NEXT)"
  # 400 = 토큰은 통과하고 본문 검사에서 걸림, 401 = 토큰 거부
  echo "GATEWAY_TOKEN       → $(probe "$current") (400 이면 통과, 401 이면 거부)"
  if [ -n "$next" ]; then
    echo "GATEWAY_TOKEN_NEXT  → $(probe "$next")"
    echo "단계: 교체 중 — Vercel 을 새 값으로 바꾼 뒤 finish"
  else
    echo "GATEWAY_TOKEN_NEXT  → (비어 있음)"
    echo "단계: 교체 중 아님"
  fi
}

case "${1:-}" in
  start)
    if [ -n "$(value_of GATEWAY_TOKEN_NEXT)" ]; then
      echo "이미 교체 중이다(GATEWAY_TOKEN_NEXT 가 차 있음) — finish 하거나 그 값을 Vercel 에 넣는다"; exit 1
    fi
    SET_NEXT="$(openssl rand -hex 32)"
    export SET_NEXT SET_NEXT_DEFINED=1
    rewrite
    unset SET_NEXT SET_NEXT_DEFINED
    systemctl restart sign-gateway
    sleep 2
    report
    echo "새 값 보기: sudo grep '^GATEWAY_TOKEN_NEXT=' $ENV_FILE"
    ;;
  finish)
    NEXT="$(value_of GATEWAY_TOKEN_NEXT)"
    [ -n "$NEXT" ] || { echo "GATEWAY_TOKEN_NEXT 가 비어 있다 — start 부터"; exit 1; }
    OLD="$(value_of GATEWAY_TOKEN)"
    export SET_TOKEN="$NEXT" SET_NEXT_DEFINED=1 SET_NEXT=""
    rewrite
    unset SET_TOKEN SET_NEXT SET_NEXT_DEFINED
    systemctl restart sign-gateway
    sleep 2
    report
    echo "옛 토큰        → $(probe "$OLD") (401 이어야 한다)"
    unset OLD NEXT
    ;;
  status)
    report
    ;;
  *)
    echo "사용: sudo bash $0 start|finish|status"; exit 2
    ;;
esac
