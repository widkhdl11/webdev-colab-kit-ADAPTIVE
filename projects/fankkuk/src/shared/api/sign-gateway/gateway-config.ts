import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";

// 서명 게이트웨이(sign.fankkuk.com) 연결 설정 — 송장 출력과 승인 서명 창구가 같이 쓴다.
// 게이트웨이 토큰(SIGN_GATEWAY_TOKEN)은 「이 앱 서버가 보냈다」만 증명한다.

export type GatewayConfig = { url: string; token: string };

/** 게이트웨이 설정. 주소가 없으면 null. 운영에서는 https 만 받는다. 주소가 있는데 토큰이 없거나 짧으면 던진다(설정 오류를 조용히 넘기지 않는다). */
export function readGatewayConfig(env: DeployEnv & Record<string, string | undefined>): GatewayConfig | null {
  const raw = env.SIGN_GATEWAY_URL?.trim();
  if (!raw) return null;
  const token = env.SIGN_GATEWAY_TOKEN?.trim() ?? "";
  if (token.length < 32) throw new Error("SIGN_GATEWAY_TOKEN 이 없거나 짧다");
  const url = new URL(raw);
  if (url.protocol !== "https:" && isProduction(env)) throw new Error("SIGN_GATEWAY_URL 은 https 여야 한다");
  // 경로를 붙여 두면 말없이 버려진다 — 주소만 받는다
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") throw new Error("SIGN_GATEWAY_URL 은 주소만(경로 없이) 적는다");
  return { url: url.origin, token };
}
