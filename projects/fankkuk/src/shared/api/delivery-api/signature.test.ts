import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signWebhookBody, verifyWebhookSignature, WEBHOOK_TOLERANCE_SECONDS } from "./signature";

// delivery-status INV-DS7 — 웹훅 서명: 맞는 서명 · 틀린 서명 · 시각 초과 · 본문 한 글자 변조 · 서명 키 없음.
// 서명은 문서의 계산(HMAC-SHA256(키, `${시각}.${본문}`), 머리 `sha256=` + hex)을 시험 안에서 따로 만들어 비교한다 — 구현의 서명 함수에 기대지 않는다.

const HOOK_KEY = "whsec_test_0123456789abcdef";
const NOW_MS = Date.parse("2026-11-09T03:00:00Z");
const TS = String(Math.floor(NOW_MS / 1000));
const BODY = '{"event":"tracking.polled","items":[{"courierCode":"cj","trackingNumber":"123456789012","currentStatus":"DELIVERED"}]}';
const docSign = (secret: string, ts: string, body: string) => `sha256=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}`;
const verify = (o: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
  verifyWebhookSignature({ secret: HOOK_KEY, timestamp: TS, signature: docSign(HOOK_KEY, TS, BODY), rawBody: BODY, nowMs: NOW_MS, ...o });

describe("verifyWebhookSignature (INV-DS7)", () => {
  it("INV-DS7: 문서대로 만든 서명이면 ok — 머리 값 대소문자는 가리지 않는다", () => {
    expect(verify()).toBe("ok");
    expect(verify({ signature: docSign(HOOK_KEY, TS, BODY).toUpperCase().replace("SHA256=", "sha256=") })).toBe("ok");
    expect(signWebhookBody(HOOK_KEY, TS, BODY)).toBe(docSign(HOOK_KEY, TS, BODY));
  });

  it("INV-DS7 (실패경로): 다른 키로 만든 서명 · 서명 한 글자 바꿈 → mismatch", () => {
    expect(verify({ signature: docSign("whsec_other", TS, BODY) })).toBe("mismatch");
    const sig = docSign(HOOK_KEY, TS, BODY);
    const flipped = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verify({ signature: flipped })).toBe("mismatch");
  });

  it("INV-DS7 (실패경로): 본문 한 글자 변조 → mismatch (DELIVERED → DELIVERES)", () => {
    expect(verify({ rawBody: BODY.replace("DELIVERED", "DELIVERES") })).toBe("mismatch");
  });

  it("INV-DS7 (실패경로): 해석 뒤 다시 직렬화한 본문(공백만 다름)도 mismatch — 받은 그대로로만 검증한다", () => {
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 1);
    expect(reserialized).not.toBe(BODY);
    expect(verify({ rawBody: reserialized })).toBe("mismatch");
  });

  it("INV-DS7 (경계): 시각이 허용 오차(300초) 안이면 ok, 1초라도 넘으면 앞이든 뒤든 stale — 서명이 맞아도", () => {
    expect(WEBHOOK_TOLERANCE_SECONDS).toBe(300);
    for (const d of [-WEBHOOK_TOLERANCE_SECONDS, WEBHOOK_TOLERANCE_SECONDS]) {
      const ts = String(Number(TS) + d);
      expect(verify({ timestamp: ts, signature: docSign(HOOK_KEY, ts, BODY) })).toBe("ok");
    }
    for (const d of [-WEBHOOK_TOLERANCE_SECONDS - 1, WEBHOOK_TOLERANCE_SECONDS + 1]) {
      const ts = String(Number(TS) + d);
      expect(verify({ timestamp: ts, signature: docSign(HOOK_KEY, ts, BODY) })).toBe("stale");
    }
  });

  it("INV-DS7 (실패경로): 서명 키가 서버 설정에 없으면 어떤 서명도 받지 않는다", () => {
    expect(verify({ secret: null })).toBe("no_secret");
    expect(verify({ secret: "" })).toBe("no_secret");
  });

  it("INV-DS7 (실패경로): 머리가 없거나 꼴이 아니면 bad_header (밀리초 시각·접두어 없는 서명 포함)", () => {
    expect(verify({ timestamp: null })).toBe("bad_header");
    expect(verify({ signature: null })).toBe("bad_header");
    expect(verify({ timestamp: String(NOW_MS) })).toBe("bad_header");
    expect(verify({ signature: docSign(HOOK_KEY, TS, BODY).replace("sha256=", "") })).toBe("bad_header");
  });
});
