import { MAX_DECRYPTS_PER_ORDER, type AccessDenyReason } from "@/entities/address/model/access-log";
import { readOpenedOrderNo } from "@/entities/revgift/model/sealed-address";

// 역조공 몫의 주소를 여는 조건(reverse-gift INV-R7). 크리에이터 주소의 판정(authorize-decrypt)과 같은 자리에서 부른다 —
// 승인 서명 대신 「팬이 받기를 하며 넣은 암호문」이 근거다.

export type RevgiftShareState = {
  reply: "waiting" | "accepted" | "declined" | "expired";
  inspected: boolean;
  shipped: boolean;
  returned: boolean;
  cancelled: boolean;
};

export type RevgiftDecryptRequest = {
  requestedOrderNo: string;
  /** 복호화 함수가 스스로 검증한 로그인 토큰의 사용자 ID */
  requesterUserId: string;
  /** 복호화 함수 자신의 설정에 적힌 대표 ID */
  ownerUserId: string;
  /** 그 몫에 팬이 넣은 주소 암호문이 있는가 */
  hasEnvelope: boolean;
  share: RevgiftShareState;
  /** 이 몫에서 지금까지 성공한 복호화 횟수 */
  decryptCount: number;
};

export type RevgiftDecryptDecision = { ok: true; isReprint: boolean } | { ok: false; reason: AccessDenyReason };

/** 복호화 전 판정. 하나라도 어긋나면 열지 않는다. 동시 요청의 원자성은 저장소 쪽이 맡는다. */
export function authorizeRevgiftDecrypt(req: RevgiftDecryptRequest): RevgiftDecryptDecision {
  // (d) 대표 계정만 — 판단 근거는 복호화 함수 설정의 대표 ID 하나(INV-P8 과 같은 판정)
  if (req.ownerUserId === "" || req.requesterUserId !== req.ownerUserId) return { ok: false, reason: "not_owner" };
  // (a) 팬이 받기를 하며 넣은 암호문이 있어야 한다
  if (!req.hasEnvelope || req.share.reply !== "accepted") return { ok: false, reason: "no_valid_approval" };
  // (c) 검수 완료 ~ 출고 확정 전, 반송·취소 아님
  const s = req.share;
  if (!s.inspected || s.shipped || s.returned || s.cancelled) return { ok: false, reason: "order_not_printable" };
  // 상한 3회(INV-P5 와 같은 규칙)
  if (req.decryptCount >= MAX_DECRYPTS_PER_ORDER) return { ok: false, reason: "decrypt_limit_reached" };
  return { ok: true, isReprint: req.decryptCount > 0 };
}

/** (b) 연 내용의 주문번호가 요청한 몫과 같아야 그 주소를 쓴다 — 다른 몫에서 옮겨 붙인 암호문을 막는다. */
export function checkOpenedRevgift(input: { requestedOrderNo: string; openedPlaintext: string }): { ok: true } | { ok: false; reason: "order_mismatch" } {
  return readOpenedOrderNo(input.openedPlaintext) === input.requestedOrderNo ? { ok: true } : { ok: false, reason: "order_mismatch" };
}
