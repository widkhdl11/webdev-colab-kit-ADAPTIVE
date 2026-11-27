import { describe, expect, it } from "vitest";
import { batchesOf, groupRows, removeAndForget, type PhotoBucket, type PhotoStore } from "./photo-deletions";

// my-account INV-A15 — 탈퇴한 계정의 사진은 저장소에서 지운 뒤에만 「지울 사진」 줄을 지운다. 실패하면 줄이 남아 매일 다시 지운다.

function store(opts: { removeFails?: PhotoBucket[]; forgetFails?: PhotoBucket[]; removeThrows?: boolean } = {}) {
  const calls: string[] = [];
  const s: PhotoStore = {
    async remove(bucket, paths) {
      calls.push(`remove:${bucket}:${paths.join(",")}`);
      if (opts.removeThrows) throw new Error("저장소 응답 없음");
      return !opts.removeFails?.includes(bucket);
    },
    async forget(bucket, paths) {
      calls.push(`forget:${bucket}:${paths.join(",")}`);
      return !opts.forgetFails?.includes(bucket);
    },
  };
  return { s, calls };
}

describe("INV-A15: 지울 사진 — 저장소에서 지운 뒤에만 줄을 지운다", () => {
  it("INV-A15: 두 저장소 모두 지우면 그 줄을 지우고 true", async () => {
    const { s, calls } = store();
    expect(await removeAndForget(s, batchesOf({ fan: ["f/1.webp"], creator: ["c/1.webp", "c/2.webp"] }))).toBe(true);
    expect(calls).toEqual(["remove:fan-photos:f/1.webp", "forget:fan-photos:f/1.webp", "remove:creator-photos:c/1.webp,c/2.webp", "forget:creator-photos:c/1.webp,c/2.webp"]);
  });

  it("INV-A15 (실패경로): 저장소 지우기가 실패한 묶음은 줄을 남기고 false — 다른 묶음은 그대로 진행", async () => {
    const { s, calls } = store({ removeFails: ["fan-photos"] });
    expect(await removeAndForget(s, batchesOf({ fan: ["f/1.webp"], creator: ["c/1.webp"] }))).toBe(false);
    expect(calls).not.toContain("forget:fan-photos:f/1.webp");
    expect(calls).toContain("forget:creator-photos:c/1.webp");
  });

  it("INV-A15 (실패경로): 저장소가 예외를 던져도 줄을 남기고 false", async () => {
    const { s, calls } = store({ removeThrows: true });
    expect(await removeAndForget(s, batchesOf({ fan: ["f/1.webp"], creator: [] }))).toBe(false);
    expect(calls.some((c) => c.startsWith("forget"))).toBe(false);
  });

  it("INV-A15 (실패경로): 줄 지우기가 실패하면 false(다음 날 다시 지운다)", async () => {
    const { s } = store({ forgetFails: ["fan-photos"] });
    expect(await removeAndForget(s, batchesOf({ fan: ["f/1.webp"], creator: [] }))).toBe(false);
  });

  it("INV-A15: 빈 묶음은 저장소를 부르지 않는다 · 남은 줄은 저장소별로 묶고 모르는 저장소 이름은 버린다", async () => {
    const { s, calls } = store();
    expect(await removeAndForget(s, batchesOf({ fan: [], creator: [] }))).toBe(true);
    expect(calls).toEqual([]);
    expect(
      groupRows([
        { bucket: "fan-photos", path: "a" },
        { bucket: "creator-photos", path: "b" },
        { bucket: "fan-photos", path: "c" },
        { bucket: "banner-images", path: "x" },
      ]),
    ).toEqual([
      { bucket: "fan-photos", paths: ["a", "c"] },
      { bucket: "creator-photos", paths: ["b"] },
    ]);
  });
});
