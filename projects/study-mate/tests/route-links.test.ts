import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { matchesRoute, pathLiteralsOf, routesOf, walk } from "./route-links.helpers";

/*
 * 화면 안의 경로 문자열이 **실제로 있는 라우트**를 가리키는지 본다.
 *
 * 왜 이 검사가 생겼나: 푸터의 「서비스 소개」가 없는 화면을 가리키고 있었다. 오류로
 * 터지지 않고 누른 사람에게만 404 가 나오고, Next 의 링크 미리 가져오기 때문에 그 화면을
 * 안 눌러도 **모든 화면의 콘솔에 404 가 찍히고 있었다.** 타입 검사도 테스트도 프로덕션
 * 빌드도 전부 초록불이었다 — 경로가 문자열이라 아무도 안 붙들었다.
 *
 * **이 검사가 대조하는 것은 파일 이름에서 유추한 라우트 목록이다.** 「링크가 실제로
 * 열린다」를 보는 것이 아니라 「그 자리에 `page.tsx` 가 있다」를 본다. 범위를 넓게 읽으면
 * 이 검사가 안 붙드는 것까지 붙든다고 믿게 되므로 여기 적어 둔다.
 *
 * 방향이 둘이라 검사도 둘이다.
 *   ① 경로 → 라우트: 가리키는 곳이 없으면 잡는다.
 *   ② 라우트 집합 자체: 라우트가 사라져도 잡는다. ①만으로는 못 잡는다 — 동적 칸이 아무
 *      값이나 받으므로 형제 화면이 사라져도 그 동적 라우트가 대신 맞아 준다. 그 상태의
 *      제품은 404 가 아니라 **틀린 화면**을 그린다.
 */

// jsdom 환경에서는 `import.meta.url` 이 파일 주소가 아니다. vitest 는 프로젝트 뿌리에서 돈다.
const SRC = join(process.cwd(), "src");
const APP = join(SRC, "app");

/**
 * 라우트가 아닌데 경로처럼 생긴 문자열. **사유를 반드시 적는다** — 예외를 적는 그 순간이
 * "이게 정말 라우트가 아닌가"를 확인하는 자리다.
 */
const NOT_ROUTES: ReadonlyMap<string, string> = new Map([
  [
    "/studies",
    "세션 가드의 보호 접두사다(그 아래를 통째로 덮는다). 스터디 목록 화면은 없다 — 화면 목록이 「탐색은 모집글로 한다」로 정했다",
  ],
]);

