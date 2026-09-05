// 이 스위트는 정책을 우회하는 secret 키와 슈퍼유저 직결을 쓴다. 그 둘이 원격을 가리키면
// 남의 프로젝트에 테스트 사용자와 모집글을 만들고, 변이 도구는 거기에 「아무나 읽는다」
// 정책을 심는다. 그래서 붙는 곳을 로드 시점에 강제하는데, **그 강제 자체를 붙드는 것이 없으면
// 조용히 넓어진다.**
//
// 특히 문자열 패턴은 이 판정에 못 쓴다 — URL 문법에서 호스트를 정하는 것은 마지막 `@` 뒤라,
// `http://localhost:54321@evil.com` 이 「localhost 로 시작한다」를 통과한다.

import { describe, expect, it } from "vitest";
import { isLocalUrl } from "./helpers";

describe("통합 스위트는 로컬에만 붙는다", () => {
  it("로컬 주소는 통과한다", () => {
    // **부재만 보면 절반이다.** 거절만 확인하면 `return false` 로 바꿔도 통과한다.
    for (const ok of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "http://localhost",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      "postgresql://postgres:postgres@localhost:54322/postgres",
    ]) {
      expect(isLocalUrl(ok), `${ok} 가 막혔다`).toBe(true);
    }
  });

  it("호스트가 로컬이 아니면 막는다", () => {
    for (const bad of [
      // 마지막 `@` 뒤가 진짜 호스트다. 앞의 둘이 문자열 패턴을 통과하던 모양이다.
      "http://localhost:54321@evil.com",
      "postgresql://postgres:postgres@127.0.0.1:54322@evil.com/postgres",
      // 이름이 로컬로 시작하거나 끝나기만 하는 것들
      "http://localhost.evil.com",
      "http://127.0.0.1.evil.com",
      "http://evil.com/127.0.0.1",
      "https://abcdefgh.supabase.co",
      // URL 이 아닌 값도 통과시키지 않는다
      "127.0.0.1:54321",
      "",
    ]) {
      expect(isLocalUrl(bad), `${bad} 가 통과했다`).toBe(false);
    }
  });
});
