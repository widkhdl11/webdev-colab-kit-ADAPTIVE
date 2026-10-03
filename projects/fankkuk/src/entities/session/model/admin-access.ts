// 관리자 화면에 들어온 사람을 어떻게 대할지 (admin-console INV-K1·K2).
// 판정 재료는 DB 함수 두 개(is_operator·is_owner)의 답이다 — 화면이 보낸 역할은 믿지 않는다.
// 확인이 안 되면(오류·빈 답) 운영자가 아닌 것으로 본다: 관리자 주소는 있는 줄도 모르게 404.

export type AdminAccess = "not_found" | "staff" | "owner";

/** DB 함수의 답. null = 묻지 못했거나 오류였다. */
export type OperatorFlags = { operator: boolean | null; owner: boolean | null };

export function adminAccessOf(flags: OperatorFlags): AdminAccess {
  if (flags.operator !== true) return "not_found";
  return flags.owner === true ? "owner" : "staff";
}
