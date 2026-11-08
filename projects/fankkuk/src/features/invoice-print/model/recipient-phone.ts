import type { RecipientPhoneMode } from "@/shared/config/courier";

// 송장 라벨의 받는 사람 번호(address-protection INV-P19). 연 주소의 실제 번호를 설정값에 따라 그대로 두거나 택배사 안심번호로 바꾼다.
// 안심번호 설정에서는 어떤 실패에도 실제 번호로 대신 찍지 않는다 — 번호를 못 받으면 라벨 없이 실패로 돌린다.

/** 택배사가 운송장 번호와 받는 사람 실제 번호로 안심번호를 내준다. 못 주면 null. 택배사 연결 때 만든다(지금은 없다). */
export type SafeNumberIssuer = (input: { waybill: string; phone: string }) => Promise<string | null>;

/** waybill 이 null 이면 수동 입력으로 운송장 번호 없이 연 주소다(INV-P21 ③) — 안심번호를 받을 번호가 없다 */
export type RecipientPhoneOf = (input: { waybill: string | null; phone: string }) => Promise<string | null>;

// 안심번호 꼴 — 숫자만 10~12자리, 0으로 시작(050X-XXXX-XXXX 등)
const SAFE_NUMBER = /^0[0-9]{9,11}$/;

/** 설정값에 맞는 번호 고르기 함수를 만든다. 안심번호 설정인데 택배사 연결이 없으면 여기서 실패한다(출력 횟수를 쓰기 전에). */
export function recipientPhoneOnLabel(mode: RecipientPhoneMode, issue: SafeNumberIssuer | undefined): RecipientPhoneOf {
  if (mode === "real") return async ({ phone }) => phone;
  if (!issue) throw new Error("송장 라벨 번호가 안심번호 설정인데 택배사 안심번호 연결이 없다 — 연결 전에는 설정을 real 로 둔다");
  return async ({ waybill, phone }) => {
    // 운송장 번호 없이 연 주소(수동 입력)에는 안심번호가 없다 — 실제 번호로 대신 찍지 않는다
    if (waybill === null) return null;
    try {
      const safe = await issue({ waybill, phone });
      return safe !== null && SAFE_NUMBER.test(safe) ? safe : null;
    } catch {
      return null;
    }
  };
}

type Printed = { kind: "printed"; waybill: string | null; label: { phone: string } };

/** 출력 결과에 적용한다. 출력이 아닌 결과는 그대로, 번호를 못 정하면 { kind: "failed" }. */
export async function withRecipientPhone<R extends { kind: string }>(result: R, phoneOf: RecipientPhoneOf): Promise<R | { kind: "failed" }> {
  if (result.kind !== "printed") return result;
  const printed = result as unknown as R & Printed;
  const phone = await phoneOf({ waybill: printed.waybill, phone: printed.label.phone });
  if (phone === null) return { kind: "failed" };
  return { ...printed, label: { ...printed.label, phone } };
}
