import { createHmac, timingSafeEqual } from "node:crypto";

// 웹훅 서명 검증 (delivery-status INV-DS7). 서버 전용.
// 근거: https://www.deliveryapi.co.kr/blog/webhook-guide · /docs (2026-11-09 읽음)
// - 머리 X-Webhook-Signature = "sha256=" + hex(HMAC-SHA256(서명 키, `${X-Webhook-Timestamp}.${받은 본문 그대로}`))
// - X-Webhook-Timestamp = 유닉스 시각(초). 문서 예시는 300초 허용.
// 본문은 받은 문자열 그대로 검증한다 — 해석한 뒤 다시 직렬화하면 공백·키 순서가 바뀌어 서명이 달라진다.

/** 시각 허용 오차(초) — 문서 예시 300초, Stripe·Slack 웹훅 기본값 5분과 같다 */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export type SignatureVerdict = "ok" | "no_secret" | "bad_header" | "stale" | "mismatch";

export type SignatureInput = {
  secret: string | null;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowMs: number;
};

export function verifyWebhookSignature(input: SignatureInput): SignatureVerdict {
  if (!input.secret) return "no_secret";
  const ts = input.timestamp?.trim() ?? "";
  const sig = input.signature?.trim() ?? "";
  if (!/^\d{9,11}$/.test(ts) || !/^sha256=[0-9a-f]{64}$/i.test(sig)) return "bad_header";
  if (Math.abs(input.nowMs / 1000 - Number(ts)) > WEBHOOK_TOLERANCE_SECONDS) return "stale";
  const expected = Buffer.from(`sha256=${createHmac("sha256", input.secret).update(`${ts}.${input.rawBody}`, "utf8").digest("hex")}`, "utf8");
  const given = Buffer.from(sig.toLowerCase(), "utf8");
  if (expected.length !== given.length) return "mismatch";
  return timingSafeEqual(expected, given) ? "ok" : "mismatch";
}

/** 시험·도구용 — 같은 규칙으로 서명 머리 값을 만든다 */
export function signWebhookBody(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}
