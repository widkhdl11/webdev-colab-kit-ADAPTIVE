import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupKakaoStep, type KakaoSignupOutcome } from "./signup-kakao-step";

// 크리에이터 가입 3단계 카카오톡 인증 알림 연결(signup INV-U19·U20 · UX 명세 signup.md 「2026-11-10」 kakao_* 상태).
// fetch 만 바꿔 끼우고 봉인(WebCrypto)·화면은 진짜를 쓴다. 가입 요청(completeSignup)은 부르는 쪽이 하므로 가짜 함수로 센다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQ = "11111111-2222-4333-8444-555555555555";
let pem: string;
let host: HTMLDivElement;
let root: Root;
type Reply = { status: number; body: unknown };
let replies: Reply[];
let bodies: Array<{ url: string; body: Record<string, unknown> }>;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  pem = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...spki))}\n-----END PUBLIC KEY-----`;
});

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  replies = [];
  bodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      bodies.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
      const r = replies.shift() ?? { status: 200, body: { state: "pending" } };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(opts: { complete?: () => Promise<KakaoSignupOutcome>; onDown?: () => void; pemOverride?: string | null } = {}) {
  const complete = vi.fn(opts.complete ?? (async () => ({ kind: "done" }) as KakaoSignupOutcome));
  const onDown = vi.fn(opts.onDown ?? (() => {}));
  function Host() {
    const [phone, setPhone] = useState("");
    return (
      <SignupKakaoStep
        sealingKeyPem={opts.pemOverride === undefined ? pem : opts.pemOverride}
        phone={phone}
        onPhoneChange={setPhone}
        onPrev={() => {}}
        onDown={onDown}
        completeSignup={complete}
        headingRef={() => {}}
        nav={null}
        doneHref="/signup/creator"
      />
    );
  }
  act(() => root.render(<Host />));
  return { complete, onDown };
}

function type(label: string, value: string) {
  const l = [...host.querySelectorAll<HTMLLabelElement>("label")].find((x) => x.textContent === label)!;
  const el = document.getElementById(l.htmlFor) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const fill = () => {
  type("이름", "김하루");
  type("생년월일", "19980315");
  type("휴대폰 번호", "01012345678");
};
const submit = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.type === "submit")!;
const settle = async () => {
  for (let i = 0; i < 30; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
};
const press = async () => {
  act(() => submit().click());
  await settle();
};

describe("INV-U19·U20: 크리에이터 3단계 화면", () => {
  it("INV-U20: 입력 상태에는 6자리 인증·「나중에 하기」로 가는 버튼이 없다 — 「이전 | 카카오톡 인증 요청」뿐", () => {
    render();
    const labels = [...host.querySelectorAll("button, a")].map((b) => b.textContent?.trim());
    expect(labels).toEqual(["이전", "카카오톡 인증 요청"]);
    expect(host.textContent).not.toMatch(/인증번호|나중에 하기/);
  });

  it("INV-U19 ⑤: 요청 본문에는 봉인된 정보·크리에이터 ID·번호뿐 — 이름·생년월일 평문이 없다. 기다리는 중에는 칸이 읽기 전용", async () => {
    replies = [{ status: 200, body: { state: "pending", requestId: REQ, expiresAt: new Date(Date.now() + 300_000).toISOString() } }];
    render();
    fill();
    await press();
    const sent = bodies.find((b) => b.url === "/api/signup/sign")!;
    expect(Object.keys(sent.body).sort()).toEqual(["creatorId", "identity", "phone"]);
    expect(JSON.stringify(sent.body)).not.toMatch(/김하루|19980315/);
    expect(host.textContent).toContain("010-1234-5678의 카카오톡으로 서명 요청을 보냈습니다.");
    expect(submit().textContent).toContain("확인 기다리는 중");
    expect([...host.querySelectorAll("input")].every((i) => i.readOnly)).toBe(true);
  });

  it("INV-U19 ① (S19): 서버가 「확인됨」이라고 답하면 가입을 한 번만 보내고 완료 — 「다음」 하나(이전 없음)가 4단계로 간다", async () => {
    replies = [
      { status: 200, body: { state: "pending", requestId: REQ, expiresAt: new Date(Date.now() + 300_000).toISOString() } },
      { status: 200, body: { state: "verified" } },
    ];
    const { complete } = render();
    fill();
    await press();
    await settle();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("카카오톡 인증 알림 연결이 완료되었습니다.");
    const actions = [...host.querySelectorAll("button, a")].map((b) => [b.textContent?.trim(), b.getAttribute("href")]);
    expect(actions).toEqual([["다음", "/signup/creator"]]);
  });

  it("INV-U1 (실패경로): 서버가 「확인됨」이라고 하기 전에는 가입을 보내지 않는다 — 기다림·실패에서는 completeSignup 0번", async () => {
    replies = [
      { status: 200, body: { state: "pending", requestId: REQ, expiresAt: new Date(Date.now() + 300_000).toISOString() } },
      { status: 200, body: { state: "failed" } },
    ];
    const { complete } = render();
    fill();
    await press();
    await settle();
    expect(complete).not.toHaveBeenCalled();
    // 실패·기한 지남 — 3단계 빨간 오류 상자, 칸이 다시 열린다
    const box = host.querySelector(".err[role='alert']")!;
    expect(box.textContent).toBe("카카오톡 인증이 완료되지 않았습니다. 다시 요청해 주세요.");
    expect([...host.querySelectorAll("input")].some((i) => i.readOnly)).toBe(false);
    expect(submit().textContent).toContain("카카오톡 인증 요청");
  });

  it("INV-U20 (S20): 서버가 창구 장애를 확인했다고 답할 때만 6자리 길로 넘긴다(onDown) — 서버 거부(한도 등)는 상자에 문구만", async () => {
    replies = [{ status: 200, body: { state: "down" } }];
    const down = render();
    fill();
    await press();
    expect(down.onDown).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    root = createRoot(host);
    replies = [{ status: 429, body: { message: "요청이 많아 지금은 보낼 수 없습니다. 1시간 뒤에 다시 요청해 주세요." } }];
    const limited = render();
    fill();
    await press();
    expect(limited.onDown).not.toHaveBeenCalled();
    expect(host.querySelector(".err[role='alert']")?.textContent).toContain("1시간 뒤에 다시 요청해 주세요");
  });

  it("INV-U3·U11 (S19d): 서명 뒤 「이미 가입된 번호」면 지금 3단계 exists 상자 그대로 — 문구 + 「로그인」", async () => {
    replies = [
      { status: 200, body: { state: "pending", requestId: REQ, expiresAt: new Date(Date.now() + 300_000).toISOString() } },
      { status: 200, body: { state: "exists" } },
    ];
    render();
    fill();
    await press();
    await settle();
    const box = host.querySelector(".err[role='alert']")!;
    expect(box.textContent).toContain("이 번호로 가입된 계정이 있습니다.");
    expect(box.querySelector("a")?.getAttribute("href")).toBe("/login");
  });
});
