// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { clearPhotoCache, readPhotoDataUrlCached } from "./image-assets";

// 공유 카드 라우트의 크리에이터 사진 캐시 (gift-reply INV-G9 라우트 — 응답은 캐시하지 않고 사진 바이트만 경로별로 들고 있는다).

function counter(result: (url: string | null) => string | null) {
  const calls: (string | null)[] = [];
  return {
    calls,
    read: async (url: string | null) => {
      calls.push(url);
      return result(url);
    },
  };
}

beforeEach(() => clearPhotoCache());

describe("사진 캐시 — 경로별로 한 번만 읽는다", () => {
  it("같은 사진 주소는 두 번째부터 다시 읽지 않고, 다른 주소(새로 올린 사진 = 새 경로)는 새로 읽는다", async () => {
    const c = counter((url) => `data:${url}`);
    expect(await readPhotoDataUrlCached("https://sb.test/a/1.webp", c.read)).toBe("data:https://sb.test/a/1.webp");
    expect(await readPhotoDataUrlCached("https://sb.test/a/1.webp", c.read)).toBe("data:https://sb.test/a/1.webp");
    expect(await readPhotoDataUrlCached("https://sb.test/a/2.webp", c.read)).toBe("data:https://sb.test/a/2.webp");
    expect(c.calls).toEqual(["https://sb.test/a/1.webp", "https://sb.test/a/2.webp"]);
  });

  it("못 읽은 사진(null)은 들고 있지 않아 다음에 다시 읽는다 · 사진이 없으면 읽지 않는다", async () => {
    const c = counter(() => null);
    expect(await readPhotoDataUrlCached("https://sb.test/b/1.webp", c.read)).toBeNull();
    expect(await readPhotoDataUrlCached("https://sb.test/b/1.webp", c.read)).toBeNull();
    expect(await readPhotoDataUrlCached(null, c.read)).toBeNull();
    expect(c.calls).toEqual(["https://sb.test/b/1.webp", "https://sb.test/b/1.webp"]);
  });
});
