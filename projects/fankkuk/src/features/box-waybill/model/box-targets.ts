import { boxTierName, isWaybillEditable, type GiftBox, type ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";

// 상자 화면이 「어느 상자를 찾기(받는 주소 없이 보냈어요) 대상으로 고를 수 있나」·「어느 상자에 받는 주소를 그리나」를 정하는 판정
// (inbound-address-code INV-C2·C3·C4 ②). 위젯은 이 결과를 그리기만 한다.
// - 찾기 대상: 진행 중 주문(역조공은 팬이 받지 않은 몫이 아님)의 아직 입고되지 않은 상자.
// - 받는 주소: 사무실 주소가 있고(결제가 끝난 진행 중 주문·보낼 상자가 남은 묶음) DB 가 그 상자의 6자리를 줄 때만.
//   6자리는 DB 가 주인에게, 유효할 때만 준다 — 여기서는 화면 쪽 조건을 한 번 더 건다.

export type BoxTarget = { kind: "box"; id: string } | { kind: "share"; id: string };

/** label = 상자 번호(FC-7K3M9-2), name = 고르는 칸에 보이는 이름(번호 · 구간) */
export type FinderBox = { target: BoxTarget; label: string; name: string };

/** 팬 선물: 진행 중 주문의 입고 전 상자만 찾기 대상 */
export function giftFinderBoxes(boxes: readonly GiftBox[], inProgress: boolean): FinderBox[] {
  if (!inProgress) return [];
  return boxes
    .filter((b) => isWaybillEditable(b.state))
    .map((b) => {
      const tierName = boxTierName(b.tier);
      return { target: { kind: "box", id: b.boxId }, label: b.label, name: tierName ? `${b.label} · ${tierName}` : b.label };
    });
}

/**
 * 선물 상세 아래 「받는 주소 없이 보냈어요」 구간의 고를 상자(action-center INV-J13) — 맨 위 「지금 할 일」 칸의 「도착이 늦어요」에
 * 이미 있는 상자는 그 칸에서만 찾으므로 뺀다. 칸에 없는(결제 뒤 14일 전) 상자는 그대로 남는다.
 */
export function finderBoxesBelowTodo(boxes: readonly FinderBox[], todoBoxIds: readonly string[]): FinderBox[] {
  return boxes.filter((b) => !todoBoxIds.includes(b.target.id));
}

/** 받는 주소 대신 「먼저 보내기」 안내를 그릴 때 — 진행 중 주문이고 DB 가 아직 누르지 않았다고 할 때(approval-signature INV-S9) */
export function needsEarlySendAck(boxes: readonly GiftBox[], inProgress: boolean): boolean {
  return inProgress && boxes.some((b) => b.sendAckNeeded);
}

/** 팬 선물 상자 하나의 받는 주소 6자리 — 진행 중 주문이고 사무실 주소가 있을 때만. 없으면 null(주소 칸을 그리지 않는다) */
export function giftAddressCode(box: GiftBox, officeAddress: string | null, inProgress: boolean): string | null {
  return inProgress && officeAddress !== null ? box.addressCode : null;
}

/** 역조공 몫 하나의 받는 주소 6자리 — 묶음에 사무실 주소가 있고 팬이 받지 않은 몫이 아닐 때만 */
export function shareAddressCode(box: ShareBox | undefined, officeAddress: string | null, state: SentRevgift["state"]): string | null {
  if (!box || officeAddress === null || state === "not_received") return null;
  return box.addressCode;
}
