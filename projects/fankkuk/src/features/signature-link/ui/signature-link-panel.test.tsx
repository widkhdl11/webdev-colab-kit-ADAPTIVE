import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const router = { refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SignatureLinkPanel } from "./signature-link-panel";

// 승인 서명 연결하기 카드(approval-signature INV-S16 · UX 명세 signup.md step 5). 요청 본문에는 봉인된 연결 정보뿐이고,
// 「연결됨」은 서버 답으로만 바뀐다. fetch 만 바꿔 끼우고 봉인(WebCrypto)·화면은 진짜를 쓴다.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REQ = "11111111-2222-4333-8444-555555555555";
let pem: string;
let host: HTMLDivElement;
let root: Root;
type Reply = { status: number; body: unknown };
let replies: Array<Reply | Promise<Reply>>;
let bodies: Array<{ url: string; body: string }>;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
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
      bodies.push({ url, body: String(init.body) });
      const r = await (replies.shift() ?? { status: 200, body: { state: "pending", linkedAt: null } });
      return new Response(JSON.stringify(r.body), { status: r.status });
    }),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(extra: Partial<Parameters<typeof SignatureLinkPanel>[0]> = {}) {
  act(() =>
    root.render(
      <SignatureLinkPanel creatorId="c1" sealingKeyPem={pem} initialPhone="01012345678" prevHref="/signup/creator?step=4" laterHref="/creator" done={{ label: "가입 완료", href: "/creator" }} {...extra} />,
    ),
  );
}

function type(label: string, value: string) {
  const input = [...host.querySelectorAll<HTMLLabelElement>("label")].find((l) => l.textContent === label)!;
  const el = document.getElementById(input.htmlFor) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const submit = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.type === "submit")!;
const settle = async (ms = 0) => {
  for (let i = 0; i < 20; i++) await act(async () => new Promise((r) => setTimeout(r, ms)));
};

