#!/bin/sh
# 인증서를 새로 받았을 때만: 게이트웨이가 읽는 자리로 복사하고 재시작한다.
# /etc/letsencrypt 는 root 만 읽으므로 서비스 계정이 읽을 사본을 따로 둔다.
set -e
DOMAIN_DIR="${RENEWED_LINEAGE:-$(ls -d /etc/letsencrypt/live/*/ | head -n1)}"
DEST=/etc/sign-gateway/tls
install -d -m 0750 -o root -g sign-gateway "$DEST"
install -m 0640 -o root -g sign-gateway "$DOMAIN_DIR/fullchain.pem" "$DEST/fullchain.pem"
install -m 0640 -o root -g sign-gateway "$DOMAIN_DIR/privkey.pem" "$DEST/privkey.pem"
if systemctl is-enabled --quiet sign-gateway 2>/dev/null; then
  systemctl restart sign-gateway
fi
