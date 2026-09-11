import { describe, expect, it } from "vitest";
import { parseRanking } from "./parse";

// 스펙: docs/specs/ai-assist.md — INV-G3
//
// 이 파일이 붙드는 것은 하나다: **모델의 응답에서 앱이 취하는 것은 후보 목록 안의 id 와
// 그 순서뿐이다.** 모델이 무엇을 돌려주든 후보 밖의 것은 결과에 못 들어간다.

const ALLOWED = ["a", "b", "c"] as const;

describe("INV-G3: 모델의 답에서 취하는 것은 후보 안의 id 와 순서뿐이다", () => {
  it("INV-G3: 후보 안의 id 만 돌아오면 모델이 준 순서를 그대로 쓴다", () => {
    expect(parseRanking('{"ranked":["c","a"]}', ALLOWED)).toEqual(["c", "a"]);
  });

  it("INV-G3 (실패경로): 후보에 없는 id 는 버린다", () => {
    // 「없는 모집글을 지어내기」가 막히는 자리다.
    expect(parseRanking('{"ranked":["zzz","b","없는것"]}', ALLOWED)).toEqual(["b"]);
  });

  it("INV-G3 (실패경로): 후보 밖의 id 뿐이면 빈 순서가 된다 — 지어낸 것이 하나도 안 남는다", () => {
    expect(parseRanking('{"ranked":["zzz"]}', ALLOWED)).toEqual([]);
  });

  it("INV-G3: 같은 id 를 여러 번 넣어도 한 번만 남는다", () => {
    // 중복을 그대로 두면 같은 카드가 두 장 그려진다.
    expect(parseRanking('{"ranked":["a","a","b","a"]}', ALLOWED)).toEqual(["a", "b"]);
  });

  it("INV-G3 (실패경로): JSON 이 아니면 부분을 긁어내지 않고 통째로 실패한다", () => {
    // 응답 안에 후보 id 가 글자로 들어 있어도 주워 담지 않는다.
    expect(parseRanking("죄송합니다. a 와 b 를 추천합니다.", ALLOWED)).toBeNull();
  });

  it("INV-G3 (실패경로): 약속한 모양이 아니면 실패한다 — ranked 가 배열이 아닐 때", () => {
    expect(parseRanking('{"ranked":"a"}', ALLOWED)).toBeNull();
  });

  it("INV-G3 (실패경로): 약속한 모양이 아니면 실패한다 — ranked 가 없을 때", () => {
    expect(parseRanking('{"결과":["a"]}', ALLOWED)).toBeNull();
  });

  it("INV-G3 (실패경로): 배열 안에 문자열이 아닌 것이 섞이면 통째로 실패한다", () => {
    // 「섞인 것만 버리고 나머지는 쓴다」로 하지 않는다 — 모양이 다르면 그 응답 전체를 못 믿는다.
    expect(parseRanking('{"ranked":["a",{"id":"b"}]}', ALLOWED)).toBeNull();
  });

  it("INV-G3: 모델이 코드 울타리로 감싸 보내도 읽는다", () => {
    // 지시문에 「JSON 만」이라고 적어도 울타리를 붙이는 일이 잦다. 이건 모양이 다른 것이
    // 아니라 같은 JSON 을 감싼 것이라 벗겨 낸다.
    const raw = '```json\n{"ranked":["b","a"]}\n```';
    expect(parseRanking(raw, ALLOWED)).toEqual(["b", "a"]);
  });

  it("INV-G3 (실패경로): 후보가 비어 있으면 무엇을 돌려주든 빈 순서다", () => {
    expect(parseRanking('{"ranked":["a"]}', [])).toEqual([]);
  });
});
