import { readOpenedCreatorAddress, type CreatorAddressLabel } from "@/entities/address/model/creator-address-plaintext";

// INV-P14: 봉인을 연 내용의 크리에이터 식별값이 그 주소 칸의 크리에이터와 다르면 송장 출력은 그 주소를 쓰지 않는다.
// 서버를 장악한 사람이 한 크리에이터의 암호문을 다른 크리에이터 칸에 옮겨 붙여도 여기서 걸린다. 꼴이 틀린 내용도 쓰지 않는다.

export type OpenedAddressCheck = { ok: true; label: CreatorAddressLabel } | { ok: false; reason: "address_mismatch" };

export function checkOpenedCreatorAddress(input: { slotCreatorId: string; plaintext: string }): OpenedAddressCheck {
  const opened = readOpenedCreatorAddress(input.plaintext);
  if (!opened || input.slotCreatorId === "" || opened.creatorId !== input.slotCreatorId) return { ok: false, reason: "address_mismatch" };
  return { ok: true, label: opened.label };
}
