import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";

// 저장된 서명을 다시 볼 때 받는 서명 방식(address-protection INV-P4 (a), approval-signature INV-S11).
// 로컬·시험 사이트는 가짜(fake) 서명만, 운영은 카카오(kakao) 서명만. 창구를 고르는 규칙(signer.ts)과 같은 판정을 쓴다 —
// 송장 출력 함수(서명 게이트웨이 묶음)는 서명 창구 자체가 필요 없어 이 파일만 가져간다.

export type SignatureMethod = "kakao" | "fake";

export function acceptedSignatureMethod(env: TestSiteEnv): SignatureMethod {
  return allowsFakeChannels(env) ? "fake" : "kakao";
}
