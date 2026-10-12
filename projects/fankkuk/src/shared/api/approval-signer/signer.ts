import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";

// 승인 서명 창구 (approval-signature INV-S11). 카카오 연결 전이라 로컬에서는 가짜 창구를 쓴다(카드 d28).
// 창구는 서버에서만 쓴다. 고르는 곳은 이 함수 하나다 — 운영에서는 실제 카카오 창구가 붙기 전까지 창구가 없고, 승인 요청은 거부된다.
// 운영에서 가짜를 켜는 길은 시험 사이트 판정(test-site INV-TS1) 하나뿐이다 — 따로 켜는 설정은 두지 않는다(가입의 phone-verifier 와 같은 이유, signup INV-U9).

/** 서명 검증(INV-S3)을 통과한 결과. evaluate-approval 의 VerifiedSignature 와 같은 꼴이다. */
export type SignedApproval = {
  signedContent: Uint8Array;
  signerId: string;
};

export type ApprovalSigner = {
  kind: "fake";
  /** 그 크리에이터가 저장된 원문에 서명한 결과. 가짜 창구는 원문을 그대로, 서명자는 그 크리에이터의 가짜 식별값으로 돌려준다. */
  sign(input: { storedPayload: string; creatorUserId: string }): Promise<SignedApproval>;
  /** 크리에이터가 가입 때 등록한 본인 식별값(INV-S4). 가짜 창구에서는 계정 ID 로 만든 값이다. */
  registeredSignerIdOf(creatorUserId: string): string;
};

const fakeSignerIdOf = (userId: string) => `fake:${userId}`;

const fakeSigner: ApprovalSigner = {
  kind: "fake",
  async sign({ storedPayload, creatorUserId }) {
    return { signedContent: new TextEncoder().encode(storedPayload), signerId: fakeSignerIdOf(creatorUserId) };
  },
  registeredSignerIdOf: fakeSignerIdOf,
};

export function chooseApprovalSigner(env: TestSiteEnv): ApprovalSigner | null {
  if (!allowsFakeChannels(env)) return null; // 실제 카카오 연결이 생기면 여기서 그 창구를 돌려준다
  return fakeSigner;
}
