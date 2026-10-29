# 문구 4 크리에이터 화면 로컬 교체 — 2026-10-27

사용자 요청: 4번도 교체한다. 기존 지시에 따라 로컬에서 확인하고 반영 여부를 결정하며 커밋·푸시·배포하지 않는다.

## 결정

- 원본 339개 항목 중 수정본과 다른 178개 항목을 대조해 크리에이터 홈·승인 내역·선물 현황·받은 선물·할 일·주소 열람 기록·역조공 신청과 보낸 내역에 반영했다.
- 이름·건수·기한·가격·상자 크기는 기존 데이터와 상수에서 표시한다. 줄바꿈은 실제 화면 줄바꿈으로 바꿨다.
- 역조공의 ‘배송비와 검수 포함’을 ‘배송비 포함 · 검수비 제외’로 고쳤다. reverse-gift INV-R3·R11 및 payment INV-M7·M8의 기존 검수비 제외·반송 택배비 차감·결제 후 30일 환불 보류 규칙과 대조했다. 정책과 요금 계산은 바꾸지 않았다.
- 공통 안내는 1·3번에서 반영한 뜻이 같은 문구를 유지했다. 송장·주소 확인·반송 안내 등 같은 부품을 쓰는 화면에는 공통 문구 변경이 함께 반영된다.
- 답장 공개 안내에 ‘크리에이터가 답장 모음 보이기를 켠 경우’라고 주체를 명시했다. 공개 조건과 3일 기한은 그대로다.
- 문구와 줄바꿈만 바꾸고 기존 문자열 단언·버튼 검색명을 갱신했다. 동작·권한·상태 판정·입력 구조는 변경하지 않았으므로 별도 UX·UI·도메인·보안 리뷰어는 파견하지 않았다.

## 검증

- `npm run typecheck`: 종료 코드 0.
- `npm run copy:lint`: 종료 코드 0, 금지어 0건.
- 킷 루트 `node gates/run-gates.mjs --quick`: 1,635개 파일 검사 통과. 다른 프로젝트의 기존 예외 경고 유지.
- 아래 기존 테스트 명령: 47개 파일, 457개 테스트 통과. 초기 실패는 옛 문구·버튼 이름 단언을 갱신해 해결했다. 결과는 workspace/copy-creator-20261027/test-results.json에 저장했다.

```powershell
npm test -- src/widgets/home src/widgets/approval-requests src/widgets/creator-gift-progress src/widgets/creator-action-center src/widgets/access-log src/widgets/revgift-sent src/widgets/revgift-send src/widgets/action-center src/widgets/gift-status src/widgets/revgift-receive src/features/approval-request src/features/gift-reply src/features/creator-check src/features/creator-address src/features/revgift-send src/features/box-waybill src/features/return-address src/features/checkout src/entities/order/model/prior-history src/entities/payment src/entities/address/ui/address-on-file-text src/entities/gift-reply src/entities/action-item src/features/notification-dispatch/lib/notification-body.test.ts --reporter=json --outputFile=workspace/copy-creator-20261027/test-results.json
```

- 로컬 /creator를 브라우저에서 열었으나 로그인 화면으로 이동했다. 로그인한 크리에이터 화면의 실제 배치는 직접 확인하지 못했다. 기존 렌더·상호작용 테스트로 확인했다.
- 새 라이브러리·API·설정을 도입하지 않았다. Next.js 로컬 Fast Refresh 문서를 확인했다.

변경 전 사본과 이번 작업만의 차이는 workspace/copy-creator-20261027/before 및 local-copy.diff에 있다. 이전 문구 1·3 작업은 유지했다. 커밋·푸시·배포하지 않았다.
