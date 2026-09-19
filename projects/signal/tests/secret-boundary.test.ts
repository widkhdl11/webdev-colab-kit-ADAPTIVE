import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * INV-S4 (ingestion-ranking): 서버 전용 시크릿은 클라이언트 번들·코드에 존재하지 않는다.
 *
 * 게이트 NO_HARDCODED_SECRET 는 "코드에 값을 박았나"를 본다. 여기서 보는 건 다른 것 —
 * **값이 아니라 배치**다. 시크릿을 읽는 코드가 클라이언트 컴포넌트 쪽에 있으면 값을 안 박아도
 * 번들에 들어간다(Next 가 `process.env.X` 를 클라 청크에 인라인한다).
 *
 * 실제 번들을 뒤지는 건 `next build` 가 필요해 게이트에서 돌릴 수 없다(S13 은 배포 전 확인).
 * 그래서 여기서는 **번들에 들어갈 수 있는 파일 집합**을 정적으로 훑는다.
 */

const SRC = resolve(process.cwd(), "src");

/** 서버에서만 읽어야 하는 환경변수. NEXT_PUBLIC_ 접두사가 붙으면 그 자체로 위반이다. */
const SERVER_ONLY_ENV = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_TOKEN",
  "ANTHROPIC_API_KEY",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : /\.(ts|tsx)$/.test(full)
        ? [full]
        : [];
  });
}

const files = walk(SRC).map((path) => ({
  path,
  rel: relative(SRC, path).split(sep).join("/"),
  text: readFileSync(path, "utf8"),
}));

/**
 * `import "server-only"` 를 단 파일 = 서버 전용 모듈.
 *
 * 경로를 손으로 적어 두면 서버 전용 모듈이 하나 늘 때마다 이 테스트가 엉뚱하게 깨진다
 * (실제로 supabase-server.ts 를 만들자마자 그랬다). **표시를 기준으로 세는 게 맞다** —
 * 그 한 줄이 있으면 클라이언트가 import 할 때 빌드가 깨지므로, 표시 자체가 경계다.
 */
const SERVER_ONLY_MARK = /^import ["']server-only["'];?\s*$/m;
const serverOnly = files.filter((f) => SERVER_ONLY_MARK.test(f.text));
const serverOnlyPaths = serverOnly.map((f) => f.rel);

/** 서버 전용 모듈을 가리키는 import 경로 조각(확장자·별칭을 뺀 파일명). */
const serverOnlyNames = serverOnlyPaths.map((p) => p.replace(/^.*\//, "").replace(/\.tsx?$/, ""));

/**
 * 클라이언트로 갈 수 있는 파일: `"use client"` 가 붙은 파일과 그 아래로 딸려 가는 것들.
 *
 * import 그래프를 다 따라가지는 않는다 — 대신 **경계를 보수적으로** 잡는다.
 * 서버 전용 코드는 app/ 라우트와 features/ingestion, 그리고 표시를 단 모듈에만 있다.
 */
const clientCandidates = files.filter(
  (f) =>
    !f.rel.startsWith("app/") &&
    !f.rel.startsWith("features/ingestion/") &&
    !serverOnlyPaths.includes(f.rel),
);

describe("INV-S4 — 서버 전용 시크릿의 배치", () => {
  it("INV-S4: 서버 전용 환경변수를 읽는 파일에는 반드시 server-only 표시가 있다", () => {
    const unmarked = files
      .filter((f) => SERVER_ONLY_ENV.some((name) => f.text.includes(name)))
      .filter((f) => !serverOnlyPaths.includes(f.rel))
      .map((f) => f.rel);
    expect(unmarked).toEqual([]);
  });

  it("INV-S4: 표시를 단 모듈이 실제로 존재한다", () => {
    // 0개면 위 단언이 공허하게 통과한다 — 이 레포에서 반복된 빈칸이다.
    expect(serverOnlyPaths.length).toBeGreaterThan(0);
    expect(serverOnlyPaths).toContain("shared/api/server-env.ts");
  });

  it("INV-S4: 클라이언트로 갈 수 있는 파일이 서버 전용 모듈을 import 하지 않는다", () => {
    const pattern = new RegExp(`from\\s+["'][^"']*(${serverOnlyNames.join("|")})["']`);
    const offenders = clientCandidates
      .filter((f) => pattern.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("INV-S4 (S13) 실패경로: 서버 전용 이름에 NEXT_PUBLIC_ 을 붙인 곳이 없다", () => {
    // 붙이는 순간 Next 가 값을 클라 청크에 문자열로 넣는다.
    const offenders = files
      .filter((f) =>
        SERVER_ONLY_ENV.some((name) => f.text.includes(`NEXT_PUBLIC_${name}`)),
      )
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("INV-S4: `\"use client\"` 파일에는 어떤 process.env 접근도 없다", () => {
    // NEXT_PUBLIC_ 이라도 클라 컴포넌트에서 직접 읽으면, 나중에 이름 하나 바꿀 때
    // 서버 전용 값이 같은 자리로 들어오기 쉽다. 값은 서버에서 props 로 내려보낸다.
    const offenders = files
      .filter((f) => /^\s*["']use client["']/m.test(f.text))
      .filter((f) => f.text.includes("process.env"))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("검사 대상이 실제로 존재한다 — 훑을 파일이 0개면 위 단언은 아무 뜻이 없다", () => {
    // "검사할 파일이 없으면 그냥 통과한다"가 이 레포에서 반복된 빈칸이다(findings F-12 계열).
    expect(files.length).toBeGreaterThan(20);
    expect(clientCandidates.length).toBeGreaterThan(10);
    expect(files.some((f) => /^\s*["']use client["']/m.test(f.text))).toBe(true);
  });
});
