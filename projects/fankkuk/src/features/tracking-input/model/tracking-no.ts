// 팬이 사무실로 보낸 택배의 송장번호. 입고 때 주문번호와 함께 매칭 키로 쓴다.
// 길이 10~14자리는 가정 — 국내 주요 택배사 송장이 11~13자리다. 택배사 API 를 붙일 때 실제 조회로 확인한다.
const ALLOWED = /^[0-9\s-]+$/;

export function parseTrackingNo(input: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, message: "송장번호를 적어 주세요." };
  if (!ALLOWED.test(trimmed)) return { ok: false, message: "송장번호는 숫자로 적어 주세요." };
  const digits = trimmed.replace(/[\s-]/g, "");
  if (digits.length < 10 || digits.length > 14) return { ok: false, message: "송장번호 자릿수를 다시 확인해 주세요." };
  return { ok: true, value: digits };
}
