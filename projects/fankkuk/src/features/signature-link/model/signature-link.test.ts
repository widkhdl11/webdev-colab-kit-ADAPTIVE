// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { chooseApprovalSigner, type ApprovalSigner } from "@/shared/api/approval-signer/signer";
import { sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { checkLinkIdentity, linkIdentityPlaintext } from "./link-identity";
import { checkSignatureLink, startSignatureLink } from "./signature-link";

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const REQ = "11111111-2222-4333-8444-555555555555";
const PAYLOAD = `fankkuk-signature-link:v1|req=${REQ}|at=2026-10-29T01:02:03.000Z`;
const signer = chooseApprovalSigner({ NODE_ENV: "test" });
const IP = "a".repeat(64);

let identity: Envelope;
beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
  const plain = linkIdentityPlaintext({ name: "정재원", birth: "19900115", phone: "010-1234-5678" }, "c1");
  identity = JSON.parse(JSON.stringify(await sealEnvelope(plain, pair.publicKey))) as Envelope;
});

type Reply = { data?: unknown; error?: { code: string } | null };
function fakeAdmin(replies: Record<string, Reply>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        const r = replies[fn] ?? { data: null };
        return { data: r.data ?? null, error: r.error ?? null };
      },
    } as never,
  };
}

const started = { start_signature_link: { data: [{ result: "started", request_id: REQ, payload: PAYLOAD, expires_at: "2026-10-29T01:12:03Z" }] } };

describe("INV-S16: 연결 요청 시작", () => {
  it("INV-S16 S16: 세션의 크리에이터와 봉인 하나, 창구 방식만 DB 에 넘기고 창구에 시험 서명을 요청한다", async () => {
    const f = fakeAdmin(started);
    const asked: unknown[] = [];
    const spy: ApprovalSigner = { ...signer!, requestLinkSignature: async (i) => (asked.push(i), { ok: true }) };
    const body = { identity, actorId: "someone", linked: true, name: "정재원" };
    expect(await startSignatureLink({ admin: f.admin, viewer: HARU, signer: spy }, body, IP)).toEqual({ ok: true, requestId: REQ, expiresAt: "2026-10-29T01:12:03Z" });
    expect(f.calls).toEqual([{ fn: "start_signature_link", args: { p_actor_id: HARU.userId, p_envelope: identity, p_method: "fake", p_ip_hash: IP } }]);
    expect(asked).toEqual([{ requestId: REQ, payload: PAYLOAD, identity }]);
  });

  it("INV-S16 (실패경로): 평문 이름·번호·봉인 형식이 아닌 값은 거부 — DB 를 부르지 않는다", async () => {
    for (const body of [{ identity: { name: "정재원", birth: "19900115", phone: "01012345678" } }, { name: "정재원" }, null, { identity: { ...identity, v: 2 } }]) {
      const f = fakeAdmin(started);
      expect(await startSignatureLink({ admin: f.admin, viewer: HARU, signer }, body, IP)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-S16 S16d (실패경로): 창구가 없으면(운영) 503 — DB 요청도 만들지 않는다", async () => {
    const f = fakeAdmin(started);
    const prodSigner = chooseApprovalSigner({ NODE_ENV: "production" });
    expect(await startSignatureLink({ admin: f.admin, viewer: HARU, signer: prodSigner }, { identity }, IP)).toMatchObject({ ok: false, status: 503 });
    expect(f.calls).toEqual([]);
  });

  it("INV-S16 (실패경로): 로그인 전 401, 팬·운영자 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeAdmin(started);
      expect(await startSignatureLink({ admin: f.admin, viewer, signer }, { identity }, IP)).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-S16 (실패경로): DB 가 이 방식을 받지 않거나 한도에 닿으면 창구에 요청하지 않는다", async () => {
    for (const [result, status] of [
      ["method_refused", 503],
      ["too_many", 429],
      ["too_many_day", 429],
      ["not_creator", 403],
    ] as const) {
      const f = fakeAdmin({ start_signature_link: { data: [{ result, request_id: null, payload: null, expires_at: null }] } });
      let asked = 0;
      const spy: ApprovalSigner = { ...signer!, requestLinkSignature: async () => (asked++, { ok: true }) };
      expect(await startSignatureLink({ admin: f.admin, viewer: HARU, signer: spy }, { identity }, IP)).toMatchObject({ ok: false, status });
      expect(asked).toBe(0);
    }
  });

  it("INV-S16 (실패경로): 창구가 요청을 받지 못하면 그 요청을 실패로 닫는다", async () => {
    const f = fakeAdmin(started);
    const spy: ApprovalSigner = { ...signer!, requestLinkSignature: async () => ({ ok: false }) };
    expect(await startSignatureLink({ admin: f.admin, viewer: HARU, signer: spy }, { identity }, IP)).toMatchObject({ ok: false, status: 503 });
    expect(f.calls.at(-1)).toEqual({
      fn: "settle_signature_link",
      args: { p_actor_id: HARU.userId, p_request_id: REQ, p_outcome: "failed", p_signed_content: null, p_method: "fake" },
    });
  });
});

describe("INV-S16: 연결 결과 확인", () => {
  const pending = { signature_link_request: { data: [{ state: "pending", payload: PAYLOAD, method: "fake" }] } };

  it("INV-S16 S16: 창구가 서명하면 서명된 원문을 DB 에 넘기고, DB 가 연결로 적었을 때만 linked", async () => {
    const f = fakeAdmin({ ...pending, settle_signature_link: { data: [{ result: "linked", linked_at: "2026-10-29T01:03:00Z" }] } });
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer }, { requestId: REQ })).toEqual({ ok: true, state: "linked", linkedAt: "2026-10-29T01:03:00Z" });
    expect(f.calls).toEqual([
      { fn: "signature_link_request", args: { p_actor_id: HARU.userId, p_request_id: REQ } },
      { fn: "settle_signature_link", args: { p_actor_id: HARU.userId, p_request_id: REQ, p_outcome: "signed", p_signed_content: PAYLOAD, p_method: "fake" } },
    ]);
  });

  it("INV-S16 S16c (실패경로): 브라우저가 「연결됨」·서명 값을 꾸며 보내도 쓰지 않는다 — DB 가 failed 면 failed", async () => {
    const f = fakeAdmin({ ...pending, settle_signature_link: { data: [{ result: "failed", linked_at: null }] } });
    const body = { requestId: REQ, state: "linked", signedContent: "anything", linked: true };
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer }, body)).toEqual({ ok: true, state: "failed", linkedAt: null });
    const settle = f.calls.find((c) => c.fn === "settle_signature_link");
    expect(settle?.args.p_signed_content).toBe(PAYLOAD);
  });

  it("INV-S16 S16c (실패경로): 창구가 실패로 답하면 서명 원문 없이 failed 로 적는다", async () => {
    const f = fakeAdmin({ ...pending, settle_signature_link: { data: [{ result: "failed", linked_at: null }] } });
    const spy: ApprovalSigner = { ...signer!, linkSignatureResult: async () => ({ state: "failed" }) };
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer: spy }, { requestId: REQ })).toMatchObject({ state: "failed" });
    expect(f.calls.at(-1)?.args).toMatchObject({ p_outcome: "failed", p_signed_content: null });
  });

  it("INV-S16: 창구가 아직 대기면 DB 에 적지 않고 pending", async () => {
    const f = fakeAdmin(pending);
    const spy: ApprovalSigner = { ...signer!, linkSignatureResult: async () => ({ state: "pending" }) };
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer: spy }, { requestId: REQ })).toEqual({ ok: true, state: "pending", linkedAt: null });
    expect(f.calls.map((c) => c.fn)).toEqual(["signature_link_request"]);
  });

  it("INV-S16 S16c (실패경로): 10분이 지난 요청(expired)은 창구에 묻지 않고 failed", async () => {
    const f = fakeAdmin({ signature_link_request: { data: [{ state: "expired", payload: null, method: null }] } });
    let asked = 0;
    const spy: ApprovalSigner = { ...signer!, linkSignatureResult: async () => (asked++, { state: "pending" }) };
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer: spy }, { requestId: REQ })).toEqual({ ok: true, state: "failed", linkedAt: null });
    expect(asked).toBe(0);
  });

  it("INV-S16 (실패경로): 남의 요청·없는 요청·요청 ID 꼴이 아니면 404", async () => {
    const f = fakeAdmin({ signature_link_request: { data: [{ state: "not_found", payload: null, method: null }] } });
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer }, { requestId: REQ })).toMatchObject({ ok: false, status: 404 });
    const g = fakeAdmin(pending);
    expect(await checkSignatureLink({ admin: g.admin, viewer: HARU, signer }, { requestId: "x" })).toMatchObject({ ok: false, status: 404 });
    expect(g.calls).toEqual([]);
  });

  it("INV-S16 S16d (실패경로): 창구가 없으면 결과 확인도 503", async () => {
    const f = fakeAdmin(pending);
    expect(await checkSignatureLink({ admin: f.admin, viewer: HARU, signer: null }, { requestId: REQ })).toMatchObject({ ok: false, status: 503 });
    expect(f.calls).toEqual([]);
  });
});

