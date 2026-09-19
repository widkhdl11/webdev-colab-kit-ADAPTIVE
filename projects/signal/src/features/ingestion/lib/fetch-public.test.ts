import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublic } from "./fetch-public";

/**
 * INV-IA6 의 검사. **리다이렉트를 따라간 뒤에도 다시 검사하는가**가 전부다 —
 * 첫 주소만 보는 구현은 아래 두 번째 항목에서만 빨간불이 난다.
 */
const calls: string[] = [];

function reply(status: number, location?: string): Response {
  const headers = new Headers();
  if (location !== undefined) headers.set("location", location);
  return new Response(null, { status, headers });
}

beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** 주소별로 미리 정한 응답을 돌려주는 가짜 네트워크. 부른 주소를 순서대로 남긴다. */
function stubNetwork(table: Record<string, Response>) {
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    const res = table[String(url)];
    if (res === undefined) throw new Error(`예상 못 한 주소: ${url}`);
    return res;
  });
}

describe("fetchPublic", () => {
  it("INV-IA5 (S15, 실패경로): 첫 주소가 공개 주소가 아니면 요청 자체를 안 보낸다", async () => {
    stubNetwork({});
    await expect(fetchPublic("http://169.254.169.254/latest/meta-data/")).rejects.toThrow(
      "공개 주소가 아니라",
    );
    expect(calls).toEqual([]); // 한 번도 안 나갔다
  });

  it("INV-IA6 (S16, 실패경로): 공개 주소가 내부 주소로 돌려보내면 두 번째 요청을 안 보낸다", async () => {
    stubNetwork({
      "https://example.com/a": reply(302, "http://169.254.169.254/latest/meta-data/"),
    });
    await expect(fetchPublic("https://example.com/a")).rejects.toThrow("공개 주소가 아니라");
    expect(calls).toEqual(["https://example.com/a"]); // 첫 칸에서 멈췄다
  });

  it("INV-IA6 (S17, 실패경로): 상대 주소로 온 리다이렉트도 풀어서 다시 검사한다", async () => {
    stubNetwork({
      "https://example.com/a": reply(301, "/b"),
      "https://example.com/b": reply(200),
    });
    const res = await fetchPublic("https://example.com/a");
    expect(res.status).toBe(200);
    expect(calls).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("INV-IA6 (S17, 실패경로): 스킴 없는 프로토콜 상대 주소도 풀어서 다시 검사한다", async () => {
    stubNetwork({ "https://example.com/a": reply(302, "//169.254.169.254/latest/meta-data/") });
    await expect(fetchPublic("https://example.com/a")).rejects.toThrow("공개 주소가 아니라");
    expect(calls).toEqual(["https://example.com/a"]);
  });

  it("INV-IA6: 호스트가 바뀌는 칸에서는 자격 증명 헤더를 떨어뜨린다", async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(String(url));
      seen.push(new Headers(init.headers).get("authorization"));
      return String(url) === "https://example.com/a"
        ? reply(302, "https://other.example.net/b")
        : reply(200);
    });
    await fetchPublic("https://example.com/a", { headers: { authorization: "Bearer x" } });
    expect(seen).toEqual(["Bearer x", null]); // 첫 칸에는 실리고 남의 호스트에는 안 실린다
  });

  it("INV-IA6 (S18): 공개 주소끼리의 리다이렉트는 그대로 따라간다", async () => {
    stubNetwork({
      "https://example.com/a": reply(302, "https://cdn.example.org/a"),
      "https://cdn.example.org/a": reply(200),
    });
    const res = await fetchPublic("https://example.com/a");
    expect(res.status).toBe(200);
    expect(calls).toEqual(["https://example.com/a", "https://cdn.example.org/a"]);
  });

  it("INV-IA6 (S19, 실패경로): 끝없이 도는 리다이렉트는 상한에서 끊는다", async () => {
    stubNetwork({
      "https://example.com/a": reply(302, "https://example.com/b"),
      "https://example.com/b": reply(302, "https://example.com/a"),
    });
    await expect(fetchPublic("https://example.com/a")).rejects.toThrow("리다이렉트가");
    expect(calls.length).toBe(6); // 상한 5 + 첫 요청
  });

  it("INV-IA6: 갈 곳을 안 알려 주는 3xx 는 그대로 돌려준다 — 여기서 멈추지 않는다", async () => {
    stubNetwork({ "https://example.com/a": reply(304) });
    const res = await fetchPublic("https://example.com/a");
    expect(res.status).toBe(304);
    expect(calls).toEqual(["https://example.com/a"]);
  });
});
