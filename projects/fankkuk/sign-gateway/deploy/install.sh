#!/usr/bin/env bash
# 서명 게이트웨이 설치·갱신 스크립트 (Ubuntu 24.04 이상, root 로 실행)
#
#   sudo bash deploy/install.sh <도메인>
#   예: sudo bash /tmp/sign-gateway/deploy/install.sh sign.fankkuk.com
#
# 여러 번 돌려도 된다. 이미 있는 환경 변수 파일과 인증서는 건드리지 않고, 코드·서비스 파일·훅만 새로 깐다.
# 도메인의 A 레코드가 이 서버를 가리키고 있어야 인증서를 받는다.

set -euo pipefail

DOMAIN="${1:?사용법: sudo bash deploy/install.sh <도메인>}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/opt/sign-gateway
ETC_DIR=/etc/sign-gateway
ENV_FILE="$ETC_DIR/sign-gateway.env"
SERVICE_USER=sign-gateway
HOOK_ROOT=/etc/letsencrypt/renewal-hooks

log() { printf '\n== %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "root 로 실행해야 한다 (sudo)"; exit 1; }

log "패키지 설치 (nodejs·certbot·ufw·unattended-upgrades)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nodejs certbot ufw unattended-upgrades
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node $NODE_MAJOR 은 너무 낮다 (20 이상 필요)"; exit 1
fi
echo "node $(node --version)"
# 보안 업데이트는 자동으로 깐다
dpkg-reconfigure -f noninteractive unattended-upgrades

log "스왑 1GB (메모리 512MB 급 인스턴스에서 apt 가 죽지 않게)"
if ! swapon --show | grep -q '/swapfile'; then
  if [ ! -f /swapfile ]; then
    fallocate -l 1G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "서비스 계정"
id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"

log "코드 복사 → $APP_DIR"
install -d -m 0755 "$APP_DIR"
rm -rf "$APP_DIR/lib" "$APP_DIR/scripts" "$APP_DIR/dist"
cp -r "$SRC_DIR/lib" "$SRC_DIR/scripts" "$SRC_DIR/server.mjs" "$SRC_DIR/package.json" "$APP_DIR/"
# 송장 출력 함수 묶음 — 내 PC 에서 scripts/build-decryptor.mjs 로 만든 것. 없으면 송장 출력만 503 이다
if [ -f "$SRC_DIR/dist/decryptor.mjs" ]; then
  cp -r "$SRC_DIR/dist" "$APP_DIR/"
else
  echo "경고: dist/decryptor.mjs 가 없다 — 송장 출력은 준비되지 않는다 (PC 에서 node sign-gateway/scripts/build-decryptor.mjs)"
fi
if [ ! -f "$APP_DIR/lib/vendor/eziok_Key_Manager.cjs" ]; then
  echo "경고: lib/vendor/eziok_Key_Manager.cjs 가 없다 — 드림시큐리티 서명은 준비되지 않는다 (README 「드림시큐리티 연동 모듈」)"
fi
find "$APP_DIR/scripts" -name '*.sh' -exec sed -i 's/\r$//' {} +
chown -R root:root "$APP_DIR"
find "$APP_DIR" -type d -exec chmod 0755 {} +
find "$APP_DIR" -type f -exec chmod 0644 {} +

log "환경 변수 파일 → $ENV_FILE"
install -d -m 0750 -o root -g "$SERVICE_USER" "$ETC_DIR"
if [ ! -f "$ENV_FILE" ]; then
  # Windows 에서 올린 파일이면 줄 끝의 \r 을 지운다
  sed 's/\r$//' "$SRC_DIR/deploy/sign-gateway.env.example" > "$ENV_FILE"
  echo "새로 만듦 (드림시큐리티·카카오·KMS 칸은 비어 있음)"
else
  echo "이미 있음 — 있는 값은 그대로 두고, 틀에 새로 생긴 칸만 끝에 덧붙인다"
  ADDED="$(sed 's/\r$//' "$SRC_DIR/deploy/sign-gateway.env.example" | awk -F= '
    NR == FNR { have[$1] = 1; next }
    /^[A-Z_]+=/ && !($1 in have) { print }
  ' "$ENV_FILE" -)"
  if [ -n "$ADDED" ]; then
    printf '\n# ── %s 설치 때 덧붙인 칸 ──\n%s\n' "$(date +%F)" "$ADDED" >> "$ENV_FILE"
    echo "덧붙인 칸: $(printf '%s\n' "$ADDED" | cut -d= -f1 | paste -sd' ')"
  fi
fi
if grep -q '^GATEWAY_TOKEN=__FILL_ME__$' "$ENV_FILE"; then
  # 토큰을 명령줄 인자로 넘기지 않는다(다른 계정의 ps 에 보인다) — 환경 변수로 awk 에 넘긴다
  NEW_TOKEN="$(openssl rand -hex 32)" awk '
    $0 == "GATEWAY_TOKEN=__FILL_ME__" { print "GATEWAY_TOKEN=" ENVIRON["NEW_TOKEN"]; next } { print }
  ' "$ENV_FILE" > "$ENV_FILE.tmp"
  chmod 0640 "$ENV_FILE.tmp"
  mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "GATEWAY_TOKEN 을 무작위로 만들었다 (화면에 출력하지 않음 — sudo grep ^GATEWAY_TOKEN= $ENV_FILE)"
fi
chown root:"$SERVICE_USER" "$ENV_FILE"
chmod 0640 "$ENV_FILE"
# 주소 봉인 공개키(KMS 에서 내려받은 것) — 공개해도 되는 값이고, KMS 자체 시험이 쓴다
install -m 0644 -o root -g root "$SRC_DIR/deploy/sealing-public-key.pem" "$ETC_DIR/sealing-public-key.pem"

log "방화벽 (ufw): 22·443 만 들어온다. 80 은 인증서 갱신 때만 잠깐 열린다"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp comment 'ssh' >/dev/null
ufw allow 443/tcp comment 'sign-gateway' >/dev/null
ufw delete allow 80/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null
ufw status verbose

log "인증서 갱신 훅"
for kind in pre post deploy; do install -d -m 0755 "$HOOK_ROOT/$kind"; done
sed 's/\r$//' "$SRC_DIR/deploy/letsencrypt-hooks/pre-open-80.sh" > "$HOOK_ROOT/pre/sign-gateway-open-80.sh"
sed 's/\r$//' "$SRC_DIR/deploy/letsencrypt-hooks/post-close-80.sh" > "$HOOK_ROOT/post/sign-gateway-close-80.sh"
sed 's/\r$//' "$SRC_DIR/deploy/letsencrypt-hooks/deploy-install-cert.sh" > "$HOOK_ROOT/deploy/sign-gateway-install-cert.sh"
chmod 0755 "$HOOK_ROOT"/pre/sign-gateway-open-80.sh "$HOOK_ROOT"/post/sign-gateway-close-80.sh "$HOOK_ROOT"/deploy/sign-gateway-install-cert.sh

log "systemd 서비스"
sed 's/\r$//' "$SRC_DIR/deploy/sign-gateway.service" > /etc/systemd/system/sign-gateway.service
chmod 0644 /etc/systemd/system/sign-gateway.service
systemctl daemon-reload
systemctl enable sign-gateway >/dev/null

log "Let's Encrypt 인증서 ($DOMAIN)"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  # 처음 받을 때는 갱신 훅 폴더가 돌지 않으므로 같은 스크립트를 직접 감싼다
  "$HOOK_ROOT/pre/sign-gateway-open-80.sh"
  trap '"$HOOK_ROOT/post/sign-gateway-close-80.sh"' EXIT
  certbot certonly --standalone --non-interactive --agree-tos \
    --register-unsafely-without-email --key-type ecdsa -d "$DOMAIN"
  "$HOOK_ROOT/post/sign-gateway-close-80.sh"
  trap - EXIT
else
  echo "이미 있음"
fi
RENEWED_LINEAGE="/etc/letsencrypt/live/$DOMAIN" "$HOOK_ROOT/deploy/sign-gateway-install-cert.sh"
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
systemctl list-timers certbot.timer --no-pager || true

log "서비스 시작"
systemctl restart sign-gateway
sleep 2
systemctl --no-pager --lines=5 status sign-gateway || true

log "확인"
curl -fsS "https://$DOMAIN/healthz" && echo
ufw status | grep -E '^(80|443|22)' || true
echo "나가는 IP: $(curl -fsS https://checkip.amazonaws.com)"
