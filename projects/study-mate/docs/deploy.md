# study-mate 배포 환경

- 호스트: AWS EC2, Ubuntu 24.04, 프로젝트 경로 ~/project/study-mate
- 구성: docker compose — study-mate-app(3000) + study-mate-nginx(80/443 리버스 프록시)
- 도메인: w-neocode.com (www 미포함)
- 인증서: Let's Encrypt, certbot standalone 방식으로 발급
  - 경로: /etc/letsencrypt/live/w-neocode.com/ (nginx 컨테이너에 마운트)
  - 갱신: certbot.timer 하루 2회. 만료 30일 전부터 시도
  - 갱신 훅: /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh, post/start-nginx.sh
    (standalone 은 80 포트가 비어야 하므로 갱신 전후 nginx 를 내렸다 올림)
- 로컬 실행 불가: compose 파일이 위 인증서 경로를 요구함 (서버 전용)
- 알려진 사고: 2026-09-15 갱신 훅 없이 운영되어 갱신이 실패하게 되어 있었음. 훅 추가로 해결