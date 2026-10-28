import type { DeployEnv } from "@/shared/lib/env/is-production";
import { readGatewayConfig, type GatewayConfig } from "./gateway-client";
import type { LabelPrinters } from "./invoice-decryptor";

// 송장 출력을 어디서 할지 한 곳에서 정한다(address-protection 「복호화 함수」).
// - SIGN_GATEWAY_URL 이 있으면 서명 게이트웨이. 설정이 틀리면(토큰 없음·http 등) 로컬로 넘어가지 않고 null — 출력은 실패로 답한다.
//   설정이 틀린 운영 앱이 로컬 복호화로 조용히 내려가는 길을 막는다.
// - 없으면 로컬 송장 출력 함수. 운영 환경이거나 설정 파일이 없으면 만들지 못하고 null(INV-P12).

type Env = DeployEnv & Record<string, string | undefined>;

export function chooseLabelPrinters(
  env: Env,
  make: { gateway: (cfg: GatewayConfig) => LabelPrinters; local: () => LabelPrinters },
  log: (msg: string, detail: string) => void = console.error,
): LabelPrinters | null {
  let cfg: GatewayConfig | null;
  try {
    cfg = readGatewayConfig(env);
  } catch (e) {
    log("서명 게이트웨이 설정이 틀렸다", e instanceof Error ? e.message : typeof e);
    return null;
  }
  if (cfg) return make.gateway(cfg);
  try {
    return make.local();
  } catch (e) {
    log("송장 출력 함수를 만들지 못했다", e instanceof Error ? e.message : typeof e);
    return null;
  }
}
