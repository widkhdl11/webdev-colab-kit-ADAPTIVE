import { randomUUID } from "node:crypto";
import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";
import { MOBILE_PHONE_SHAPE } from "@/shared/lib/validation/phone-shape";

// 휴대폰 본인 확인 창구. 카카오 인증 연결 전이라 로컬에서는 가짜 창구를 쓴다(signup 결정 카드 d14).
// 창구는 서버에서만 쓴다 — 확인 결과는 서버가 창구에게 직접 받은 것만 믿는다(INV-U1).
// 고르는 곳은 이 함수 하나다(INV-U9). 운영에서는 실제 연결이 생기기 전까지 창구가 없다 — 본인 확인 요청과 가입이 모두 거부된다.
// 운영에서 가짜를 켜는 길은 시험 사이트 판정(test-site INV-TS1) 하나뿐이다 — 따로 켜는 설정은 두지 않는다. 환경 변수 하나 잘못 넣어 운영 가입이 열리는 일이 없게.

export type PhoneVerificationResult = { status: "verified"; phone: string } | { status: "pending" } | { status: "failed" };

export type PhoneVerifier = {
  kind: "fake";
  /** 그 번호로 카카오톡 인증 요청을 보내고 거래 값을 받는다. */
  request(phone: string): Promise<{ tx: string }>;
  /** 거래 값으로 결과를 묻는다. 확인됐으면 카카오가 확인한 번호를 돌려준다. */
  result(tx: string): Promise<PhoneVerificationResult>;
};


/** 가짜 창구 — 요청하면 바로 확인된다. 번호는 거래 값 안에 있고, 거래 값은 서버 DB 에만 있다. */
const fakeVerifier: PhoneVerifier = {
  kind: "fake",
  async request(phone) {
    return { tx: `fake:${phone}:${randomUUID()}` };
  },
  async result(tx) {
    const [prefix, phone] = tx.split(":");
    if (prefix !== "fake" || !phone || !MOBILE_PHONE_SHAPE.test(phone)) return { status: "failed" };
    return { status: "verified", phone };
  },
};

export function choosePhoneVerifier(env: TestSiteEnv): PhoneVerifier | null {
  if (!allowsFakeChannels(env)) return null; // 실제 카카오 연결이 생기면 여기서 그 창구를 돌려준다
  return fakeVerifier;
}
