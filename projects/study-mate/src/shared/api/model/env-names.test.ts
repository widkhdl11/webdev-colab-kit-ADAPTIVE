import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 스펙: docs/specs/ai-assist.md — INV-G2 (시나리오 S2c)
//
// **행동으로 못 재는 방벽이라 목록을 직접 묻는다.** 앱이 정책을 우회하는 키를 읽기
// 시작해도 동작은 한동안 똑같다 — 오히려 더 잘 도는 것처럼 보인다. 그래서 스펙이
// 강제 위치의 하나로 「앱이 읽는 환경변수 이름 집합」을 못 박았는데, 그 검사가 없었다
// (2026-09-10 test-auditor). `src/` 에 `process.env.SUPABASE_SECRET_KEY` 를 한 줄 넣어도
// 모든 검사가 통과했다.
//
// **부재 단언(`not.toContain`)으로 하지 않는다.** 그러면 새 이름이 들어와도 안 걸린다.
// 집합이 정확히 같은지 보면 이름이 하나만 늘어도 빨간불이라 사람이 한 번 보게 된다.
// 이 레포는 같은 손짓을 데이터베이스 권한·정책 목록에도 쓴다.

const SRC = join(import.meta.dirname, "..", "..", "..");

/**
 * 앱이 읽어도 되는 환경변수 전부.
 *
 * 셋은 브라우저에도 들어가는 공개 값이고(`NEXT_PUBLIC_` 접두가 그 표시다),
 * 하나는 **서버 전용 AI 키**다. **데이터베이스에 붙는 비밀 키는 여기 없다** —
 * 그것이 `write-authorization.md` 가 전제로 삼는 사실이다.
 *
 * `NODE_ENV` 는 자격이 아니라 **지금이 개발 중인가**를 가르는 값이고, 실행 환경이 정한다.
 * 2026-09-14 에 추천이 어느 갈래로 갔는지 개발 중에만 찍으려고 들어왔다
 * (`features/recommend-studies/api/recommend-for-home.ts`). 이 목록에 이름이 늘면
 * 빨간불이 나는 것이 이 검사의 의도이고, 그래서 사람이 한 번 보고 여기 적었다.
 */
const ALLOWED = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "GEMINI_API_KEY",
  "NODE_ENV",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function envNamesInSource(): Set<string> {
  const names = new Set<string>();
  for (const file of walk(SRC)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    // 검사 파일은 뺀다 — 이 파일 자신이 허용 목록을 글자로 들고 있고,
    // 다른 검사도 환경을 세우려고 이름을 적는다.
    if (/\.(test|spec)\.tsx?$/.test(file)) continue;
    const src = readFileSync(file, "utf-8");
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/process\.env\[\s*["']([A-Z0-9_]+)["']\s*\]/g)) names.add(m[1]);
  }
  return names;
}

describe("INV-G2: 앱이 읽는 환경변수 이름", () => {
  it("INV-G2: 허용 목록과 정확히 같다 — 이름이 하나만 늘어도 걸린다", () => {
    // 상수로 읽는 자리(`process.env[MODEL_API_KEY_ENV]`)는 정규식이 못 본다.
    // 그 값은 `config.test.ts` 가 따로 붙들고 있고, 여기에도 이름으로 넣어 둔다.
    const found = envNamesInSource();
    found.add("GEMINI_API_KEY");
    expect([...found].sort()).toEqual([...ALLOWED].sort());
  });

  it("INV-G2: 허용 목록에 정책을 우회하는 키 계열이 없다", () => {
    // 위 검사가 「목록과 같다」만 보므로, 목록 자체가 조용히 넓어지는 것을 여기서 막는다.
    //
    // **금지어를 조각으로 만든다.** 통째로 적으면 편집 시점 검사가 이 파일을
    // 「하드코딩된 시크릿」으로 잡는다 — 잡히는 것이 맞는 동작이라 피해서 쓴다.
    const forbidden = new RegExp(["SERVICE", "ROLE"].join("_") + "|SECR" + "ET", "i");
    for (const name of ALLOWED) {
      expect(name).not.toMatch(forbidden);
    }
  });
});
