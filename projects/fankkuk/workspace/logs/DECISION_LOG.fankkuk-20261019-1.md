# 메인 페이지에 사용자 제공 이미지 배치

- 요청: `external-material-box`의 이미지를 홈페이지에 적절히 사용한다.
- auto | 기존 하늘색·고양이 디자인과 화면 구성을 유지하고 첫 화면, 바로가기, 이용 단계, 약속 안내의 이미지를 교체한다. 새 시각 방향이나 기능 변경은 없다.
- auto | 원본은 유지한다. 투명 배경 WebP를 첫 화면 560×560, 나머지 192×192로 저장한다. 12개 파일 합계 139,508바이트. 화면에서 13곳에 사용한다.
- auto | 로그인 전 메인 페이지에만 적용한다. 공유 약속 부품은 기존 `band` 조건 안에서 이미지를 사용한다.
- 리뷰어 생략: 이미지와 표시 크기만 조정하므로 표면별 규칙의 이미지 조정 절차에 따라 자동 검사와 실제 화면 확인을 수행했다. 도메인·보안·상태 로직과 테스트는 변경하지 않았다.
- 확인: `npm run typecheck` 통과. `npm test -- src/widgets/home/ui/home-page.test.ts` 3개 통과. `node gates/run-gates.mjs --quick` 통과(1557개 파일).
- 화면: `node projects/fankkuk/workspace/check-home-materials.cjs` 통과. 1440·768·390에서 새 이미지 13곳, 깨진 이미지 0, 가로 넘침 없음, 페이지 실행 오류 0. PC·모바일 전체 화면 캡처 확인.
- 환경: Context7 MCP가 제공되지 않아 설치된 Next.js의 `public-folder.md`를 확인했다. Playwright MCP는 기존 브라우저 사용 충돌로 연결되지 않아 로컬 Playwright로 검사했다. 브라우저의 localhost 접근과 Vitest 임시 파일 권한 오류는 승인된 샌드박스 밖 재실행으로 해결했다.
- 기존 작업: 시작 시 수정되어 있던 base.css·card-row-scroller.tsx·front.module.css의 변경을 유지했다. 공용 CSS에는 약속 그림 크기 규칙 한 줄만 더했다. 실행 중 별도로 변경된 .codex/config.toml은 수정하지 않았다.
