import { MAX_DECRYPTS_PER_BOX, type AccessDenyReason } from "@/entities/address/model/access-log";
import { readOpenedCreatorAddress, type CreatorAddressLabel } from "@/entities/address/model/creator-address-plaintext";
import { readOpenedFanAddress } from "@/entities/address/model/fan-address-plaintext";

// 반송 송장의 주소를 여는 조건(address-protection INV-P18). 역조공 몫의 판정(authorize-revgift-decrypt)과 같은 자리에서 부른다 —
// 근거는 「보낸 사람이 확인하며 상자에 복사해 둔 등록 주소 암호문」이다(office-workflow INV-W15).

/** 반송 송장을 출력할 수 있는 단계 — 반송 대기(첫 출력)와 반송 송장 출력함(재출력). 처분 대상·반송 확정 뒤에는 열지 않는다 */
export const RETURN_PRINTABLE_STATES: readonly string[] = ["return_waiting", "return_printed"];

export type ReturnDecryptRequest = {
  /** 복호화 함수가 스스로 검증한 로그인 토큰의 사용자 ID */
  requesterUserId: string;
  /** 복호화 함수 자신의 설정에 적힌 대표 ID */
  ownerUserId: string;
  /** 보낸 사람이 반송 주소를 확인했는가(확인하며 복사본이 생긴다) */
  confirmed: boolean;
  parcelState: string;
  /** 이 상자에서 지금까지 연 횟수(돌려받은 줄은 뺀다) */
  decryptCount: number;
};

export type ReturnDecryptDecision = { ok: true; isReprint: boolean } | { ok: false; reason: AccessDenyReason };

/** 복호화 전 판정. 하나라도 어긋나면 열지 않는다. 복사본이 실제로 있는지·동시 요청의 횟수는 저장소가 잠근 자리에서 다시 본다. */
export function authorizeReturnDecrypt(req: ReturnDecryptRequest): ReturnDecryptDecision {
  // (c) 대표 계정만 — 판단 근거는 복호화 함수 설정의 대표 ID 하나(INV-P8 과 같은 판정)
  if (req.ownerUserId === "" || req.requesterUserId !== req.ownerUserId) return { ok: false, reason: "not_owner" };
  // (a) 반송 대기 상자(반송 송장 출력 뒤 재출력 포함) — 봉투를 내주는 DB 함수와 같은 순서로 본다
  if (!RETURN_PRINTABLE_STATES.includes(req.parcelState)) return { ok: false, reason: "order_not_printable" };
  // (a) 보낸 사람이 확인해 복사해 둔 암호문이 있어야 한다
  if (!req.confirmed) return { ok: false, reason: "no_valid_approval" };
  // 상한 3회(INV-P5 와 같은 규칙)
  if (req.decryptCount >= MAX_DECRYPTS_PER_BOX) return { ok: false, reason: "decrypt_limit_reached" };
  return { ok: true, isReprint: req.decryptCount > 0 };
}

/**
 * (b) 연 내용의 계정 식별값이 그 상자 주문을 보낸 계정과 같아야 그 주소를 쓴다(INV-P14 와 같은 이유 — 옮겨 붙인 암호문을 막는다).
 *   · 팬 등록 주소 봉인(INV-P17): 봉인 속 계정(profiles.id)이 보낸 계정과 같다.
 *   · 크리에이터 등록 주소 봉인(INV-P13): 보낸 사람이 크리에이터이고 봉인 속 크리에이터(creators.id)가 그 크리에이터와 같다.
 * 같으면 라벨 다섯 칸만 돌려준다(식별값·평문 전체는 넘기지 않는다). 꼴이 틀린 내용도 같은 거부다.
 */
export function checkOpenedReturn(input: {
  senderId: string;
  senderCreatorId: string | null;
  openedPlaintext: string;
}): { ok: true; label: CreatorAddressLabel } | { ok: false; reason: "address_mismatch" } {
  const fan = readOpenedFanAddress(input.openedPlaintext);
  if (fan) return fan.accountId === input.senderId ? { ok: true, label: fan.label } : { ok: false, reason: "address_mismatch" };
  const creator = readOpenedCreatorAddress(input.openedPlaintext);
  if (creator && input.senderCreatorId !== null && creator.creatorId === input.senderCreatorId) return { ok: true, label: creator.label };
  return { ok: false, reason: "address_mismatch" };
}
