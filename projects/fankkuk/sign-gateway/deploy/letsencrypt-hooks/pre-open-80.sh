#!/bin/sh
# certbot 이 인증서를 받거나 갱신하기 직전: http-01 확인용으로 80 을 잠깐 연다
set -e
ufw allow 80/tcp comment 'certbot http-01 (temporary)' >/dev/null