describe("화면이 들고 있는 경로는 있는 라우트를 가리킨다", () => {
  const files = walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f));
  const routes = routesOf(files, APP);

  // ── 먼저 판정기 자체를 시험한다. 이게 없으면 「위반 0건」과 「아무것도 안 봤다」가 같아 보인다.
  it("판정기: 없는 경로를 없다고 말한다 (일부러 심은 위반)", () => {
    const fake = ["/", "/posts", "/posts/[id]"];
    expect(matchesRoute("/about", fake)).toBe(false);
    expect(matchesRoute("/posts/123/edit", fake)).toBe(false);
    expect(matchesRoute("/posts", fake)).toBe(true);
    expect(matchesRoute("/posts/123", fake)).toBe(true);
  });

  it("판정기: 칸 수가 다르면 안 맞는다 — 동적 칸이 여러 칸을 삼키지 않는다", () => {
    expect(matchesRoute("/posts/1/2", ["/posts/[id]"])).toBe(false);
    expect(matchesRoute("/posts", ["/posts/[id]"])).toBe(false);
  });

  it("판정기: 실행 시점 값은 라우트의 고정 칸을 못 맞춘다", () => {
    expect(matchesRoute("/posts/[?]", ["/posts/[id]"])).toBe(true);
    expect(matchesRoute("/posts/[?]", ["/posts/create"])).toBe(false);
  });

  it("뽑기: 이름이 `href` 가 아니어도 집는다 — 소개 화면이 죽어 있던 자리가 그 모양이다", () => {
    expect(pathLiteralsOf('footHref: "/signup",')).toEqual(["/signup"]);
    expect(pathLiteralsOf('more={{ href: "/posts", label: "x" }}')).toEqual(["/posts"]);
    expect(pathLiteralsOf('redirect("/")')).toEqual(["/"]);
    expect(pathLiteralsOf("<Link href={'/about'}>")).toEqual(["/about"]);
  });

  it("뽑기: 질의·조각은 떼고, 바깥 주소와 주석은 안 집는다", () => {
    expect(pathLiteralsOf('href="/posts?category=1" href="/about#x" href="https://x/y"')).toEqual([
      "/posts",
      "/about",
    ]);
    expect(pathLiteralsOf('// 설명에 적힌 예시 "/Studies/123" 은 경로가 아니다')).toEqual([]);
    expect(pathLiteralsOf('/* 여러 줄 주석 안의 "/nope" */')).toEqual([]);
  });

  it("뽑기: 템플릿 문자열의 고정 칸은 판정한다", () => {
    expect(pathLiteralsOf("href={`/posts/${post.id}/edit`}")).toEqual(["/posts/[?]/edit"]);
    expect(pathLiteralsOf("href={`/posts/create?study=${s.id}`}")).toEqual(["/posts/create"]);
    expect(pathLiteralsOf("href={`/login?next=/posts/${id}`}")).toEqual(["/login"]);
  });

  it("뽑기: 한 칸이 글자와 실행 시점 값으로 섞이면 판정하지 않는다", () => {
    // 붙은 값이 질의인지 경로의 뒷글자인지 알 수 없다. 아는 척하면 없는 경로를 지적한다.
    expect(pathLiteralsOf("href={`/posts${buildQuery({ page: 2 })}`}")).toEqual([]);
    // 안쪽 중괄호가 있어도 `${…}` 를 통째로 넘긴다 — 못 넘기면 뒤에 찌꺼기가 붙는다
    expect(pathLiteralsOf("href={`/posts/${pick({ a: 1 })}/edit`}")).toEqual(["/posts/[?]/edit"]);
  });

  it("뽑기: 심은 오타를 실제로 집어 온다", () => {
    expect(pathLiteralsOf("href={`/post/${id}`}")).toEqual(["/post/[?]"]);
    expect(matchesRoute("/post/[?]", routes)).toBe(false);
    expect(matchesRoute("/nope", routes)).toBe(false);
  });

  // ── ② 라우트 집합. 라우트가 사라지는 쪽은 경로 검사로 안 잡힌다.
  it("라우트 집합이 그대로다 — 라우트를 지우거나 더하면 이 줄을 같이 고쳐야 한다", () => {
    expect([...routes].sort()).toEqual([
      "/",
      "/about",
      "/chats",
      "/chats/[id]",
      "/login",
      "/posts",
      "/posts/[id]",
      "/posts/[id]/edit",
      "/posts/create",
      "/profile",
      "/profile/edit",
      "/profile/password",
      "/signup",
      "/studies/[id]",
      "/studies/[id]/edit",
      "/studies/create",
    ]);
  });

  // ── ① 경로 → 라우트.
  it("어느 파일에서 무엇을 뽑았는지 못박는다 — 개수만 세면 훑는 범위가 좁아져도 통과한다", () => {
    const from = (...parts: string[]) =>
      pathLiteralsOf(readFileSync(join(SRC, ...parts), "utf-8"));

    expect(from("widgets", "site-footer", "ui", "SiteFooter.tsx")).toContain("/about");
    expect(from("features", "auth", "ui", "AuthForm.tsx")).toEqual(
      expect.arrayContaining(["/signup", "/login"]),
    );
    expect(from("app", "page.tsx")).toEqual(expect.arrayContaining(["/posts", "/studies/create"]));
    expect(from("app", "about", "page.tsx")).toEqual(
      expect.arrayContaining(["/posts", "/studies/create"]),
    );
    expect(from("entities", "session", "model", "route-access.ts")).toContain("/login");
  });

  it("들고 있는 경로가 전부 있는 라우트를 가리킨다", () => {
    const dead: string[] = [];
    let scanned = 0;
    for (const file of files) {
      for (const path of pathLiteralsOf(readFileSync(file, "utf-8"))) {
        if (NOT_ROUTES.has(path)) continue;
        scanned += 1;
        if (!matchesRoute(path, routes)) dead.push(`${relative(SRC, file)} → ${path}`);
      }
    }
    expect(scanned).toBeGreaterThan(30); // 훑을 것이 있었다는 증거
    expect(dead).toEqual([]);
  });

  it("예외 목록은 정말 라우트가 아닌 것만 담는다", () => {
    for (const [path, reason] of NOT_ROUTES) {
      expect(reason.length, `${path} 의 사유가 비어 있다`).toBeGreaterThan(10);
      expect(matchesRoute(path, routes), `${path} 는 이제 라우트다 — 예외에서 빼라`).toBe(false);
    }
  });
});
