import { describe, expect, it } from "vitest";
import { prefetchPath } from "./prefetch-path";

const here = { origin: "https://fankkuk.com", pathname: "/terms", search: "" };
const link = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: "", download: false, ...extra });

describe("마우스 올리면 미리 받기 — 받을 주소 고르기", () => {
  it("이 사이트의 화면 주소는 경로와 검색어를 받는다", () => {
    expect(prefetchPath(link("https://fankkuk.com/faq"), here)).toBe("/faq");
    expect(prefetchPath(link("https://fankkuk.com/creators?tag=game#top"), here)).toBe("/creators?tag=game");
    expect(prefetchPath(link("https://fankkuk.com/terms?tab=refund"), here)).toBe("/terms?tab=refund");
    expect(prefetchPath(link("https://fankkuk.com/faq", { target: "_self" }), here)).toBe("/faq");
  });

  it("(실패경로) 다른 사이트·API·새 창·내려받기·같은 화면 칸 이동은 받지 않는다", () => {
    expect(prefetchPath(link("https://example.com/faq"), here)).toBeNull();
    expect(prefetchPath(link("https://fankkuk.com/api/gifts/reply-card/1"), here)).toBeNull();
    expect(prefetchPath(link("https://fankkuk.com/api"), here)).toBeNull();
    expect(prefetchPath(link("https://fankkuk.com/faq", { target: "_blank" }), here)).toBeNull();
    expect(prefetchPath(link("https://fankkuk.com/faq", { download: true }), here)).toBeNull();
    expect(prefetchPath(link("https://fankkuk.com/terms#a9"), here)).toBeNull();
    expect(prefetchPath(link("mailto:help@fankkuk.com"), here)).toBeNull();
    expect(prefetchPath(link("not a url"), here)).toBeNull();
  });

  it("/api 로 시작하지만 다른 이름인 화면 주소는 받는다", () => {
    expect(prefetchPath(link("https://fankkuk.com/apiguide"), here)).toBe("/apiguide");
  });
});
