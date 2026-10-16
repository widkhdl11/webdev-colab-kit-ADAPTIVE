import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readOpenedFanAddress } from "@/entities/address/model/fan-address-plaintext";
import { createDevKeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { openEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";

// 팬 받을 주소 입력 (address-protection INV-P1·P16·P17, reverse-gift INV-R5). 서버로 가는 저장 호출만 가짜로 두고,
// 봉인은 진짜로 한다 — 보내는 값에 평문이 없고, 연 내용에 그 팬의 계정이 묶였는지를 본다.
const sendFanAddress = vi.fn();
vi.mock("../api/send-fan-address", () => ({ sendFanAddress: (...a: unknown[]) => sendFanAddress(...a) }));

import { FanAddressForm } from "./fan-address-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACCOUNT = "00000000-0000-4000-a000-000000000001";
let publicPem: string;
let privatePem: string;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const pem = (label: string, der: ArrayBuffer) => `-----BEGIN ${label}-----\n${btoa(String.fromCharCode(...new Uint8Array(der)))}\n-----END ${label}-----`;
  publicPem = pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey));
  privatePem = pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey));
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  sendFanAddress.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function type(name: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!input) throw new Error(`칸 없음: ${name}`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit() {
  const form = host.querySelector("form");
  if (!form) throw new Error("폼 없음");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
  });
}

function fill() {
  type("zipCode", "04001");
  type("address1", "서울시 마포구 어울마당로 1");
  type("address2", "2층");
  type("recipientName", "김별빛");
  type("phone", "010-1234-5678");
}

describe("팬 받을 주소 입력 (INV-P1·P16·P17)", () => {
  it("INV-P17 S17: 저장 요청에는 봉인된 값과 고른 이름표만 — 평문이 없고, 연 내용에 그 팬의 계정이 묶여 있다", async () => {
    sendFanAddress.mockResolvedValue({ kind: "ok" });
    const onSaved = vi.fn();
    act(() =>
      root.render(<FanAddressForm accountId={ACCOUNT} sealingKeyPem={publicPem} onSaved={onSaved} onCancel={() => {}} onLoginExpired={() => {}} />),
    );
    fill();
    act(() => host.querySelector<HTMLInputElement>('input[type="radio"][value="home"]')!.click());
    await submit();
    expect(sendFanAddress).toHaveBeenCalledTimes(1);
    const [envelope, label] = sendFanAddress.mock.calls[0] as [Envelope, string];
    expect(label).toBe("home");
    const body = JSON.stringify({ address: envelope, label });
    for (const plain of ["마포구", "김별빛", "01012345678", "04001", ACCOUNT]) expect(body).not.toContain(plain);
    const dek = await createDevKeyUnwrapper({ privateKeyPem: privatePem, env: { NODE_ENV: "development" } }).unwrap(envelope.wrappedKey);
    const opened = readOpenedFanAddress(await openEnvelope(envelope, dek));
    expect(opened).toEqual({
      accountId: ACCOUNT,
      label: { recipientName: "김별빛", phone: "01012345678", zipCode: "04001", address1: "서울시 마포구 어울마당로 1", address2: "2층" },
    });
    expect(onSaved).toHaveBeenCalledWith("home");
  });

  it("INV-P16 S17b (실패경로): 이름표를 고르지 않으면 보내지 않는다", async () => {
    act(() =>
      root.render(<FanAddressForm accountId={ACCOUNT} sealingKeyPem={publicPem} onSaved={() => {}} onCancel={() => {}} onLoginExpired={() => {}} />),
    );
    fill();
    await submit();
    expect(sendFanAddress).not.toHaveBeenCalled();
    expect(host.textContent).toContain("이름표를 하나 골라 주세요");
  });

  it("INV-P1 (실패경로): 칸이 틀리면 보내지 않고 그 칸에 오류를 붙인다", async () => {
    act(() =>
      root.render(<FanAddressForm accountId={ACCOUNT} sealingKeyPem={publicPem} initialLabel="home" onSaved={() => {}} onCancel={() => {}} onLoginExpired={() => {}} />),
    );
    fill();
    type("zipCode", "12");
    await submit();
    expect(sendFanAddress).not.toHaveBeenCalled();
    expect(host.querySelector('input[name="zipCode"]')?.getAttribute("aria-invalid")).toBe("true");
  });
});
