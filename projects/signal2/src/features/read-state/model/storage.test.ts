import { describe, expect, it } from "vitest";

import { getStore, loadReadIds, markRead, MAX_READ_IDS, READ_IDS_KEY } from "./storage";

/** 진짜 localStorage 와 같은 모양의 최소 구현. 검증 대상(storage.ts)은 모킹하지 않는다. */
function fakeStore(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("loadReadIds", () => {
  it("저장된 목록을 그대로 읽는다", () => {
    const store = fakeStore({ [READ_IDS_KEY]: JSON.stringify(["a01", "b02"]) });
    expect([...loadReadIds(store)].sort()).toEqual(["a01", "b02"]);
  });

  it("값이 없으면 빈 집합이다", () => {
    expect(loadReadIds(fakeStore()).size).toBe(0);
  });

  it("깨진 값은 빈 집합으로 넘긴다 — 화면이 죽지 않게", () => {
    expect(loadReadIds(fakeStore({ [READ_IDS_KEY]: "{{{" })).size).toBe(0);
    expect(loadReadIds(fakeStore({ [READ_IDS_KEY]: '"a01"' })).size).toBe(0);
  });

  it("배열 안의 문자열 아닌 값은 버리고 나머지는 살린다", () => {
    const store = fakeStore({
      [READ_IDS_KEY]: JSON.stringify(["a01", 3, null, "b02"]),
    });
    expect([...loadReadIds(store)].sort()).toEqual(["a01", "b02"]);
  });
});

describe("markRead", () => {
  it("새 id 를 더하고 저장한다", () => {
    const store = fakeStore();
    markRead(store, "a01");
    expect([...loadReadIds(store)]).toEqual(["a01"]);
  });

  it("이미 있던 id 는 중복으로 쌓이지 않는다", () => {
    const store = fakeStore();
    markRead(store, "a01");
    markRead(store, "a01");
    expect(JSON.parse(store.getItem(READ_IDS_KEY) ?? "[]")).toEqual(["a01"]);
  });

  it("다른 탭이 그사이 쓴 기록을 덮어쓰지 않는다", () => {
    const store = fakeStore();
    markRead(store, "a01");

    // 다른 탭이 같은 저장소에 b01 을 남긴 상황.
    store.setItem(READ_IDS_KEY, JSON.stringify(["a01", "b01"]));

    // 이 탭은 아직 a01 만 알고 있지만, 쓰기 전에 다시 읽으므로 b01 이 살아남아야 한다.
    const after = markRead(store, "c01");
    expect([...after].sort()).toEqual(["a01", "b01", "c01"]);
    expect([...loadReadIds(store)].sort()).toEqual(["a01", "b01", "c01"]);
  });

  it("저장이 막혀도 던지지 않고 합친 결과를 돌려준다", () => {
    const store = fakeStore();
    store.setItem = () => {
      throw new Error("QuotaExceeded");
    };
    expect(() => markRead(store, "a01")).not.toThrow();
    expect([...markRead(store, "a01")]).toEqual(["a01"]);
  });

  it("상한을 넘으면 오래전에 읽은 것부터 버린다", () => {
    // 상한을 채워 둔 상태에서 하나를 더 읽는다. 자르지 않으면 목록이 영원히 자라고,
    // 한도를 넘긴 뒤에는 setItem 이 던져 그 뒤 모든 읽음이 조용히 저장되지 않는다.
    const filled = Array.from({ length: MAX_READ_IDS }, (_, i) => `old${i}`);
    const store = fakeStore({ [READ_IDS_KEY]: JSON.stringify(filled) });

    const after = markRead(store, "new01");
    const saved: unknown = JSON.parse(store.getItem(READ_IDS_KEY) ?? "[]");

    expect(saved).toHaveLength(MAX_READ_IDS);
    expect(after.size).toBe(MAX_READ_IDS);
    // 제일 오래된 것이 밀려나고 방금 읽은 것은 남는다.
    expect(after.has("old0")).toBe(false);
    expect(after.has("new01")).toBe(true);
    // 저장한 것과 돌려준 것이 같아야 화면과 저장소가 안 갈린다.
    expect(saved).toEqual([...after]);
  });

  it("다시 읽은 글은 맨 뒤로 가서 오래된 축에 안 남는다", () => {
    const store = fakeStore({ [READ_IDS_KEY]: JSON.stringify(["a01", "b01"]) });
    markRead(store, "a01");
    expect(JSON.parse(store.getItem(READ_IDS_KEY) ?? "[]")).toEqual(["b01", "a01"]);
  });
});

describe("저장소가 없을 때", () => {
  it("읽기는 빈 집합이고 쓰기는 던지지 않는다", () => {
    // getStore() 가 null 을 주는 경로 — 서버 렌더, 저장소가 차단된 iframe.
    expect(loadReadIds(null).size).toBe(0);
    expect(() => markRead(null, "a01")).not.toThrow();
    expect([...markRead(null, "a01")]).toEqual(["a01"]);
  });
});

describe("getStore", () => {
  it("있으면 그대로 준다", () => {
    expect(getStore()).toBe(window.localStorage);
  });

  it("속성 접근 자체가 던져도 null 을 준다 — 트리가 죽지 않게", () => {
    // 저장소가 차단된 iframe · 쿠키 전면 차단에서 실제로 이렇게 던진다.
    // getItem/setItem 만 감싸면 이 경로에서 effect 안의 예외가 클라이언트 트리를 죽인다.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });

    try {
      expect(getStore()).toBeNull();
      expect(() => loadReadIds(getStore())).not.toThrow();
      expect(() => markRead(getStore(), "a01")).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});
