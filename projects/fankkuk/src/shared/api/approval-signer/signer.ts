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
//   POST {URL}/v1/sign/requests  Bearer 토큰  { requestId, plaintext, requestMessage, signer: { envelope, creatorId, phone?, minAge? } } → 201 { requestId, txId, expiresAt }
//     phone 은 가입 3단계 요청에만, minAge 는 가입 3단계와 설정의 승인 서명 연결에 붙는다(signup INV-U19 ②·INV-U16, approval-signature INV-S16).
//     게이트웨이는 phone 이 봉투 속 지정 번호·서명 결과 번호와 같은지(다르면 400), 서명 결과의 생년월일로 만 minAge 세 이상인지(아니면 422) 본다.
//     phone 이 있는데 minAge 가 없으면 400 — 가입 경로에서 나이 확인을 건너뛰지 못한다.
//   POST {URL}/v1/sign/requests/{requestId}/result  { txId, plaintext } → { state: pending|rejected|expired } | { state: signed, method, signedPlaintext, signature, signedAt }
//   409 원문 불일치 · 422 서명/대상자 불일치

/**
 * 요청 결과. down = 창구 장애(연결 실패·시간 초과·5xx·답 꼴 틀림 — signup INV-U20 의 판정 재료). 4xx(봉투·번호를 받지 않음)는 장애가 아니다.
 * retry = 한 번 더 불러도 되는가 — 요청이 딜러사에 닿지 못한 것이 확실할 때만(게이트웨이에 연결 못 함 · 게이트웨이 503 upstream_unreachable).
 * 시간 초과·502·답 꼴 틀림은 딜러사가 이미 카카오톡을 보냈을 수 있어 다시 부르지 않는다(카카오톡이 두 번 가지 않게, 2026-11-11 코드 리뷰).
 */
export type SignRequestStart = { ok: true; txId: string } | { ok: false; down: boolean; retry: boolean };

/** 로컬·시험 사이트 가짜 창구의 시험 번호 — 이 앞자리로 시작하는 번호로 가입 서명을 요청하면 창구 장애로 답한다(signup INV-U20 화면 확인용) */
export const FAKE_SIGN_DOWN_PHONE_PREFIX = "0109999";
/** 가짜 창구의 시험 번호 — 이 앞자리면 요청은 받고 결과는 서명 거절로 답한다 */
export const FAKE_SIGN_REJECT_PHONE_PREFIX = "0109998";
const FAKE_REJECT_TX = "fake-reject-";

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
   * phone 은 가입 3단계 요청만, minAge 는 가입 3단계와 승인 서명 연결이 넘긴다(위 HTTP 약속).
   */
  requestSignature(input: { requestId: string; plaintext: string; requestMessage: string; envelope: Envelope; creatorId: string; phone?: string; minAge?: number }): Promise<SignRequestStart>;
  /** 결과 확인. txId 는 요청 때 받은 거래 ID 그대로. */
  signatureResult(input: { requestId: string; txId: string; plaintext: string }): Promise<SignatureResult>;
};

const fakeSigner: ApprovalSigner = {
  kind: "fake",
  async requestSignature({ requestId, phone }) {
    if (phone?.startsWith(FAKE_SIGN_DOWN_PHONE_PREFIX)) return { ok: false, down: true, retry: true };
    if (phone?.startsWith(FAKE_SIGN_REJECT_PHONE_PREFIX)) return { ok: true, txId: `${FAKE_REJECT_TX}${requestId}` };
    return { ok: true, txId: `fake-${requestId}` };
  },
  async signatureResult({ txId, plaintext }) {
    if (txId.startsWith(FAKE_REJECT_TX)) return { state: "rejected" };
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

/** 게이트웨이 부르기 — 응답, 또는 부르지 못한 까닭(timeout = 보냈지만 답이 늦음 · unreachable = 닿지 못함) */
async function post(cfg: GatewayConfig, path: string, body: unknown, fetchImpl: typeof fetch): Promise<Response | "timeout" | "unreachable"> {
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
    // AbortSignal.timeout 이 던지는 DOMException 은 환경에 따라 Error 의 하위가 아니다 — 이름으로 본다
    const name = typeof e === "object" && e !== null && typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name : typeof e;
    console.error("서명 게이트웨이 요청 실패", name);
    return name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable";
  }
}

/** 게이트웨이 창구(kind "kakao"). fetchImpl 은 시험이 바꿔 넣는다. 로그에는 원문·봉투를 찍지 않는다(상태 코드만). */
export function createGatewaySigner(cfg: GatewayConfig, fetchImpl: typeof fetch = fetch): ApprovalSigner {
  return {
    kind: "kakao",
    async requestSignature({ requestId, plaintext, requestMessage, envelope, creatorId, phone, minAge }) {
      const signer = { envelope, creatorId, ...(phone === undefined ? {} : { phone }), ...(minAge === undefined ? {} : { minAge }) };
      const res = await post(cfg, "/v1/sign/requests", { requestId, plaintext, requestMessage, signer }, fetchImpl);
      // 연결 실패 — 장애, 게이트웨이에 닿지 못했으니 다시 불러도 된다 · 시간 초과 — 장애, 닿았을 수 있어 다시 부르지 않는다(signup INV-U20)
      if (res === "unreachable") return { ok: false, down: true, retry: true };
      if (res === "timeout") return { ok: false, down: true, retry: false };
      if (res.status !== 201) {
        console.error("서명 게이트웨이 요청 응답", res.status);
        // 4xx 는 이 요청을 받지 않은 것(봉투·번호) — 장애가 아니다. 503 은 게이트웨이가 딜러사에 닿지 못함(다시 불러도 된다). 그 밖의 5xx·답은 창구 오류
        if (res.status >= 400 && res.status < 500) return { ok: false, down: false, retry: false };
        return { ok: false, down: true, retry: res.status === 503 };
      }
      const parsed = startReply.safeParse(await res.json().catch(() => null));
      if (!parsed.success || parsed.data.requestId !== requestId) {
        console.error("서명 게이트웨이 요청 응답 꼴이 틀림");
        return { ok: false, down: true, retry: false };
      }
      return { ok: true, txId: parsed.data.txId };
    },
    async signatureResult({ requestId, txId, plaintext }) {
      const res = await post(cfg, `/v1/sign/requests/${encodeURIComponent(requestId)}/result`, { txId, plaintext }, fetchImpl);
      if (typeof res === "string") return { state: "unavailable" };
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
