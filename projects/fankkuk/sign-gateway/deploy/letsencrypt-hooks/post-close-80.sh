#!/bin/sh
# certbot 이 끝난 뒤(성공·실패 상관없이): 80 을 다시 닫는다
ufw delete allow 80/tcp >/dev/null 2>&1 || true
