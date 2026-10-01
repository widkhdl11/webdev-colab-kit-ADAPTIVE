import { parseEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";

// INV-P1: 서버가 받는 주소 값은 브라우저에서 봉인된 암호문뿐이다.
// 평문 주소는 이 타입으로 만들 수 없다 — 만드는 길은 parseAddressInput 하나다.
declare const brand: unique symbol;
export type AddressCiphertext = Envelope & { readonly [brand]: "AddressCiphertext" };

export type AddressInputResult =
  | { ok: true; value: AddressCiphertext }
  | { ok: false; error: "address_not_sealed" };

/** 주소 저장 요청 본문을 검증한다. 봉인 형식이 아니면 거부(INV-P1). */
export function parseAddressInput(body: unknown): AddressInputResult {
  if (typeof body !== "object" || body === null || !("address" in body)) {
    return { ok: false, error: "address_not_sealed" };
  }
  const envelope = parseEnvelope((body as { address: unknown }).address);
  if (!envelope) return { ok: false, error: "address_not_sealed" };
  return { ok: true, value: envelope as AddressCiphertext };
}
