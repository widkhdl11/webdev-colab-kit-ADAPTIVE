import { z } from "zod";
import { readGatewayConfig, type GatewayConfig } from "@/shared/api/sign-gateway/gateway-config";
import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";
import type { Envelope } from "@/shared/lib/envelope/envelope";
import type { SignatureMethod } from "./accepted-method";

// 승인 서명 창구 (approval-signature INV-S4·S11·S16·S17). 서버에서만 쓴다. 고르는 곳은 chooseApprovalSigner 하나다.
// - 가짜(fake): 로컬·시험 사이트(test-site INV-TS1). 요청을 받고 첫 결과 확인에서 바로 저장된 원문 그대로 서명해 돌려준다.
// - 게이트웨이(kakao): 운영에서 SIGN_GATEWAY_URL·SIGN_GATEWAY_TOKEN 이 둘 다 있을 때. 게이트웨이가 드림시큐리티(인증기관 카카오)에 서명을 요청하고,
//   결과를 조회해 검증한 뒤(서명자의 이름·생년월일·휴대폰 번호가 연결 때 등록한 값과 같은지 — INV-S4) 서명값만 돌려준다.
//   앱 서버는 연결 봉투(envelope)를 열지 않고 그대로 넘긴다 — 게이트웨이만 KMS 로 푼다(INV-S16).
// - 운영인데 게이트웨이 설정이 없으면 창구가 없다(null) — 승인·주소 등록·연결 요청이 모두 거부된다. 가짜로 넘어가지 않는다.
// 같은 창구를 승인(요청 구분 「팬꾹 선물 수령 승인」)과 승인 서명 연결의 시험 서명(「팬꾹 승인 서명 연결」)이 쓴다 — 문구는 부르는 쪽이 넘긴다.
// HTTP 약속(게이트웨이와 맞춘 값):
//   POST {URL}/v1/sign/requests  Bearer 토큰  { requestId, plaintext, requestMessage, signer: { envelope, creatorId } } → 201 { requestId, txId, expiresAt }
//   POST {URL}/v1/sign/requests/{requestId}/result  { txId, plaintext } → { state: pending|rejected|expired } | { state: signed, method, signedPlaintext, signature, signedAt }
//   409 원문 불일치 · 422 서명/대상자 불일치

export type SignRequestStart = { ok: true; txId: string } | { ok: false };

/**
 * 결과 확인의 답. signed 는 창구가 서명을 검증한 뒤에만 나온다 — 서명된 원문은 부르는 쪽이 저장 원문과 다시 바이트 대조한다(INV-S2).
 * mismatch = 원문·서명·대상자 불일치(그 요청은 끝낸다) · unavailable = 연결 실패 등 다시 물으면 되는 오류(요청을 끝내지 않는다).
 */
export type SignatureResult =
  | { state: "pending" }
  | { state: "rejected" }
  | { state: "expired" }
  | { state: "mismatch" }
  | { state: "unavailable" }
  | { state: "signed"; method: SignatureMethod; signedPlaintext: string; signature: string; signedAt: string };

export type ApprovalSigner = {
  kind: SignatureMethod;
  /**
   * 서명 요청. envelope 는 서명 대상을 지정할 봉인된 이름·생년월일·휴대폰 번호(연결 정보) — 열지 않고 넘긴다.
   * creatorId 는 DB 가 그 요청의 크리에이터로 돌려준 ID — 게이트웨이가 봉투 안의 크리에이터 ID 와 대조한다(다른 크리에이터 봉투를 옮겨 붙이지 못하게).
   */
  requestSignature(input: { requestId: string; plaintext: string; requestMessage: string; envelope: Envelope; creatorId: string }): Promise<SignRequestStart>;
  /** 결과 확인. txId 는 요청 때 받은 거래 ID 그대로. */
  signatureResult(input: { requestId: string; txId: string; plaintext: string }): Promise<SignatureResult>;
};

const fakeSigner: ApprovalSigner = {
  kind: "fake",
  async requestSignature({ requestId }) {
    return { ok: true, txId: `fake-${requestId}` };
  },
  async signatureResult({ plaintext }) {
    return { state: "signed", method: "fake", signedPlaintext: plaintext, signature: "fake-signature", signedAt: new Date().toISOString() };
  },
};