describe("INV-S16: 승인 서명 연결하기 카드", () => {
  it("INV-S16 S16: 요청 본문에는 봉인된 연결 정보만 — 이름·생년월일·번호 평문이 없다. 서버가 linked 라고 해야 완료가 보인다", async () => {
    render();
    expect((document.querySelector("input[type=tel]") as HTMLInputElement).value).toBe("010-1234-5678");
    type("이름", "정재원");
    type("생년월일", "19900115");
    replies.push({ status: 200, body: { requestId: REQ, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    replies.push({ status: 200, body: { state: "linked", linkedAt: "2026-10-29T01:00:00Z" } });
    act(() => submit().click());
    await settle();
    expect(bodies[0]?.url).toBe("/api/creator/signature-link");
    const sent = JSON.parse(bodies[0]!.body) as { identity: Record<string, unknown> };
    expect(Object.keys(sent)).toEqual(["identity"]);
    expect(Object.keys(sent.identity).sort()).toEqual(["alg", "ciphertext", "iv", "v", "wrappedKey"]);
    for (const plain of ["정재원", "19900115", "01012345678", "010-1234-5678"]) expect(bodies[0]!.body).not.toContain(plain);
    expect(bodies[1]).toEqual({ url: "/api/creator/signature-link/result", body: JSON.stringify({ requestId: REQ }) });
    expect(host.textContent).toContain("승인 서명 연결이 완료되었습니다.");
    expect(host.querySelector<HTMLAnchorElement>("a.btn")?.textContent).toBe("가입 완료");
  });

  it("INV-S16 S16c (실패경로): 서버가 failed 면 완료가 아니라 실패 문구, 칸이 다시 열린다", async () => {
    render();
    type("이름", "정재원");
    type("생년월일", "19900115");
    replies.push({ status: 200, body: { requestId: REQ, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    replies.push({ status: 200, body: { state: "failed", linkedAt: null } });
    act(() => submit().click());
    await settle();
    expect(host.textContent).not.toContain("승인 서명 연결이 완료되었습니다.");
    expect(host.querySelector("[role=alert]")?.textContent).toBe("카카오톡 인증이 완료되지 않았습니다. 다시 요청해 주세요.");
    expect(host.querySelector<HTMLInputElement>("input[type=text]")?.readOnly).toBe(false);
    expect(submit().textContent).toBe("카카오톡 인증 요청");
  });

  it("INV-S16: 기다리는 동안 칸은 읽기 전용, 보낸 번호와 「다시 보내기」·「확인 기다리는 중」", async () => {
    render();
    type("이름", "정재원");
    type("생년월일", "19900115");
    replies.push({ status: 200, body: { requestId: REQ, expiresAt: new Date(Date.now() + 600_000).toISOString() } });
    act(() => submit().click());
    await settle();
    expect(host.textContent).toContain("010-1234-5678의 카카오톡으로 서명 요청을 보냈습니다.");
    expect(submit().textContent).toBe("확인 기다리는 중");
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    expect(host.querySelector<HTMLInputElement>("input[type=text]")?.readOnly).toBe(true);
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "다시 보내기")).toBe(true);
  });

  it("INV-S16 (실패경로): 틀린 생년월일이면 보내지 않고 그 칸에 안내", async () => {
    render();
    type("이름", "정재원");
    type("생년월일", "19901350");
    act(() => submit().click());
    await settle();
    expect(bodies).toEqual([]);
    expect(host.textContent).toContain("생년월일 8자리를 확인해 주세요.");
  });

  it("INV-S16 S16d (실패경로): 서버가 창구 없음(503)이면 그 문구, 연결되지 않는다", async () => {
    render();
    type("이름", "정재원");
    type("생년월일", "19900115");
    replies.push({ status: 503, body: { message: "현재 승인 서명을 연결할 수 없습니다." } });
    act(() => submit().click());
    await settle();
    expect(host.querySelector("[role=alert]")?.textContent).toBe("현재 승인 서명을 연결할 수 없습니다.");
    expect(bodies).toHaveLength(1);
  });

  it("「나중에 하기」·「이전」은 부르는 곳이 정한 곳으로, 설정 화면처럼 laterHref 가 없으면 「나중에 하기」가 없다", () => {
    render();
    const links = () => [...host.querySelectorAll<HTMLAnchorElement>("a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links()).toEqual([
      ["이전", "/signup/creator?step=4"],
      ["나중에 하기", "/creator"],
    ]);
    render({ laterHref: undefined, prevHref: "/creator/settings#more" });
    expect(links()).toEqual([["이전", "/creator/settings#more"]]);
  });
});

describe("INV-S16: 다시 보내기·늦게 온 답·이어 묻기", () => {
  const REQ2 = "22222222-3333-4444-8555-666666666666";
  const later = () => new Date(Date.now() + 600_000).toISOString();

  it("INV-S16 S16c: 다시 보낸 뒤 늦게 온 앞 요청의 실패 답은 버린다 — 새 요청을 계속 기다린다", async () => {
    render();
    type("이름", "정재원");
    type("생년월일", "19900115");
    let answerOld: (r: Reply) => void = () => {};
    replies.push({ status: 200, body: { requestId: REQ, expiresAt: later() } });
    replies.push(new Promise<Reply>((resolve) => (answerOld = resolve)));
    act(() => submit().click());
    await settle();
    expect(bodies.map((b) => b.url)).toEqual(["/api/creator/signature-link", "/api/creator/signature-link/result"]);
    // 앞 요청의 결과를 묻는 동안 「다시 보내기」 — 새 요청은 곧바로 따로 묻는다(아직 대기)
    replies.push({ status: 200, body: { requestId: REQ2, expiresAt: later() } });
    replies.push({ status: 200, body: { state: "pending", linkedAt: null } });
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "다시 보내기")!.click());
    await settle();
    expect(bodies.at(-1)).toEqual({ url: "/api/creator/signature-link/result", body: JSON.stringify({ requestId: REQ2 }) });
    // 앞 요청의 답(다른 요청으로 바뀌어 실패)이 이제 도착 — 화면은 그대로 기다리는 중
    answerOld({ status: 200, body: { state: "failed", linkedAt: null } });
    await settle();
    expect(host.querySelector("[role=alert]")).toBeNull();
    expect(submit().textContent).toBe("확인 기다리는 중");
  });

  it("INV-S16: 화면을 떠났다 돌아오면 서버가 넘긴 대기 요청을 이어 묻는다 — 요청 ID 만 보내고, 연결되면 완료", async () => {
    replies.push({ status: 200, body: { state: "linked", linkedAt: "2026-10-29T01:00:00Z" } });
    render({ pending: { requestId: REQ2, expiresAt: later() }, initialPhone: "" });
    await settle();
    expect(bodies).toEqual([{ url: "/api/creator/signature-link/result", body: JSON.stringify({ requestId: REQ2 }) }]);
    expect(host.textContent).toContain("승인 서명 연결이 완료되었습니다.");
  });

  it("INV-S16: 이어 볼 때 보낸 번호를 모르면 번호 없이 안내하고, 「다시 보내기」를 누르면 칸을 다시 연다", async () => {
    render({ pending: { requestId: REQ2, expiresAt: later() }, initialPhone: "" });
    await settle();
    expect(host.textContent).toContain("카카오톡으로 서명 요청을 보냈습니다.");
    expect(host.querySelector<HTMLInputElement>("input[type=text]")?.readOnly).toBe(true);
    act(() => [...host.querySelectorAll("button")].find((b) => b.textContent === "다시 보내기")!.click());
    await settle();
    expect(host.querySelector<HTMLInputElement>("input[type=text]")?.readOnly).toBe(false);
    expect(submit().textContent).toBe("카카오톡 인증 요청");
    expect(bodies.every((b) => b.url.endsWith("/result"))).toBe(true);
  });

  it("INV-S16 (실패경로): 기한이 지난 대기 요청은 이어 묻지 않는다 — 입력부터", async () => {
    render({ pending: { requestId: REQ2, expiresAt: new Date(Date.now() - 1000).toISOString() } });
    await settle();
    expect(bodies).toEqual([]);
    expect(submit().textContent).toBe("카카오톡 인증 요청");
  });
});
