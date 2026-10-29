import { parseApprovalPlaintext } from "./approval-plaintext";
import { parseSigningPayload } from "./signing-payload";

// 승인 서명 판정 (approval-signature INV-S2·S12, address-protection INV-P4 (a)(b)).
// 서명자가 그 크리에이터 본인인지(INV-S4)는 서명 게이트웨이가 드림시큐리티 결과의 이름·생년월일·휴대폰 번호를 연결 때 등록한 값과 대조해 본다 —
// 앱 서버는 그 대조를 통과한 결과만 받는다. 앱 서버가 보는 것은 원문 대조와, 승인 뒤 저장된 서명 기록의 해시 대조다.
// 서명자 식별값은 쓰지 않는다(2026-10-29 — 저장하지 않는다).

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** INV-S2: 게이트웨이가 돌려준 서명된 원문이 서버가 저장한 원문과 바이트 단위로 같은가. */
export function sameSignedPlaintext(storedPlaintext: string, signedPlaintext: string): boolean {
  const enc = new TextEncoder();
  return storedPlaintext !== "" && sameBytes(enc.encode(storedPlaintext), enc.encode(signedPlaintext));
}

/** 승인 원문에서 주문번호를 꺼낸다 — 새 원문(네 값) 또는 2026-10-29 전의 원문(요청 ID·주문번호·시각·닉네임 해시). 꼴이 다르면 null. */
export function orderNoOfApprovalPlaintext(plaintext: string): string | null {
  return parseApprovalPlaintext(plaintext)?.orderNo ?? parseSigningPayload(plaintext)?.orderNo ?? null;
}

/** 송장 출력 재검증 재료(INV-P4 a): 그 주문의 승인 원문과 그 해시, 서명 기록에 적힌 원문 해시. */
export type RecordedApproval = {
  plaintext: string;
  /** plaintext 의 SHA-256(소문자 16진수) — 부르는 쪽이 계산한다 */
  plaintextHash: string;
  /** 서명 기록에 승인과 한 처리로 적힌 원문 해시(INV-S12) */
  recordedHash: string;
};

export type RecordedApprovalCheck = { ok: true; orderNo: string } | { ok: false };

/**
 * INV-P4 (a): 서명 기록의 원문 해시가 그 주문 승인 원문의 해시와 같고, 원문에서 주문번호를 읽을 수 있는가.
 * 서명값 자체(kakao 전자서명문)의 재검증은 이 판정 앞에서 송장 출력 함수가 한다(print-creator-label — 게이트웨이가 넣는 검증 함수).
 * 이 함수에 오는 재료는 그 검증을 통과한 기록뿐이다.
 */
export function checkRecordedApproval(r: RecordedApproval): RecordedApprovalCheck {
  if (!/^[0-9a-f]{64}$/.test(r.recordedHash) || !sameSignedPlaintext(r.plaintextHash, r.recordedHash)) return { ok: false };
  const orderNo = orderNoOfApprovalPlaintext(r.plaintext);
  return orderNo ? { ok: true, orderNo } : { ok: false };
}

/** SHA-256 소문자 16진수 — 브라우저·Node(게이트웨이 묶음 포함) 둘 다 있는 Web Crypto 로. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
