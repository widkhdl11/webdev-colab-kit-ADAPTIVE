// 승인 요청 화면 안에서의 결정 상태. 지금은 예시 — 서버에 보내지 않고 화면에만 반영한다.
// 승인 버튼의 결과는 "서명 대기"(signing)이지 승인이 아니다 — 승인은 서명이 서버 검증을 통과했을 때만 일어난다(INV-S7).

export type LocalDecision =
  | { kind: "pending" }
  | { kind: "signing" }
  | { kind: "declined"; blocked: boolean }
  | { kind: "blocked_elsewhere" }; // 같은 팬의 다른 요청을 거절하며 차단했다

const PENDING: LocalDecision = { kind: "pending" };

/**
 * 한 줄의 결정을 적은 새 기록을 돌려준다.
 * 차단은 팬 단위다 — 같은 팬이 기다리는 다른 요청(대기·서명 대기)도 더는 승인할 수 없게 막는다.
 * 서명을 기다리던 요청도 막는다: 차단된 팬의 주문은 서명이 와도 승인하지 않는다(INV-S6). 이미 처리된 요청은 그대로 둔다.
 * 팬은 닉네임으로 가린다 — 승인 요청 모양에 팬 id 가 아직 없어서다. 팬 id 가 붙으면 그것으로 바꾼다(닉네임은 겹칠 수 있다).
 */
export function applyDecision(
  states: Readonly<Record<string, LocalDecision>>,
  requests: ReadonlyArray<{ orderNo: string; fanNickname: string }>,
  orderNo: string,
  decision: LocalDecision,
): Record<string, LocalDecision> {
  const next: Record<string, LocalDecision> = { ...states, [orderNo]: decision };
  if (decision.kind !== "declined" || !decision.blocked) return next;
  const fan = requests.find((r) => r.orderNo === orderNo)?.fanNickname;
  if (fan === undefined) return next;
  for (const other of requests) {
    if (other.orderNo === orderNo || other.fanNickname !== fan) continue;
    const kind = (next[other.orderNo] ?? PENDING).kind;
    if (kind === "pending" || kind === "signing") next[other.orderNo] = { kind: "blocked_elsewhere" };
  }
  return next;
}
