// 원 송장번호 — 팬·크리에이터가 상자를 사무실로 보낸 택배의 송장번호. 입고 때 스캔해 상자를 찾는 키다(office-workflow INV-W1·INV-W5).
// 숫자 10~14자리. 국내 주요 택배사 송장이 11~13자리라 앞뒤로 한 자리씩 여유를 뒀다. DB 함수도 같은 꼴만 받는다(22023).

export const WAYBILL_PATTERN = /^[0-9]{10,14}$/;
export const WAYBILL_FORMAT_MESSAGE = "송장번호를 숫자 10~14자리로 입력해 주세요.";

const ALLOWED = /^[0-9\s-]+$/;

/** 사람이 띄어 쓰거나 하이픈을 넣어도 같은 번호로 본다. */
export function normalizeWaybill(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export function parseWaybillInput(input: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, message: "송장번호를 입력해 주세요." };
  if (!ALLOWED.test(trimmed)) return { ok: false, message: WAYBILL_FORMAT_MESSAGE };
  const digits = normalizeWaybill(trimmed);
  return WAYBILL_PATTERN.test(digits) ? { ok: true, value: digits } : { ok: false, message: WAYBILL_FORMAT_MESSAGE };
}

/** 화면 표시용 — 네 자리씩 띄운다(시안 gift-boxes.html 「6401 2345 7788」). */
export function formatWaybill(waybill: string): string {
  return waybill.replace(/(\d{4})(?=\d)/g, "$1 ");
}
