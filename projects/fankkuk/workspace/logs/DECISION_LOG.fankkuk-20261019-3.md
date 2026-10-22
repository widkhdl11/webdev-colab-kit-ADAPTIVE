# 로그인 전 소개 배너 교체

- 사용자 요청: 로그인 전 배너도 아까 GPT로 만든 이미지로 변경.
- 선택 근거: 「메인 페이지에 이미지 배치」 채팅에서 사용자가 첫 번째 배너만 선택한 뒤 「팬꾹 알아보기」 버튼 제거를 요청했다. 최종 파일 `public/images/banners/launch-01-introduction-no-button.png`를 사용한다.
- 자동 결정: 기존 배너 자리에 이미지 한 장, 원본 비율 유지, 버튼·추가 문구 없음. 로그인 전 라우트에서만 사용하며 공유 광고 배너와 운영자 등록 내용은 바꾸지 않는다.
- 이미지 교체 표면만 변경하므로 별도 리뷰어는 생략하고 타입 검사·관련 기존 테스트·실제 화면을 확인한다. Context7 도구는 제공되지 않아 설치된 Next.js의 public-folder 문서를 확인했다.

## 검증 결과

- `npm run typecheck`: 통과.
- `npx vitest run tests/banners-ui.test.tsx tests/follow-row-scroll-ui.test.tsx src/widgets/home/ui/home-page.test.ts`: 3파일 43개 통과.
- `node gates/run-gates.mjs --quick`: 1557개 파일 통과.
- Playwright 비로그인 `/`, 1440·768·390px: 최종 이미지 로드 성공, 원본 2172×724 비율 유지, 가로 넘침 0, 기존 광고 카드 0. 모바일 화면 캡처 확인.
- 로컬 반영이며 배포는 하지 않았다. 이 이미지 교체 후 전체 리뷰 사인오프는 갱신하지 않았다.
