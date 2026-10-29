// 어댑터를 고르는 곳은 여기 하나다. SIGN_ADAPTER 값으로만 정한다.
//
// 드림시큐리티 어댑터는 CommonJS(.cjs)다 — 연동 모듈이 CommonJS 만 지원한다. createRequire 로 불러오고,
// ES 모듈 쪽 의존성(오류 클래스·outboundRequest·KMS)은 인자로 넘긴다.
//
// 어댑터 약속: ready() · requestSignature({ requestId, plaintext, requestMessage, signer }) → { txId, expiresAt }
//   · fetchResult({ requestId, txId }) → { state } 또는 { state: "signed", verified: { signedPlaintext, signature, signedAt } }
//   signed 는 어댑터가 서명을 직접 검증한 뒤에만 돌려준다.

import { createRequire } from "node:module";
import { kmsDecrypt, kmsReady } from "../kms.mjs";
import { outboundRequest } from "../outbound.mjs";
import * as errors from "./errors.mjs";
import { createTestAdapter } from "./test.mjs";

const require = createRequire(import.meta.url);
const { createDreamsecurityAdapter } = require("./dreamsecurity.cjs");

export function createAdapter(config, overrides = {}) {
  if (config.adapter === "dreamsecurity") {
    return createDreamsecurityAdapter(config, {
      errors,
      outboundRequest,
      unwrapKey: (wrappedKey) => kmsDecrypt(config.kms, wrappedKey),
      unwrapReady: () => kmsReady(config.kms),
      ...overrides,
    });
  }
  if (config.adapter === "test") return createTestAdapter();
  throw new Error(`모르는 어댑터: ${config.adapter}`);
}
