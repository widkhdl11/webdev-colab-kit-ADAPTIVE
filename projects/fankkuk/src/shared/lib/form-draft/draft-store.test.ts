import { describe, expect, it } from "vitest";
import { clearAllDrafts, clearDraft, draftableValues, loadDraft, purgeDrafts, saveDraft, type DraftStorage } from "./draft-store";

// 폼 임시 저장 (docs/specs/session-login.md INV-L20 — 운영자 폼이 쓴다). 저장소는 브라우저 localStorage 와 같은 모양의 메모리.

function memory(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const A = "00000000-0000-4000-a000-0000000000a1";
const B = "00000000-0000-4000-a000-0000000000b2";
const T0 = Date.parse("2026-10-31T09:00:00Z");
/** 부르는 쪽이 넘기는 남겨 두는 시간. 운영자 폼의 값(12시간)은 entities/session 이 정하고 거기서 고정 시험을 한다 */
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

describe("INV-L20: 같은 계정이면 복원, 다른 계정이면 지운다", () => {
  it("INV-L20 (S18): 저장한 값을 같은 계정·같은 폼으로 다시 읽는다", () => {
    const st = memory();
    saveDraft(st, A, "notice-form", { title: "공지", body: "내용" }, T0);
    expect(loadDraft(st, A, "notice-form", T0 + 60_000, DRAFT_MAX_AGE_MS)).toEqual({ title: "공지", body: "내용" });
  });

  it("INV-L20 (S18b, 실패경로): 다른 계정으로 읽으면 복원하지 않고 앞 사람의 임시 저장을 모두 지운다", () => {
    const st = memory();
    saveDraft(st, A, "notice-form", { title: "공지" }, T0);
    saveDraft(st, A, "pricing-form", { fee: "1400" }, T0);
    expect(loadDraft(st, B, "notice-form", T0, DRAFT_MAX_AGE_MS)).toBeNull();
    expect([...st.map.keys()].filter((k) => k.includes(A))).toEqual([]);
  });

  it("INV-L20 (S18b, 실패경로): 저장한 지 12시간이면 지운다(12시간 − 1분이면 복원)", () => {
    const st = memory();
    saveDraft(st, A, "f", { a: "1" }, T0);
    expect(loadDraft(st, A, "f", T0 + DRAFT_MAX_AGE_MS - 60_000, DRAFT_MAX_AGE_MS)).toEqual({ a: "1" });
    expect(loadDraft(st, A, "f", T0 + DRAFT_MAX_AGE_MS, DRAFT_MAX_AGE_MS)).toBeNull();
    expect(st.map.size).toBe(0);
  });

  it("INV-L20 (S18b): 제출 성공 → 그 폼만 지운다 / 직접 로그아웃 → 모두 지운다", () => {
    const st = memory();
    saveDraft(st, A, "f1", { a: "1" }, T0);
    saveDraft(st, A, "f2", { b: "2" }, T0);
    st.setItem("other-app-key", "x");
    clearDraft(st, A, "f1");
    expect(loadDraft(st, A, "f1", T0, DRAFT_MAX_AGE_MS)).toBeNull();
    expect(loadDraft(st, A, "f2", T0, DRAFT_MAX_AGE_MS)).toEqual({ b: "2" });
    clearAllDrafts(st);
    expect(loadDraft(st, A, "f2", T0, DRAFT_MAX_AGE_MS)).toBeNull();
    expect(st.getItem("other-app-key")).toBe("x");
  });

  it("INV-L20 (실패경로): 망가진 값·저장소 오류는 복원하지 않고 던지지 않는다", () => {
    const st = memory();
    st.setItem(`fk-draft:${A}:f`, "{not json");
    expect(loadDraft(st, A, "f", T0, DRAFT_MAX_AGE_MS)).toBeNull();
    const broken: DraftStorage = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveDraft(broken, A, "f", { a: "1" }, T0)).not.toThrow();
    expect(loadDraft(broken, A, "f", T0, DRAFT_MAX_AGE_MS)).toBeNull();
    expect(() => clearAllDrafts(broken)).not.toThrow();
  });
});

