import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";
import type { Envelope } from "@/shared/lib/envelope/envelope";

// 승인 서명 창구 (approval-signature INV-S11·S16). 카카오 연결 전이라 로컬에서는 가짜 창구를 쓴다(카드 d28).
// 창구는 서버에서만 쓴다. 고르는 곳은 이 함수 하나다 — 운영에서는 실제 카카오 창구가 붙기 전까지 창구가 없고, 승인 요청은 거부된다.
// 운영에서 가짜를 켜는 길은 시험 사이트 판정(test-site INV-TS1) 하나뿐이다 — 따로 켜는 설정은 두지 않는다(가입의 phone-verifier 와 같은 이유, signup INV-U9).
// 승인 서명 연결(INV-S16)의 시험 서명도 같은 창구가 맡는다 — 드림시큐리티 명세가 오기 전에는 가짜(시험) 창구뿐이고, 같은 규칙으로 고른다.

/** 서명 검증(INV-S3)을 통과한 결과. evaluate-approval 의 VerifiedSignature 와 같은 꼴이다. */
export type SignedApproval = {
  signedContent: Uint8Array;
  signerId: string;
};

/** 연결 시험 서명의 지금 결과. signed 는 창구가 서명을 직접 검증한 뒤에만 나온다 — 서명된 원문은 DB 가 저장한 원문과 다시 대조한다. */
export type LinkSignatureState = { state: "pending" } | { state: "failed" } | ({ state: "signed" } & SignedApproval);

export type ApprovalSigner = {
  kind: "fake";
  /** 그 크리에이터가 저장된 원문에 서명한 결과. 가짜 창구는 원문을 그대로, 서명자는 그 크리에이터의 가짜 식별값으로 돌려준다. */
  sign(input: { storedPayload: string; creatorUserId: string }): Promise<SignedApproval>;
  /** 크리에이터가 가입 때 등록한 본인 식별값(INV-S4). 가짜 창구에서는 계정 ID 로 만든 값이다. */
  registeredSignerIdOf(creatorUserId: string): string;
  /**
   * INV-S16: 연결 시험 서명 요청. identity 는 브라우저가 봉인한 이름·생년월일·휴대폰 번호다 — 앱 서버는 열지 않고 그대로 넘긴다.
   * 실제 창구(서명 게이트웨이 → 드림시큐리티)는 게이트웨이가 KMS 로 봉투를 풀어 서명 대상을 지정한다. 시험 창구는 봉투를 보지 않는다.
   */
  requestLinkSignature(input: { requestId: string; payload: string; identity: Envelope }): Promise<{ ok: boolean }>;
  /** INV-S16: 연결 시험 서명의 결과. 시험 창구는 요청을 받은 뒤 첫 확인에서 저장된 원문 그대로 서명해 돌려준다. */
  linkSignatureResult(input: { requestId: string; payload: string; creatorUserId: string }): Promise<LinkSignatureState>;
};

const fakeSignerIdOf = (userId: string) => `fake:${userId}`;

const fakeSigner: ApprovalSigner = {
  kind: "fake",
  async sign({ storedPayload, creatorUserId }) {
    return { signedContent: new TextEncoder().encode(storedPayload), signerId: fakeSignerIdOf(creatorUserId) };
  },
  registeredSignerIdOf: fakeSignerIdOf,
  async requestLinkSignature() {
    return { ok: true };
  },
  async linkSignatureResult({ payload, creatorUserId }) {
    return { state: "signed", signedContent: new TextEncoder().encode(payload), signerId: fakeSignerIdOf(creatorUserId) };
  },
};

// 실제 드림시큐리티 창구 자리: 같은 ApprovalSigner 꼴(kind "kakao")로 서명 게이트웨이(SIGN_GATEWAY_URL)를 부르는 구현이 여기서 나온다.
// 명세가 오기 전에는 만들지 않는다 — 운영은 창구 없음(null)으로 남아 승인·주소 등록·연결 요청이 모두 거부된다.
export function chooseApprovalSigner(env: TestSiteEnv): ApprovalSigner | null {
  if (!allowsFakeChannels(env)) return null; // 실제 카카오 연결이 생기면 여기서 그 창구를 돌려준다
  return fakeSigner;
}
