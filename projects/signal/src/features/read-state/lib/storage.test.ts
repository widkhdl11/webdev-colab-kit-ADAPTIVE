import { beforeEach, describe, expect, it, vi } from "vitest";
import { addReadIds, loadReadIds } from "./storage";

const KEY = "signal:read-articles";

describe("읽음 표시 보관소", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("더한 목록을 그대로 돌려준다", () => {
    addReadIds(["a", "b"]);
    expect(loadReadIds()).toEqual(["a", "b"]);
  });

  it("저장된 값이 없으면 빈 목록", () => {
    expect(loadReadIds()).toEqual([]);
  });

  it("망가진 값이 들어 있어도 화면을 세우지 않는다", () => {
    window.localStorage.setItem(KEY, "{ 이건 JSON 이 아니다");
    expect(loadReadIds()).toEqual([]);
  });

  it("배열이 아니거나 문자열이 아닌 항목은 걸러낸다", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(loadReadIds()).toEqual([]);

    window.localStorage.setItem(KEY, JSON.stringify(["a", 1, null, "b"]));
    expect(loadReadIds()).toEqual(["a", "b"]);
  });

  it("저장이 막혀도(용량 초과·차단) 예외를 밖으로 던지지 않는다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => addReadIds(["a"])).not.toThrow();
  });

  it("무한정 쌓이지 않게 최근 것만 남긴다", () => {
    const ids = Array.from({ length: 520 }, (_, i) => `id-${i}`);
    addReadIds(ids);
    const stored = loadReadIds();
    expect(stored).toHaveLength(500);
    expect(stored[0]).toBe("id-20");
    expect(stored[499]).toBe("id-519");
  });

  it("이미 저장된 것을 지우지 않고 합친다 — 동시에 열린 탭이 서로를 덮어쓰지 않는다", () => {
    // 탭 A 가 먼저 저장한 상태
    addReadIds(["a"]);
    // 탭 B 는 그 사이 마운트돼 저장소를 [] 로 읽었더라도, 저장 시점에 다시 읽어 합친다
    addReadIds(["b"]);
    expect(loadReadIds()).toEqual(["a", "b"]);
  });

  it("같은 id 를 다시 더해도 중복되지 않는다", () => {
    addReadIds(["a", "b"]);
    addReadIds(["a"]);
    expect(loadReadIds()).toEqual(["a", "b"]);
  });
});