describe("INV-L20: 비밀번호 칸은 저장하지 않는다", () => {
  it("INV-L20 (S18): 폼 칸 중 비밀번호·숨김·파일·버튼은 빼고 이름(없으면 id)으로 모은다", () => {
    const fields = [
      { type: "text", name: "title", id: "", value: "공지" },
      { type: "password", name: "pw", id: "", value: "secret-1234" },
      { type: "hidden", name: "token", id: "", value: "h" },
      { type: "file", name: "img", id: "", value: "C:\\fakepath\\a.png" },
      { type: "submit", name: "go", id: "", value: "저장" },
      { type: "textarea", name: "", id: "r1-body", value: "내용" },
      { type: "checkbox", name: "pin", id: "", value: "on", checked: true },
      { type: "radio", name: "tier", id: "", value: "small", checked: false },
      { type: "radio", name: "tier", id: "", value: "large", checked: true },
      { type: "text", name: "", id: "", value: "이름 없음" },
    ];
    expect(draftableValues(fields)).toEqual({ title: "공지", "r1-body": "내용", pin: "true", "tier=large": "true" });
  });
});

describe("INV-L20: 서버 값을 고치는 폼은 저장 때의 서버 값과 지금 서버 값이 다르면 복원하지 않는다", () => {
  it("INV-L20 (실패경로): 기준값이 같으면 복원, 다르면 복원하지 않고 지운다", () => {
    const st = memory();
    saveDraft(st, A, "pricing", { fee: "1500" }, T0, "base-v1");
    expect(loadDraft(st, A, "pricing", T0, DRAFT_MAX_AGE_MS, "base-v1")).toEqual({ fee: "1500" });
    expect(loadDraft(st, A, "pricing", T0, DRAFT_MAX_AGE_MS, "base-v2")).toBeNull();
    expect(st.map.size).toBe(0);
  });

  it("INV-L20 (실패경로): 기준값 없이 저장한 것을 기준값이 있는 폼이 읽으면 복원하지 않는다", () => {
    const st = memory();
    saveDraft(st, A, "pricing", { fee: "1500" }, T0);
    expect(loadDraft(st, A, "pricing", T0, DRAFT_MAX_AGE_MS, "base-v1")).toBeNull();
  });
});

describe("INV-L20: 사이트 어느 화면에서든 만료·다른 계정 임시 저장을 지운다", () => {
  it("INV-L20: 로그인 안 한 화면이면 만료된 것만 지운다", () => {
    const st = memory();
    saveDraft(st, A, "old", { a: "1" }, T0 - DRAFT_MAX_AGE_MS);
    saveDraft(st, A, "fresh", { a: "2" }, T0);
    saveDraft(st, B, "fresh", { b: "3" }, T0);
    st.setItem("other-app-key", "x");
    purgeDrafts(st, T0, DRAFT_MAX_AGE_MS, null);
    expect([...st.map.keys()].sort()).toEqual([`fk-draft:${A}:fresh`, `fk-draft:${B}:fresh`, "other-app-key"].sort());
  });

  it("INV-L20 (실패경로): 로그인한 사람이 있으면 다른 계정 것도 지운다 · 망가진 값도 지운다", () => {
    const st = memory();
    saveDraft(st, A, "f", { a: "1" }, T0);
    saveDraft(st, B, "f", { b: "2" }, T0);
    st.setItem(`fk-draft:${A}:broken`, "{nope");
    purgeDrafts(st, T0, DRAFT_MAX_AGE_MS, A);
    expect([...st.map.keys()]).toEqual([`fk-draft:${A}:f`]);
  });

  it("INV-L20 (실패경로): 막힌 저장소에서도 던지지 않는다", () => {
    const broken: DraftStorage = {
      length: 1,
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };
    expect(() => purgeDrafts(broken, T0, DRAFT_MAX_AGE_MS, A)).not.toThrow();
  });
});
