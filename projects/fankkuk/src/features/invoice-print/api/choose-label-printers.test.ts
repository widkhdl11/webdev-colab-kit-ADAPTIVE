import { describe, expect, it, vi } from "vitest";
import { chooseLabelPrinters } from "./choose-label-printers";
import type { LabelPrinters } from "./invoice-decryptor";

// 송장 출력을 어디서 할지 (address-protection 「복호화 함수」·INV-P12).

const printers = (tag: string): LabelPrinters => ({
  printLabel: async () => ({ kind: "failed", tag }) as never,
  printReturnLabel: async () => ({ kind: "failed", tag }) as never,
});
const TOKEN = "g".repeat(64);

describe("chooseLabelPrinters", () => {
  it("게이트웨이 주소가 있으면 게이트웨이 — 로컬은 만들지 않는다", () => {
    const local = vi.fn(() => printers("local"));
    const gateway = vi.fn(() => printers("gateway"));
    const got = chooseLabelPrinters({ SIGN_GATEWAY_URL: "https://sign.fankkuk.com", SIGN_GATEWAY_TOKEN: TOKEN }, { gateway, local }, () => {});
    expect(gateway).toHaveBeenCalledWith({ url: "https://sign.fankkuk.com", token: TOKEN });
    expect(local).not.toHaveBeenCalled();
    expect(got).not.toBeNull();
  });

  it("실패경로: 게이트웨이 설정이 틀리면 로컬로 넘어가지 않고 null", () => {
    const local = vi.fn(() => printers("local"));
    const gateway = vi.fn(() => printers("gateway"));
    for (const env of [
      { SIGN_GATEWAY_URL: "https://sign.fankkuk.com" }, // 토큰 없음
      { SIGN_GATEWAY_URL: "https://sign.fankkuk.com", SIGN_GATEWAY_TOKEN: "short" },
      { VERCEL_ENV: "production", SIGN_GATEWAY_URL: "http://sign.fankkuk.com", SIGN_GATEWAY_TOKEN: TOKEN },
      { SIGN_GATEWAY_URL: "https://sign.fankkuk.com/v1", SIGN_GATEWAY_TOKEN: TOKEN },
    ]) {
      const log = vi.fn();
      expect(chooseLabelPrinters(env, { gateway, local }, log)).toBeNull();
      expect(log).toHaveBeenCalledTimes(1);
    }
    expect(local).not.toHaveBeenCalled();
    expect(gateway).not.toHaveBeenCalled();
  });

  it("게이트웨이 주소가 없으면 로컬", () => {
    const local = vi.fn(() => printers("local"));
    const gateway = vi.fn(() => printers("gateway"));
    expect(chooseLabelPrinters({}, { gateway, local }, () => {})).not.toBeNull();
    expect(local).toHaveBeenCalledTimes(1);
    expect(gateway).not.toHaveBeenCalled();
  });

  it("INV-P12 (실패경로): 로컬을 만들지 못하면(운영 환경·설정 파일 없음) null", () => {
    const log = vi.fn();
    const got = chooseLabelPrinters(
      { VERCEL_ENV: "production" },
      {
        gateway: () => printers("gateway"),
        local: () => {
          throw new Error("임시 주소 열람 방식은 운영 환경에서 쓸 수 없다");
        },
      },
      log,
    );
    expect(got).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
