# 늦게 오는 상자 (B8·B9·C10·E10) — 하다 멈춘 자리 (2026-10-10)

- 스펙은 고쳤다: payment INV-M8·M9·M16·M17·M18, inbound-address-code INV-C3, decline-block INV-D3, office-workflow INV-W10, notifications INV-N17, reverse-gift INV-R11.
- 통합 시험도 새 스펙으로 고쳤다(빨간불 확인 전): partial-reject-db, cancel-db, inbound-code-db, revgift-close-db (+ revgift-helpers keptSince).
- 남은 일:
  1. 마이그레이션 20261010000003_late_box.sql — `mk_latebox.py <출력 경로>` 로 만든다. 먼저 DB 에서 현재 함수 정의를 `fndefs/<이름>.sql` 로 내려받아야 한다
     (office_run_expiry admin_cancel_received_gift admin_payment_rows admin_pending_boxes my_share_boxes — pg_get_functiondef). 스크립트의 D 경로를 그 폴더로 바꾼다.
  2. 시험 먼저 돌려 빨간불 확인 → 적용 → 초록. 다른 역조공 환불 시험(admin-refund-db·admin-refund-retry 의 reply='declined' 직접 갱신)은 keptSince 로 닫은 뒤 환불을 봐야 한다.
  3. 알림 본문 gift_pending_box 문구(notification-body.ts), 선물 상세 안내 문구(gift-status-page), 팬 취소 묻는 칸 문구.
  4. B16(확인 필요 → 차액 결제 요청 / 전액 취소·재결제 버튼), A4(태그 공개 + 금칙어 필터) 는 아직 손대지 않았다.
