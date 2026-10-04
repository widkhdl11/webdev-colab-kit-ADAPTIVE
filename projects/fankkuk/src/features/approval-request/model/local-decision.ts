// 승인 요청 화면 안에서의 결정 상태. 받지 않기는 서버에 저장한 뒤에 여기 적는다(decline-block).
// 승인 버튼의 결과는 아직 "서명 대기"(signing) 표시뿐이다 — 승인은 서명이 서버 검증을 통과했을 때만 일어난다(INV-S7).

export type LocalDecision =
  | { kind: "pending" }
  | { kind: "signing" }
  | { kind: "declined"; blocked: boolean }
  | { kind: "blocked_elsewhere" }; // 같은 팬의 다른 요청을 거절하며 차단했다

const PENDING: LocalDecision = { kind: "pending" };

/**
 * 한 줄의 결정을 적은 새 기록을 돌려준다.
 * alsoDeclined 는 서버가 「이번 차단으로 함께 거절했다」고 돌려준 주문번호다(INV-D8) — 그중 화면에 대기·서명 대기로
 * 남아 있던 줄만 막는다. 이미 처리된 줄은 그대로 둔다. 차단 없이 거절했으면 서버가 빈 목록을 준다.
 * 같은 팬인지 닉네임으로 가리지 않는다 — 닉네임은 겹칠 수 있고, 보낸 사람 계정 값은 화면에 오지 않는다(INV-D1·D6).
 */
export function applyDecision(
  states: Readonly<Record<string, LocalDecision>>,
  orderNo: string,
  decision: LocalDecision,
  alsoDeclined: ReadonlySet<string>,
): Record<string, LocalDecision> {
  const next: Record<string, LocalDecision> = { ...states, [orderNo]: decision };
  for (const other of alsoDeclined) {
    if (other === orderNo) continue;
    const kind = (next[other] ?? PENDING).kind;
    if (kind === "pending" || kind === "signing") next[other] = { kind: "blocked_elsewhere" };
  }
  return next;
}