describe("INV-S16: 연결 정보 칸 검사(브라우저)", () => {
  const today = new Date("2026-10-29T00:00:00Z");
  it("INV-S16: 맞는 값이면 문제 없음, 평문에는 세 값과 크리에이터 식별값", () => {
    expect(checkLinkIdentity({ name: " 정재원 ", birth: "19900115", phone: "010-1234-5678" }, today)).toBeNull();
    expect(JSON.parse(linkIdentityPlaintext({ name: " 정재원 ", birth: "19900115", phone: "010-1234-5678" }, "c1"))).toEqual({
      v: 1,
      name: "정재원",
      birth: "19900115",
      phone: "01012345678",
      creatorId: "c1",
    });
  });
  it("INV-S16 (실패경로): 빈 이름·없는 날짜·앞날·여섯 자리·틀린 번호", () => {
    expect(checkLinkIdentity({ name: " ", birth: "19900115", phone: "01012345678" }, today)?.field).toBe("name");
    expect(checkLinkIdentity({ name: "정재원", birth: "19900230", phone: "01012345678" }, today)?.field).toBe("birth");
    expect(checkLinkIdentity({ name: "정재원", birth: "20301010", phone: "01012345678" }, today)?.field).toBe("birth");
    expect(checkLinkIdentity({ name: "정재원", birth: "900115", phone: "01012345678" }, today)?.field).toBe("birth");
    expect(checkLinkIdentity({ name: "정재원", birth: "19900115", phone: "0212345678" }, today)?.field).toBe("phone");
  });
});
