import { describe, expect, it } from "vitest";
import { createReuseStore } from "./reuse";

// 스펙: docs/specs/ai-assist.md — INV-G7
//
// 재사용하는 것은 **모델이 정한 id 순서뿐**이다. 화면에 그리는 값은 매번 데이터베이스에서
// 새로 읽으므로, 여기에는 순서 말고 아무것도 들어오지 않는다.
//
// 시계를 주입해서 검사한다 — 진짜 시간을 기다리면 검사가 60초짜리가 되고, 가짜 타이머는
// 「시간이 흘렀다」를 흉내 낼 뿐이라 만료 판정을 직접 못 본다.

function storeAt(start = 0, ttlMs = 60_000) {
  let now = start;
  const store = createReuseStore({ ttlMs, now: () => now });
  return { store, tick: (ms: number) => (now += ms) };
}

describe("INV-G7: 한 사용자의 모델 호출은 재사용 시간 안에 한 번을 넘지 않는다", () => {
  it("INV-G7: 넣은 순서를 재사용 시간 안에는 그대로 돌려준다", () => {
    const { store, tick } = storeAt();
    store.set("u1", ["a", "b"]);
    tick(59_000);
    expect(store.get("u1")).toEqual(["a", "b"]);
  });

  it("INV-G7 (반대 절반): 재사용 시간이 지나면 없는 것으로 본다 — 한 번 부르고 영영 안 부르는 게 아니다", () => {
    const { store, tick } = storeAt();
    store.set("u1", ["a", "b"]);
    tick(60_001);
    expect(store.get("u1")).toBeNull();
  });

  it("INV-G7 (실패경로): 재사용은 사용자별이다 — 남의 순서가 내 자리에 오지 않는다", () => {
    // 이 검사가 붙드는 것이 INV-G7 의 더 나쁜 쪽이다. 키가 사용자를 안 가르면
    // 「무엇이 위로 올라왔나」가 남의 관심사와 이력에서 나온 값이 된다.
    const { store } = storeAt();
    store.set("u1", ["a", "b"]);
    expect(store.get("u2")).toBeNull();
  });

  it("INV-G7: 사용자마다 따로 산다", () => {
    const { store } = storeAt();
    store.set("u1", ["a"]);
    store.set("u2", ["b"]);
    expect(store.get("u1")).toEqual(["a"]);
    expect(store.get("u2")).toEqual(["b"]);
  });

  it("INV-G7: 아무것도 안 넣었으면 없다", () => {
    const { store } = storeAt();
    expect(store.get("u1")).toBeNull();
  });

  it("INV-G7: 다시 넣으면 시계가 다시 시작한다", () => {
    const { store, tick } = storeAt();
    store.set("u1", ["a"]);
    tick(50_000);
    store.set("u1", ["b"]);
    tick(50_000); // 처음 넣은 시각에서 100초. 다시 넣은 시각에서는 50초다
    expect(store.get("u1")).toEqual(["b"]);
  });

  it("INV-G7: 넣은 순서를 밖에서 고쳐도 저장된 것이 안 바뀐다", () => {
    // 부르는 쪽이 같은 배열을 재활용하면 저장된 순서가 조용히 달라진다.
    const { store } = storeAt();
    const ranking = ["a", "b"];
    store.set("u1", ranking);
    ranking.push("c");
    expect(store.get("u1")).toEqual(["a", "b"]);
  });
});
