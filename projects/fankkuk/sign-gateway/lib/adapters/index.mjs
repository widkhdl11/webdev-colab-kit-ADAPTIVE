// 어댑터를 고르는 곳은 여기 하나다. SIGN_ADAPTER 값으로만 정한다.
//
// 드림시큐리티 어댑터는 CommonJS(.cjs)다 — 연동 모듈이 CommonJS 만 지원한다. createRequire 로 불러오고,
// ES 모듈 쪽 의존성(오류 클래스·outboundRequest)은 인자로 넘긴다.

import { createRequire } from "node:module";
import { outboundRequest } from "../outbound.mjs";
import * as errors from "./errors.mjs";
import { createTestAdapter } from "./test.mjs";

const require = createRequire(import.meta.url);
const { createDreamsecurityAdapter } = require("./dreamsecurity.cjs");

export function createAdapter(config) {
  if (config.adapter === "dreamsecurity") return createDreamsecurityAdapter(config, { errors, outboundRequest });
  if (config.adapter === "test") return createTestAdapter();
  throw new Error(`모르는 어댑터: ${config.adapter}`);
}
