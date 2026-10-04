import { describe, expect, it } from "vitest";
import { adminNoticesFromRows, noticeBodyText } from "./admin-notice";

describe("관리자 공지 읽기 (INV-K11)", () => {
  it("INV-K11: 고치기 칸에 넣을 글 — 덩어리와 목록 항목을 모두 빈 줄로 잇고(DB 가 빈 줄로 문단을 나눈다), 링크는 이름만", () => {
    const text = noticeBodyText([
      { type: "heading", text: "안내" },
      { type: "text", parts: ["자세한 건 ", { label: "여기", href: "/notices" }, "를 보세요."] },
      { type: "list", items: ["하나", "둘"] },
      { type: "signature", text: "팬꾹 드림" },
    ]);
    expect(text).toBe("안내\n\n자세한 건 여기를 보세요.\n\n하나\n\n둘\n\n팬꾹 드림");
  });

  it("INV-K11: 줄을 옮긴다 — 쓴 사람이 없는 옛 공지는 null", () => {
    const rows = [{ slug: "open", title: "문을 열었어요", pinned: true, published_at: "2026-09-20T00:00:00+00:00", author_nickname: null, body: [{ type: "text", parts: ["안녕"] }] }];
    expect(adminNoticesFromRows(rows)).toEqual([
      { slug: "open", title: "문을 열었어요", pinned: true, publishedAt: "2026-09-20T00:00:00+00:00", authorNickname: null, body: [{ type: "text", parts: ["안녕"] }] },
    ]);
  });

  it("INV-K11 (실패경로): 꼴이 다른 줄·모르는 덩어리가 있으면 null", () => {
    expect(adminNoticesFromRows({})).toBeNull();
    expect(adminNoticesFromRows([{ slug: "a", title: "t", pinned: "no", published_at: "t", author_nickname: null, body: [] }])).toBeNull();
    expect(adminNoticesFromRows([{ slug: "a", title: "t", pinned: false, published_at: "t", author_nickname: null, body: [{ type: "image", src: "x" }] }])).toBeNull();
  });
});
