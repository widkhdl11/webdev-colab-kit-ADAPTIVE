import type { AddressAccessEntry } from "../model/access-log";

// 예시 데이터 — 크리에이터 「주소 열람 기록」 화면. DB 전에 화면을 보기 위한 것이고 주문번호는 지어낸 값이다.
// 주소 값은 담지 않는다 — 기록에는 원래 주소가 없다(INV-P10).

/** 예시 화면의 「이번 달」. 승인 건수는 열람 기록이 아니라 승인 기록에서 오는 숫자라 따로 둔다. */
export const SAMPLE_ACCESS_MONTH = { label: "2026년 9월", approvedCount: 6 } as const;

/** 예시 크리에이터(하루)의 이번 달 열람 기록. 최근 순. */
export const SAMPLE_ACCESS_LOG: readonly AddressAccessEntry[] = [
  { at: "2026-09-30T05:32:00.000Z", orderNo: "FC-4T7NX", requester: "owner", result: { kind: "opened", printNo: 1 } },
  { at: "2026-09-29T07:08:00.000Z", orderNo: "FC-9B2KR", requester: "owner", result: { kind: "opened", printNo: 2 } },
  { at: "2026-09-29T06:41:00.000Z", orderNo: "FC-9B2KR", requester: "owner", result: { kind: "opened", printNo: 1 } },
  { at: "2026-09-28T01:05:00.000Z", orderNo: "FC-6H3LM", requester: "owner", result: { kind: "opened", printNo: 1 } },
  { at: "2026-09-26T09:20:00.000Z", orderNo: "FC-3W8DY", requester: "owner", result: { kind: "denied", reason: "order_not_printable" } },
  { at: "2026-09-24T04:12:00.000Z", orderNo: "FC-3W8DY", requester: "owner", result: { kind: "opened", printNo: 1 } },
  { at: "2026-09-19T02:47:00.000Z", orderNo: "FC-8Q5ZE", requester: "owner", result: { kind: "opened", printNo: 1 } },
  { at: "2026-09-12T08:03:00.000Z", orderNo: "FC-1R6VA", requester: "owner", result: { kind: "opened", printNo: 1 } },
];
