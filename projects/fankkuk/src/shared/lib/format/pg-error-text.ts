// 환불·취소 실패 기록에 남은 결제사 답(「코드 사람 말」 꼴, 예: "NOT_CANCELABLE_AMOUNT 취소 할 수 없는 금액 입니다.")을
// 화면용으로 나눈다. 사람 말을 먼저 보이고, 코드는 결제사에 문의할 때 쓰도록 뒤에 작게 붙인다.
// 사람 말이 없이 코드만 오면 코드만 보이면 뜻을 모르니 정해 둔 문장을 대신 쓴다.
export function splitPgError(raw: string): { message: string; code: string | null } {
  const text = raw.trim();
  const m = /^([A-Z][A-Z0-9_]{2,})(?:(?:\s+|:\s*)(.*))?$/s.exec(text);
  if (!m) return { message: text || "결제사가 이유를 알려 주지 않았어요.", code: null };
  const message = (m[2] ?? "").trim();
  return { message: message || "결제사가 요청을 받지 않았어요. 결제사 관리 화면에서 확인해 주세요.", code: m[1] };
}
