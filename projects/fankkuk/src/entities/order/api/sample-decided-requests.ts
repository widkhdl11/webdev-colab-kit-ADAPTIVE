// 예시 데이터 — 크리에이터 「처리한 요청」 탭. DB 전에 화면을 보기 위한 것이고 닉네임은 지어낸 값이다.
import type { DecidedRequestView } from "../model/decided-request";

// 승인 요청 모양(ApprovalRequestView)처럼 크리에이터가 봐도 되는 것만 담는다 — 팬 송장번호·결제 정보·주소는 없다.

/** 예시 크리에이터(하루)가 처리한 요청. 최근 순. */
export const SAMPLE_DECIDED_REQUESTS: readonly DecidedRequestView[] = [
  { orderNo: "FC-9B2KR", fanNickname: "도토리", itemKind: "수제 쿠키 세트", boxCount: 1, outcome: "approved", decidedAt: "2026-09-27T05:10:00.000Z" },
  { orderNo: "FC-5L4GT", fanNickname: "라떼한잔", itemKind: "인형", boxCount: 1, outcome: "declined", decidedAt: "2026-09-25T08:30:00.000Z" },
  { orderNo: "FC-3N8HU", fanNickname: "잠꾸러기", itemKind: "스티커 묶음", boxCount: 1, outcome: "blocked", decidedAt: "2026-09-20T03:00:00.000Z" },
  { orderNo: "FC-8F1WS", fanNickname: "밤하늘", itemKind: "그림 액자", boxCount: 1, outcome: "expired", decidedAt: "2026-09-14T15:00:00.000Z" },
];
