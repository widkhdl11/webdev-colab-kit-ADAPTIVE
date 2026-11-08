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
    expect(host.textContent).toContain("주소 별칭을 선택해 주세요");
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
  it("INV-W15 · INV-P16: 반송 주소 확인 창에서는 「크리에이터가 보낸 선물을 받을 때 …」 안내를 빼고, 설정·받기 화면에서는 그대로 둔다", () => {
    const hint = () => host.querySelector("#fa-label-hint")?.textContent ?? "";
    act(() =>
      root.render(<FanAddressForm accountId={ACCOUNT} sealingKeyPem={publicPem} onSaved={() => {}} onCancel={() => {}} onLoginExpired={() => {}} />),
    );
    expect(hint()).toBe("등록한 주소는 다시 조회할 수 없습니다. 크리에이터가 보낸 선물을 받을 때 주소 별칭과 등록일로 확인해 주세요.");
    act(() =>
      root.render(
        <FanAddressForm accountId={ACCOUNT} sealingKeyPem={publicPem} receiveHint={false} onSaved={() => {}} onCancel={() => {}} onLoginExpired={() => {}} />,
      ),
    );
    expect(hint()).toBe("등록한 주소는 다시 조회할 수 없습니다.");
  });
});

describe("주소 검색과 할증 지역 구분 (address-protection INV-P20)", () => {
  const POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
  const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>("script")).filter((x) => x.src.includes("postcode"));
  const searchButton = () => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "주소 검색");
  let embedded: { oncomplete: (d: Record<string, string>) => void; target: Element | null }[];

  beforeEach(() => {
    for (const x of scripts()) x.remove();
    embedded = [];
    delete (window as { daum?: unknown }).daum;
  });

  function render() {
    act(() =>
      root.render(<FanAddressForm accountId={ACCOUNT} sealingKeyPem={publicPem} initialLabel="home" onSaved={() => {}} onCancel={() => {}} onLoginExpired={() => {}} />),
    );
  }

  /** 우편번호 서비스 스크립트가 다 내려온 것처럼 — 그 스크립트가 만드는 전역 객체를 두고 load 를 알린다 */
  async function scriptLoaded() {
    (window as { daum?: unknown }).daum = {
      Postcode: class {
        constructor(private readonly o: { oncomplete: (d: Record<string, string>) => void }) {}
        embed(target: Element) {
          embedded.push({ oncomplete: this.o.oncomplete, target });
        }
      },
    };
    await act(async () => {
      scripts()[0]!.dispatchEvent(new Event("load"));
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it("INV-P20 S20b: 주소 화면을 열기만 하면 우편번호 서비스 스크립트를 부르지 않는다 — 「주소 검색」을 누를 때 한 번만 부른다", async () => {
    render();
    expect(scripts()).toHaveLength(0);
    act(() => searchButton()!.click());
    expect(scripts().map((x) => x.src)).toEqual([POSTCODE_SRC]);
    await scriptLoaded();
    act(() => searchButton()!.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(scripts()).toHaveLength(1);
    expect(embedded).toHaveLength(2);
  });

  it("INV-P20 S20: 검색 결과로 우편번호·기본 주소를 채우고, 저장 요청에는 봉인 값·이름표·구분(제주)만 — 우편번호 평문이 없다", async () => {
    sendFanAddress.mockResolvedValue({ kind: "ok" });
    render();
    act(() => searchButton()!.click());
    await scriptLoaded();
    act(() => embedded[0]!.oncomplete({ zonecode: "63309", roadAddress: "제주특별자치도 제주시 첨단로 242", jibunAddress: "", address: "", userSelectedType: "R" }));
    expect(host.querySelector<HTMLInputElement>('input[name="zipCode"]')!.value).toBe("63309");
    expect(host.querySelector<HTMLInputElement>('input[name="address1"]')!.value).toBe("제주특별자치도 제주시 첨단로 242");
    type("recipientName", "김별빛");
    type("phone", "010-1234-5678");
    await submit();
    expect(sendFanAddress).toHaveBeenCalledTimes(1);
    const [envelope, label, region] = sendFanAddress.mock.calls[0] as [Envelope, string, string];
    expect([label, region]).toEqual(["home", "jeju"]);
    expect(JSON.stringify({ address: envelope, label, region })).not.toContain("63309");
  });

  it("INV-P20: 제주가 아닌 우편번호를 직접 넣으면 구분은 「할증 없음」", async () => {
    sendFanAddress.mockResolvedValue({ kind: "ok" });
    render();
    fill();
    await submit();
    expect(sendFanAddress.mock.calls[0]?.[2]).toBe("none");
  });
});
