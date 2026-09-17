// 근거 스펙: docs/specs/post-view-count.md (INV-V1)
//
// 여기서 붙드는 것은 「같은 방문에서 두 번 세지 않는가」다. 실제로 숫자가 오르는지는
// 데이터베이스 함수의 일이고, 화면이 그것을 한 번만 부르는지는 이 가드가 정한다.

import { describe, expect, it } from "vitest";
import { 처음인가 } from "./visit-guard";

/** 페이지 하나가 로드된 동안의 기억. 새 Set = 새로고침한 것과 같다. */
const 새페이지 = () => new Set<string>();

describe("INV-V1 — 같은 방문에서는 한 번만 센다", () => {
  it("S1: 처음 열면 참이다", () => {
    expect(처음인가("post-1", 새페이지())).toBe(true);
  });

  it("S2: 같은 방문에서 다시 물으면 거짓이다 — 몇 번을 물어도", () => {
    const 기억 = 새페이지();
    expect(처음인가("post-1", 기억)).toBe(true);
    expect(처음인가("post-1", 기억)).toBe(false);
    expect(처음인가("post-1", 기억)).toBe(false);
    expect(처음인가("post-1", 기억)).toBe(false);
  });

  it("S3: 새로고침하면 다시 센다 — 기억이 페이지와 함께 사라진다", () => {
    // **이 줄이 sessionStorage 를 막는다.** 처음 구현이 그것이었고, 세션 저장소는
    // 새로고침을 넘어 살아남아서 새로고침해도 조회수가 안 올랐다(2026-09-16 실측).
    // 새로고침을 넘어 기억하는 저장소로 바꾸면 여기서 빨간불이 난다.
    expect(처음인가("post-1", 새페이지())).toBe(true);
    expect(처음인가("post-1", 새페이지())).toBe(true);
  });

  it("글마다 따로 센다 — 한 글을 봤다고 다른 글이 막히지 않는다", () => {
    // 기억을 postId 없이 참/거짓 하나로 두면 여기서 빨간불이 난다.
    const 기억 = 새페이지();
    expect(처음인가("post-1", 기억)).toBe(true);
    expect(처음인가("post-2", 기억)).toBe(true);
  });

  it("S4: 기록을 **참을 돌려주기 전에** 남긴다", () => {
    // 개발 모드의 이중 실행은 두 호출을 거의 동시에 낸다. 묻는 것과 남기는 것을 나누면
    // 그 사이에 두 번째가 끼어들어 둘 다 「처음」으로 읽는다. 참을 돌려준 그 순간에 이미
    // 기록이 있는지를 본다 — 나중에 남기는 구현이면 빨간불이다.
    const 기억 = 새페이지();
    expect(처음인가("post-1", 기억)).toBe(true);
    expect(기억.has("post-1")).toBe(true);
  });

  it("S4b: 같은 틱에 두 번 불러도 한 번만 참이다", () => {
    // 이중 실행을 그대로 흉내 낸다 — 사이에 await 가 없다.
    const 기억 = 새페이지();
    const 결과 = [처음인가("post-1", 기억), 처음인가("post-1", 기억)];
    expect(결과.filter(Boolean)).toHaveLength(1);
  });
});
