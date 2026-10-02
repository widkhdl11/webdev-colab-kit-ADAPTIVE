import { describe, expect, it } from "vitest";
import { isAllowedNoticeHref, readNotices } from "./notice-reads";

describe("공지 본문 링크", () => {
  it.each(["/support", "/notices?page=2", "https://help.fankkuk.kr/a"])(
    "받는다: %s",
    (h) => {
      expect(isAllowedNoticeHref(h)).toBe(true);
    },
  );
  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "javascript:alert(1)",
    "http://evil.com",
    "support",
    "data:text/html,x",
    " javascript:alert(1)",
  ])("막는다: %s", (h) => {
    expect(isAllowedNoticeHref(h)).toBe(false);
  });
});

describe("공지 읽기", () => {
  const ok = {
    slug: "n-a",
    title: "가",
    published_on: "2026-10-01",
    pinned: false,
    body: [
      { type: "text", parts: ["안녕", { label: "센터", href: "/support" }] },
    ],
  };
  const bad = {
    ...ok,
    slug: "n-bad",
    body: [{ type: "text", parts: [{ label: "x", href: "/\\evil.com" }] }],
  };
  const client = (data: unknown) =>
    ({ rpc: async () => ({ data, error: null }) }) as never;

  it("꼴이 틀린 글만 빼고 나머지는 돌려준다", async () => {
    const rows = await readNotices(client([ok, bad]));
    expect(rows.map((n) => n.id)).toEqual(["n-a"]);
  });

  it("DB 오류는 삼키지 않는다", async () => {
    await expect(
      readNotices({
        rpc: async () => ({ data: null, error: { code: "42501" } }),
      } as never),
    ).rejects.toThrow();
  });
});
