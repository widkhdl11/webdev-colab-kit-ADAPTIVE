import { OFFICE_ADDRESS } from "../config/office-address";
import { averageApprovalMinutes } from "../model/approval-time";
import { toFanView, type FanGiftView } from "../model/fan-view";
import { SAMPLE_ORDERS, SAMPLE_SIGNED_IN_FAN } from "./sample-orders";

// 예시 주문에서 화면이 받는 모양을 만든다 — 메인·선물 내역·헤더가 같은 목록을 쓰게 한 곳에 둔다.
// DB 가 붙으면 세션의 팬 주문을 읽는 쿼리로 바뀐다.

/** 로그인한 팬의 선물, 최신 등록 순. 팬 화면이라 팬용 모양(toFanView)만 돌려준다. */
export function sampleFanGiftViews(): FanGiftView[] {
  return SAMPLE_ORDERS.filter((o) => o.fanNickname === SAMPLE_SIGNED_IN_FAN)
    .toSorted((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt))
    .map((o) => toFanView(o, OFFICE_ADDRESS));
}

/** 크리에이터별 평균 승인 시간(분) — 예시 주문으로 계산한다. 주문이 없는 크리에이터는 null. */
export function sampleApprovalMinutesByCreator(): Record<string, number | null> {
  const ids = [...new Set(SAMPLE_ORDERS.map((o) => o.creatorId))];
  return Object.fromEntries(ids.map((id) => [id, averageApprovalMinutes(SAMPLE_ORDERS.filter((o) => o.creatorId === id))]));
}
