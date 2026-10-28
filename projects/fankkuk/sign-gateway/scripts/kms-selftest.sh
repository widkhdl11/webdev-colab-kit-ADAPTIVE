#!/usr/bin/env bash
# KMS 자체 시험을 서비스와 같은 계정·환경 변수·네트워크 제한으로 돌린다 (root 로 실행)
#   sudo bash /opt/sign-gateway/scripts/kms-selftest.sh [공개키 PEM 경로]
set -euo pipefail
exec systemd-run --quiet --wait --pipe --collect \
  -p User=sign-gateway -p Group=sign-gateway \
  -p EnvironmentFile=/etc/sign-gateway/sign-gateway.env \
  -p "IPAddressDeny=169.254.0.0/16 fd00:ec2::254/128" \
  -p NoNewPrivileges=true -p ProtectSystem=strict -p ProtectHome=true \
  /usr/bin/node /opt/sign-gateway/scripts/kms-selftest.mjs "$@"
