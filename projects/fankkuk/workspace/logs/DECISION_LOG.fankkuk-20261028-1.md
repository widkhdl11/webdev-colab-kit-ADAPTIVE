# 문구 5 공통·상태·오류·메일 로컬 교체 — 2026-10-28

사용자 요청: 5번도 교체하고 사용량 제한으로 멈춘 작업을 이어서 완료한다. 로컬 확인 후 반영 여부를 결정한다는 기존 지시를 유지한다.

## 결정과 반영

- 수정본 236개 항목을 대조했다. 기존 원본과 다른 132개 항목을 기준으로 공통 상태·입력 오류·필수 알림·배너·404·메일 템플릿을 교체했다.
- 수정본에 없는 원본의 뒤쪽 57개 항목은 별도 교체하지 않았다. 공통 상태 상수와 메일 하단 안내를 공유하는 곳에는 변경이 함께 반영된다.
- 송장 등록·출고·배송 완료를 구분하고, 반송 대상과 반송 완료를 구분했다. 수령 여부 확인 기한은 기존 검수 완료 시점을 기준으로 유지했다.
- 금액·기한·수신자·공개 조건·발송 조건·권한·상태 판정은 변경하지 않았다. 실제 메일은 보내지 않았다.
- 용어집에 따라 ‘송장’을 사용했다. 이전 1·3·4번에서 다듬은 뜻이 같은 문구는 유지했다.
- 기존 테스트의 이전 문구 단언을 새 문구에 맞췄다. 동작 검증 조건은 유지했다. 카피만 변경해 UX·UI·도메인·보안 리뷰어는 별도 파견하지 않았다.

## 검증

- `npm run typecheck`: 종료 코드 0.
- `npm run copy:lint`: 종료 코드 0, 금지어 0건.
- 킷 루트 `node gates/run-gates.mjs --quick`: 1,635개 파일 검사 통과. 다른 프로젝트의 기존 예외 경고 유지.
- 전체 Vitest 실행 결과: 326개 파일, 2,705개 테스트 중 2,692개 통과·13개 실패. 이전 문구 단언을 수정하고 실패 파일을 재실행했다. 카카오 인증 경로 검사의 실행 오류도 재실행에서 통과했다.
- 아래 재실행은 199개 중 198개 통과. 남은 크리에이터 홈 상태 단언을 수정한 뒤 마지막 명령이 종료 코드 0으로 통과했다.

```powershell
npm test -- tests/kakao-egress.test.ts tests/banners-ui.test.tsx tests/creator-action-center-routes.test.tsx tests/profile-single-send-ui.test.tsx src/features/gift-register/ui/register-form.test.tsx src/entities/gift-item/model/hard-items.test.ts src/entities/revgift/ui/received-status.test.ts src/features/notification-dispatch --maxWorkers=4 --reporter=json --outputFile=workspace/copy-common-20261027/recheck-results.json
npm test -- tests/creator-action-center-routes.test.tsx --maxWorkers=4 --reporter=json --outputFile=workspace/copy-common-20261027/final-recheck-results.json
```

- `workspace/copy-common-20261027/`의 `test-results.json`, `recheck-results.json`, `final-recheck-results.json`을 파일별 마지막 결과로 합산: 326개 파일, 2,705개 통과, 실패 0개. 한 번의 전체 실행이 모두 통과했다는 뜻은 아니다.
- 로컬 `/copy-review-not-found`에서 새 404 제목·본문·링크를 브라우저로 확인했다. 로그인한 화면은 실제 배치를 직접 확인하지 못했고 렌더·상호작용 테스트로 확인했다.

교체 비교 자료와 변경 전 사본은 `workspace/copy-common-20261027/`에 보관했다. 커밋·푸시·배포하지 않았다.