const startReply = z.object({ requestId: z.string(), txId: z.string().regex(/^[0-9A-Za-z_.:-]{1,128}$/), expiresAt: z.string() });
const resultReply = z.union([
  z.object({ state: z.enum(["pending", "rejected", "expired"]) }),
  z.object({
    state: z.literal("signed"),
    method: z.string(),
    signedPlaintext: z.string(),
    signature: z.string().min(1).max(65536),
    signedAt: z.iso.datetime({ offset: true }),
  }),
]);

async function post(cfg: GatewayConfig, path: string, body: unknown, fetchImpl: typeof fetch): Promise<Response | null> {
  try {
    return await fetchImpl(`${cfg.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    console.error("서명 게이트웨이 요청 실패", e instanceof Error ? e.name : typeof e);
    return null;
  }
}

/** 게이트웨이 창구(kind "kakao"). fetchImpl 은 시험이 바꿔 넣는다. 로그에는 원문·봉투를 찍지 않는다(상태 코드만). */
export function createGatewaySigner(cfg: GatewayConfig, fetchImpl: typeof fetch = fetch): ApprovalSigner {
  return {
    kind: "kakao",
    async requestSignature({ requestId, plaintext, requestMessage, envelope, creatorId }) {
      const res = await post(cfg, "/v1/sign/requests", { requestId, plaintext, requestMessage, signer: { envelope, creatorId } }, fetchImpl);
      if (!res) return { ok: false };
      if (res.status !== 201) {
        console.error("서명 게이트웨이 요청 응답", res.status);
        return { ok: false };
      }
      const parsed = startReply.safeParse(await res.json().catch(() => null));
      if (!parsed.success || parsed.data.requestId !== requestId) {
        console.error("서명 게이트웨이 요청 응답 꼴이 틀림");
        return { ok: false };
      }
      return { ok: true, txId: parsed.data.txId };
    },
    async signatureResult({ requestId, txId, plaintext }) {
      const res = await post(cfg, `/v1/sign/requests/${encodeURIComponent(requestId)}/result`, { txId, plaintext }, fetchImpl);
      if (!res) return { state: "unavailable" };
      // 409 원문 불일치 · 422 서명/대상자 불일치(INV-S2·S4) — 그 요청은 끝난다
      if (res.status === 409 || res.status === 422) return { state: "mismatch" };
      if (res.status !== 200) {
        console.error("서명 게이트웨이 결과 응답", res.status);
        return { state: "unavailable" };
      }
      const parsed = resultReply.safeParse(await res.json().catch(() => null));
      if (!parsed.success) {
        console.error("서명 게이트웨이 결과 응답 꼴이 틀림");
        return { state: "unavailable" };
      }
      const r = parsed.data;
      if (r.state !== "signed") return { state: r.state };
      // 이 창구가 돌려줄 수 있는 방식은 kakao 하나 — 다른 방식이 오면 받지 않는다
      if (r.method !== "kakao") return { state: "mismatch" };
      return { state: "signed", method: "kakao", signedPlaintext: r.signedPlaintext, signature: r.signature, signedAt: r.signedAt };
    },
  };
}

type SignerEnv = TestSiteEnv & { SIGN_GATEWAY_URL?: string; SIGN_GATEWAY_TOKEN?: string };

export function chooseApprovalSigner(env: SignerEnv): ApprovalSigner | null {
  // 로컬·시험 사이트는 가짜 창구(게이트웨이 설정이 있어도) — 운영에서 가짜를 켜는 길은 시험 사이트 판정 하나뿐이다
  if (allowsFakeChannels(env)) return fakeSigner;
  // 운영: 게이트웨이 주소·토큰이 둘 다 있을 때만
  if (!env.SIGN_GATEWAY_URL?.trim() || !env.SIGN_GATEWAY_TOKEN?.trim()) return null;
  const cfg = readGatewayConfig(env);
  return cfg ? createGatewaySigner(cfg) : null;
}
