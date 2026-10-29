import type { StatusTone } from "@/shared/ui/status-tone";
import { TOGETHER_STAGES, type TogetherGift } from "../api/together-reads";

// 함께한 시간 선물 카드 아래 칸 (추가분 F-7 구성 5). 무엇을 보일지 여기서 정하고 화면은 그리기만 한다.
// - 거절·기간 지난 반려: 「전달되지 않은 선물」(together 「스스로 정한 것」 — 차단 거절도 같은 말, decline-block INV-D5)
// - 검수 반송: 그 사실 한 줄
// - 출고 전: 지금 단계(배지·한 줄·진행 막대)
// - 출고 뒤: 상자별 받았어요·답장 칸(gift-reply 의 팬 답장 카드)이 맡는다 — 「답장을 기다리고 있어요」·답장 카드·공유가 거기 있다.
//   상자가 여럿이면 하나라도 출고되면 상자별 칸으로 바꾼다(주문의 출고 시각은 모든 상자가 나가야 적힌다).
//   출고 단계인데 상자별 줄이 하나도 없으면(읽기가 아직 못 따라온 때) 빈 칸 대신 출고 문구 한 줄.

export type GiftProgress =
  | { kind: "note"; text: string }
  | { kind: "moving"; tone: StatusTone; label: string; title: string; done: number; total: number }
  | { kind: "boxes" };

export const NOT_ACCEPTED_TEXT = "전달되지 않은 선물";
const SHIPPED_TEXT = "팬꾹 출고 완료";
const RETURNED_TEXT = "검수 불합격으로 반송 대상이 된 선물입니다";

/** shippedBoxes = 출고된 상자 수(상자별 받았어요·답장 읽기의 줄 수). */
export function giftProgressOf(g: TogetherGift, shippedBoxes: number): GiftProgress {
  if (g.outcome === "declined" || g.outcome === "expired") return { kind: "note", text: NOT_ACCEPTED_TEXT };
  if (g.outcome === "returned") return { kind: "note", text: RETURNED_TEXT };
  if (shippedBoxes > 0) return { kind: "boxes" };
  const done = TOGETHER_STAGES.indexOf(g.stage) + 1;
  const total = TOGETHER_STAGES.length;
  switch (g.stage) {
    case "registered":
      return { kind: "moving", tone: "warn", label: "도착 대기", title: "팬꾹 도착을 기다리고 있습니다", done, total };
    case "received":
      return { kind: "moving", tone: "info", label: "입고 완료", title: "검수 중", done, total };
    case "inspected":
      return g.approved
        ? { kind: "moving", tone: "info", label: "검수 완료", title: "출고 대기", done, total }
        : { kind: "moving", tone: "warn", label: "승인 대기", title: "검수 완료", done, total };
    default:
      return { kind: "note", text: SHIPPED_TEXT };
  }
}
