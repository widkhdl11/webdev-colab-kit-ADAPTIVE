// @vitest-environment node
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { linkGateOf, STATIC_FIRST_SEGMENTS } from "./proxy-link-route";

// 링크 주소의 응답 전 판정 (docs/specs/creator-link.md INV-E2·E3·E5). DB 를 거치는 판정은 통합 시험(creator-link-routes)이 실제 서버로 본다.
// 여기서는 DB 를 부르지 않아야 하는 주소와 정적 주소 목록이 폴더와 같은지를 본다.

vi.mock("server-only", () => ({}));

/** DB 왕복이 없어야 하는 주소에 쓴다 — 판정은 읽기 실패를 삼키므로 던지는 것만으로는 안 되고, 불린 횟수를 본다. */
const noDb = vi.fn(() => {
  throw new Error("DB 를 부르면 안 되는 주소");
});
afterEach(() => {
  expect(noDb).not.toHaveBeenCalled();
  noDb.mockClear();
});

function failingDb() {
  const rpc = vi.fn(async () => ({ data: null, error: { code: "57014" } }));
  return { make: () => ({ rpc }) as never, rpc };
}

describe("INV-E2: 링크 주소 판정 — DB 없이 정해지는 주소", () => {
  it("INV-E2 S2c: 정적 첫 단계 주소 목록은 src/app 의 첫 단계 폴더(묶음 폴더 안 이름 포함)와 같다", () => {
    const routeNames = (dir: string): string[] =>
      readdirSync(dir)
        .filter((n) => statSync(join(dir, n)).isDirectory())
        .flatMap((n) => (n.startsWith("(") ? routeNames(join(dir, n)) : [n]))
        .filter((n) => !n.startsWith("[") && !n.startsWith("_"));
    const folders = routeNames(join(process.cwd(), "src", "app")).sort();
    expect(folders.length).toBeGreaterThan(10);
    expect([...STATIC_FIRST_SEGMENTS].sort()).toEqual(folders);
  });

  it("INV-E2: 정적 주소·점이 든 주소(파일)·두 단계 이상 주소는 판정하지 않는다(DB 왕복 없음)", async () => {
    for (const path of ["/login", "/creators", "/me", "/icon.png", "/sidebar-boot.js", "/gifts/FC-7K3M9", "/creators/x/y", "/"]) {
      expect([path, await linkGateOf(path, noDb)]).toEqual([path, { kind: "pass" }]);
    }
  });

  it("INV-E2 S2b: 대문자가 섞인 주소는 DB 없이 소문자 주소로 넘긴다", async () => {
    expect(await linkGateOf("/RT_Haru7", noDb)).toEqual({ kind: "redirect", to: "/rt_haru7" });
    expect(await linkGateOf("/%52T_haru7", noDb)).toEqual({ kind: "redirect", to: "/rt_haru7" });
  });

  it("INV-E5 S5b (실패경로): 아이디 꼴이 아닌 한 단계 주소는 DB 없이 없는 페이지다", async () => {
    for (const path of ["/a-b", "/ab", "/%ED%95%9C%EA%B8%80"]) expect([path, await linkGateOf(path, noDb)]).toEqual([path, { kind: "not_found" }]);
  });

  it("INV-E5 (실패경로): 읽기가 실패하면 판정하지 않고 페이지에 맡긴다 — 깨진 주소 인코딩도 같다", async () => {
    const db = failingDb();
    expect(await linkGateOf("/rt_haru7", db.make)).toEqual({ kind: "pass" });
    expect(await linkGateOf("/creators/00000000-0000-4000-b000-0000000000ff", db.make)).toEqual({ kind: "pass" });
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(await linkGateOf("/%E0%A4%A", noDb)).toEqual({ kind: "pass" });
  });
});
