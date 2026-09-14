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

  it("질의 매개변수가 호스트를 덮어쓰는 주소도 막는다 — `new URL()` 로는 안 보인다", () => {
    // **`new URL(...).hostname` 이 「127.0.0.1」이어도 pg 는 다른 곳에 붙는다.**
    // `pg-connection-string` 이 질의 매개변수를 URL 의 호스트 위에 덮어쓰기 때문이다.
    // 2026-09-11 에 설치된 사본에서 실측했다 — 아래 첫 값에서
    // `parse()` 가 `{ host: "evil.example", port: "5432" }` 를 돌려준다.
    // 그 연결에는 슈퍼유저 자격이 실리고, 변이 도구는 거기에 인가를 무력화하는 문장을 보낸다.
    for (const bad of [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=evil.example&port=5432",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=evil.example",
      "postgresql://postgres:postgres@localhost:54322/postgres?hostaddr=203.0.113.9",
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres?HOST=evil.example",
      "http://127.0.0.1:54321?host=evil.example",
    ]) {
      expect(isLocalUrl(bad), `${bad} 가 통과했다`).toBe(false);
    }
  });

  it("호스트를 안 바꾸는 매개변수는 그대로 통과한다", () => {
    // **거부를 넓히면 이번엔 멀쩡한 주소가 막힌다.** `sslmode` 같은 것은 붙는 곳을
    // 안 바꾸므로 여기서 걸면 안 된다 — 이 짝이 없으면 판정을
    // 「질의 매개변수가 하나라도 있으면 거부」로 바꿔도 위 검사가 전부 통과한다.
    for (const ok of [
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres?sslmode=disable",
      "postgresql://postgres:postgres@localhost:54322/postgres?application_name=study-mate",
    ]) {
      expect(isLocalUrl(ok), `${ok} 가 막혔다`).toBe(true);
    }
  });
});

describe("변이 도구도 같은 주소 판정을 쓴다", () => {
  // **판정이 두 자리에 따로 있다.** 통합 스위트는 `isLocalUrl` 을 쓰고, 변이 도구는
  // 자기 안의 `assertLocal` 을 쓴다(그 도구는 npm 의존이 아니라 단독 스크립트로 돌아서
  // 이 모듈을 못 부른다). 한쪽만 고치면 **다른 한쪽으로 같은 우회가 그대로 남는다** —
  // 그래서 여기서 도구를 실제로 실행해 거절을 확인한다.
  //
  // 붙지 않는 명령(`--list`)을 쓴다. 주소 검사는 그 도구의 로드 시점에 돌기 때문에
  // 데이터베이스가 없어도 판정이 성립한다.
  const 돌린다 = async (url: string) => {
    const { spawnSync } = await import("node:child_process");
    return spawnSync(process.execPath, ["scripts/mutate.mjs", "--list"], {
      encoding: "utf-8",
      env: { ...process.env, SUPABASE_DB_URL: url },
    });
  };

  it("질의 매개변수로 호스트를 바꾼 주소를 거절한다", async () => {
    const r = await 돌린다(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=evil.example&port=5432",
    );

    expect(r.status, `도구가 이 주소로 돌았다:\n${r.stdout ?? ""}`).toBe(1);
    expect(r.stderr).toContain("호스트를 바꾸는 매개변수");
    // **비밀번호가 그대로 화면에 나가면 안 된다.** 거절 메시지가 주소를 되비친다.
    expect(r.stderr).not.toContain("postgres:postgres@");
  });

  it("로컬 주소에서는 그대로 돈다 — 거절이 전부로 바뀌지 않았다", async () => {
    const r = await 돌린다("postgresql://postgres:postgres@127.0.0.1:54322/postgres");

    expect(r.status, `로컬 주소가 거절됐다:\n${r.stderr ?? ""}`).toBe(0);
    expect(r.stdout).toContain("username-visible-dropped");
  });
});
