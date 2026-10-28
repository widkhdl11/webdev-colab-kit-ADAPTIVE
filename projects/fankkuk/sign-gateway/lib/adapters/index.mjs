// 어댑터를 고르는 곳은 여기 하나다. SIGN_ADAPTER 값으로만 정한다.

import { createDreamsecurityAdapter } from "./dreamsecurity.mjs";
import { createTestAdapter } from "./test.mjs";

export function createAdapter(config) {
  if (config.adapter === "dreamsecurity") return createDreamsecurityAdapter(config);
  if (config.adapter === "test") return createTestAdapter();
  throw new Error(`모르는 어댑터: ${config.adapter}`);
}
