import { describe, expect, it, vi } from "vitest";
import { createGatewayLabelPrinters, readGatewayConfig } from "./gateway-client";

// 앱 서버 → 서명 게이트웨이 송장 출력 요청 (address-protection 「복호화 함수」 · INV-P2·P3·P8).
// 앱 서버는 로그인 토큰과 QR 만 보내고, 꼴이 맞는 응답만 넘긴다.

const TOKEN = "g".repeat(64);
const cfg = { url: "https://sign.fankkuk.com", token: TOKEN };
const LABEL = { recipientName: "시험하루", phone: "01099990000", zipCode: "06236", address1: "서울시 강남구 시험로 1", address2: "101호" };

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("readGatewayConfig", () => {
  it("주소가 없으면 null — 로컬 송장 출력 함수를 쓴다", () => {
    expect(readGatewayConfig({})).toBeNull();
  });
  it("토큰이 없거나 짧으면 설정 오류", () => {
    expect(() => readGatewayConfig({ SIGN_GATEWAY_URL: "https://sign.fankkuk.com" })).toThrow();
    expect(() => readGatewayConfig({ SIGN_GATEWAY_URL: "https://sign.fankkuk.com", SIGN_GATEWAY_TOKEN: "short" })).toThrow();
  });
  it("경로를 붙인 주소는 설정 오류 — 말없이 버리지 않는다", () => {
    expect(() => readGatewayConfig({ SIGN_GATEWAY_URL: "https://sign.fankkuk.com/v1", SIGN_GATEWAY_TOKEN: TOKEN })).toThrow();
    expect(() => readGatewayConfig({ SIGN_GATEWAY_URL: "https://sign.fankkuk.com?x=1", SIGN_GATEWAY_TOKEN: TOKEN })).toThrow();
  });
  it("운영에서는 https 만", () => {
    expect(() => readGatewayConfig({ VERCEL_ENV: "production", SIGN_GATEWAY_URL: "http://sign.fankkuk.com", SIGN_GATEWAY_TOKEN: TOKEN })).toThrow();
    expect(readGatewayConfig({ VERCEL_ENV: "production", SIGN_GATEWAY_URL: "https://sign.fankkuk.com/", SIGN_GATEWAY_TOKEN: TOKEN })).toEqual(cfg);
  });
});

describe("createGatewayLabelPrinters", () => {
  it("INV-P8: 로그인 토큰과 QR 만, 게이트웨이 토큰을 붙여 보낸다", async () => {
    const f = reply(200, { kind: "printed", waybill: "123456789012", reprint: false, label: LABEL });
    const { printLabel } = createGatewayLabelPrinters(cfg, f);
    expect(await printLabel({ qr: "Q1", accessToken: "A1" })).toEqual({ kind: "printed", waybill: "123456789012", reprint: false, label: LABEL });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://sign.fankkuk.com/v1/invoice/label");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ qr: "Q1", accessToken: "A1" });
    expect(init.redirect).toBe("error");
  });

  it("거부 사유는 그대로 넘긴다", async () => {
    const { printLabel } = createGatewayLabelPrinters(cfg, reply(200, { kind: "denied", reason: "no_valid_approval" }));
    expect(await printLabel({ qr: "Q", accessToken: "A" })).toEqual({ kind: "denied", reason: "no_valid_approval" });
  });

  it("반송 송장은 따로 — not_linked 를 넘긴다", async () => {
    const f = reply(200, { kind: "not_linked" });
    const { printReturnLabel } = createGatewayLabelPrinters(cfg, f);
    expect(await printReturnLabel({ qr: "Q", accessToken: "A" })).toEqual({ kind: "not_linked" });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://sign.fankkuk.com/v1/invoice/return-label");
  });

  it("실패경로: 200 이 아니면·꼴이 틀리면·연결이 안 되면 failed", async () => {
    for (const f of [
      reply(401, { error: "unauthorized" }),
      reply(503, { error: "invoice_not_ready" }),
      reply(200, { kind: "printed", waybill: "1", reprint: false }), // 라벨 없음
      reply(200, { kind: "denied", reason: "made_up" }),
      reply(200, { kind: "not_linked" }), // 팬 선물 송장에는 없는 답
      reply(200, "not json"),
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    ]) {
      const { printLabel } = createGatewayLabelPrinters(cfg, f as unknown as typeof fetch);
      expect(await printLabel({ qr: "Q", accessToken: "A" })).toEqual({ kind: "failed" });
    }
  });

  it("실패경로: 반송 송장도 200 이 아니면·꼴이 틀리면·없는 답(no_address)이면 failed", async () => {
    for (const f of [
      reply(503, { error: "invoice_not_ready" }),
      reply(200, { kind: "printed", waybill: "1", reprint: false }), // 라벨 없음
      reply(200, { kind: "no_address" }), // 반송 송장에는 없는 답
      reply(200, "not json"),
    ]) {
      const { printReturnLabel } = createGatewayLabelPrinters(cfg, f as unknown as typeof fetch);
      expect(await printReturnLabel({ qr: "Q", accessToken: "A" })).toEqual({ kind: "failed" });
    }
  });
});
