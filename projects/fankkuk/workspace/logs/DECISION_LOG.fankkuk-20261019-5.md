# 배송 요금 안내 문구와 박스 이미지

- 사용자 문구를 그대로 반영: 「배송 요금 안내」·「박스 크기와 무게에 따라 선택해주세요.」
- 자동 결정: 제공 자료 `크기별 선물 상자 이미지.png`를 사용하며 각 카드에는 해당 상자 영역만 SVG viewBox로 표시한다. 원본 픽셀은 수정하지 않는다. 소형·중형·대형의 그림 아래 선과 가격 줄을 맞춘다.
- 공통 요금 안내 부품을 고쳐 로그인 전·후에 적용. 요금·판정·결제 상태는 변경하지 않는다. 카피·이미지 조정이므로 별도 리뷰어·새 테스트는 생략한다.
- 검증: `npm run typecheck` 통과. `npx vitest run tests/banners-ui.test.tsx tests/follow-row-scroll-ui.test.tsx src/widgets/home/ui/home-page.test.ts` 45개 통과. `node gates/run-gates.mjs --quick` 1558개 파일 통과.
- Playwright `/home#price`: 1440·390px에서 요청 문구, 상자 그림 3개, 가로 넘침 0 확인. PC와 휴대폰 캡처에서 그림 분리와 정렬 확인.
