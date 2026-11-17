// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
import { sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";

// 주소 저장 요청·결과 확인 라우트 (address-protection INV-P22 ①·②, INV-P13). 진짜 모델과 진짜 가짜 창구(fake)를 쓰고, DB 만 함수 이름별 답을 정해 둔다.
// 보는 것: 응답 본문에 주소 봉투·연결 봉투·원문이 실리지 않는다 · 누구의 주소인지는 세션에서만 · 상태 코드.

const REQ = "5f0b2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f";
const CREATOR_ID = "00000000-0000-4000-b000-000000000001";
const PAYLOAD = `팬꾹 배송지 등록\n요청 ID: ${REQ}\n요청 시각: 2026-11-17T10:00:00.000Z\n주소 별칭: 집`;

const state = vi.hoisted(() => ({
  viewer: null as Viewer | null,
  calls: [] as { fn: string; args: unknown }[],
  replies: {} as Record<string, unknown>,
}));

vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: async () => ({}) }));
vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => ({
    rpc: async (fn: string, args: unknown) => {
      state.calls.push({ fn, args });
      return { data: state.replies[fn] ?? null, error: null };
    },
  }),
}));
vi.mock("@/entities/session/model/viewer", () => ({ readViewer: async () => state.viewer }));

const { POST: start } = await import("./route");
const { POST: result } = await import("./result/route");

const SITE = "http://127.0.0.1:3311";
const post = (path: string, body: unknown) =>
  new Request(`${SITE}${path}`, { method: "POST", headers: { origin: SITE, host: "127.0.0.1:3311", "content-type": "application/json" }, body: JSON.stringify(body) });

let envelope: Envelope;
let linkEnvelope: Envelope;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, false, ["encrypt", "decrypt"]);
  envelope = JSON.parse(JSON.stringify(await sealEnvelope("{\"address1\":\"서울시 강남구 테헤란로 123\"}", pair.publicKey))) as Envelope;
  linkEnvelope = JSON.parse(JSON.stringify(await sealEnvelope("{\"name\":\"하루\"}", pair.publicKey))) as Envelope;
});

beforeEach(() => {
  state.viewer = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" };
  state.calls = [];
  state.replies = {};
});

describe("POST /api/creator/address — 요청 만들기 (INV-P22 ①)", () => {
  it("INV-P22 ① S22: 새 요청이면 200 { state: waiting, requestId, expiresAt } 만 — 주소 봉투·연결 봉투·원문이 응답에 없다", async () => {
    state.replies = {
      start_creator_address_sign: [{ result: "started", request_id: REQ, payload: PAYLOAD, expires_at: "2026-11-17T10:05:00.000Z", envelope: linkEnvelope, creator_id: CREATOR_ID }],
      record_creator_address_sign_tx: "recorded",
    };
    const res = await start(post("/api/creator/address", { address: envelope, label: "home", region: "none", actorId: "someone" }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ state: "waiting", requestId: REQ, expiresAt: "2026-11-17T10:05:00.000Z" });
    expect(text).not.toContain(String(envelope.ciphertext));
    expect(text).not.toContain(String(linkEnvelope.ciphertext));
    expect(text).not.toContain("배송지");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((state.calls[0]!.args as { p_actor_id: string }).p_actor_id).toBe("00000000-0000-4000-a000-000000000011");
  });

  it("INV-P22 ④ S22c: 가입 서명 갈음이면 200 { state: saved }", async () => {
    state.replies = { start_creator_address_sign: [{ result: "saved_signup", request_id: null, payload: null, expires_at: null, envelope: null, creator_id: null }] };
    const res = await start(post("/api/creator/address", { address: envelope, label: "home", region: "none" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "saved" });
  });

  it("INV-P22 ① S22d (실패경로): 연결 없음은 409 { message, code: not_linked } · 한도는 429 { code: too_many }", async () => {
    state.replies = { start_creator_address_sign: [{ result: "not_linked", request_id: null, payload: null, expires_at: null, envelope: null, creator_id: null }] };
    const res = await start(post("/api/creator/address", { address: envelope, label: "home", region: "none" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "not_linked", message: expect.stringContaining("카카오톡 인증 알림") });
    state.replies = { start_creator_address_sign: [{ result: "too_many", request_id: null, payload: null, expires_at: null, envelope: null, creator_id: null }] };
    const limited = await start(post("/api/creator/address", { address: envelope, label: "home", region: "none" }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: "too_many" });
  });

  it("INV-P13 (실패경로): 로그인하지 않았으면 401 — DB 를 부르지 않는다", async () => {
    state.viewer = null;
    expect((await start(post("/api/creator/address", { address: envelope, label: "home", region: "none" }))).status).toBe(401);
    expect(state.calls).toEqual([]);
  });
});

describe("POST /api/creator/address/result — 결과 확인 (INV-P22 ②)", () => {
  it("INV-P22 ② S22: 서명되면 200 { state: saved } 만 — 원문이 응답에 없다", async () => {
    state.replies = {
      creator_address_sign_request: [{ state: "pending", payload: PAYLOAD, method: "fake", gateway_tx_id: "fake-tx" }],
      settle_creator_address_sign: [{ result: "saved" }],
    };
    const res = await result(post("/api/creator/address/result", { requestId: REQ }));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ state: "saved" });
    expect(text).not.toContain("배송지");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("INV-P22 ② S22a (실패경로): 거절은 200 { state: rejected } — 저장됨이 아니다", async () => {
    state.replies = { creator_address_sign_request: [{ state: "rejected", payload: null, method: null, gateway_tx_id: null }] };
    const res = await result(post("/api/creator/address/result", { requestId: REQ }));
    expect(await res.json()).toEqual({ state: "rejected" });
  });

  it("INV-P13 (실패경로): 팬 계정이면 403 — DB 를 부르지 않는다", async () => {
    state.viewer = { userId: "f", role: "fan" };
    expect((await result(post("/api/creator/address/result", { requestId: REQ }))).status).toBe(403);
    expect(state.calls).toEqual([]);
  });
});
