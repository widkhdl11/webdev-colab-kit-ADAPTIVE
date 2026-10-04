import { describe, expect, it } from "vitest";
import { handlePrivateJsonPost } from "./private-json";

const SITE = "http://127.0.0.1:3311";

function post(headers: Record<string, string>, body = JSON.stringify({ nickname: "별빛" })): Request {
  return new Request(`${SITE}/api/me`, { method: "POST", headers, body });
}

const sameSiteJson = { origin: SITE, host: "127.0.0.1:3311", "content-type": "application/json" };

describe("개인정보 고치기 요청의 겉껍데기", () => {
  it("INV-A6 S6b: 저장 성공 응답은 캐시되지 않는다", async () => {
    const res = await handlePrivateJsonPost(post(sameSiteJson), async (body) => ({ status: 200, body: { got: body } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ got: { nickname: "별빛" } });
  });

  it("INV-A6: 실패 응답도 캐시되지 않는다", async () => {
    const res = await handlePrivateJsonPost(post(sameSiteJson), async () => ({ status: 400, body: { message: "x" } }));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each([
    ["다른 사이트", { ...sameSiteJson, origin: "https://evil.example.com" }],
    ["Origin 없음", { host: "127.0.0.1:3311", "content-type": "application/json" }],
    ["폼 인코딩", { ...sameSiteJson, "content-type": "application/x-www-form-urlencoded" }],
    ["글자 본문", { ...sameSiteJson, "content-type": "text/plain" }],
  ])("INV-A6 S6: %s 요청은 403, 처리 함수를 부르지 않는다", async (_label, headers) => {
    let called = false;
    const res = await handlePrivateJsonPost(post(headers), async () => {
      called = true;
      return { status: 200, body: {} };
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(called).toBe(false);
  });

  it("JSON 이 깨진 본문은 빈 값으로 넘긴다(처리 함수가 400 을 낸다)", async () => {
    let seen: unknown = "unset";
    await handlePrivateJsonPost(post(sameSiteJson, "{broken"), async (body) => {
      seen = body;
      return { status: 400, body: {} };
    });
    expect(seen).toBeNull();
  });

  it("처리 함수가 예외를 던져도 500 이고 캐시되지 않는다", async () => {
    const res = await handlePrivateJsonPost(post(sameSiteJson), async () => {
      throw new Error("db down 010-1234-5678");
    });
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await res.json())).not.toContain("010-1234-5678");
  });
});
