import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 스펙: docs/specs/ai-assist.md — INV-G1
//
// **행동으로 못 재는 방벽이다.** 키가 새어 나가도 앱의 동작은 똑같다 — 화면도 정상이고
// 오류도 안 난다. 번들을 받은 사람만 안다. 그래서 동작이 아니라 **빌드 산출물을 직접
// 읽어서** 단언한다.
//
// **대조군이 이 검사의 절반이다.** 「0건」이라는 결과와 스캔이 아예 안 돈 것은 겉이 같다.
// 그래서 클라이언트 번들에 **반드시 들어가야 하는 값**(공개 키)을 같이 심고, 그것이
// 잡히는 것을 먼저 본다. 잡히지 않으면 스캔이 고장 난 것이므로 검사가 실패한다.

const APP = join(import.meta.dirname, "..", "..");
const CLIENT_CHUNKS = join(APP, ".next", "static");

/** 클라이언트 번들에 들어가야 하는 값 — 스캔이 실제로 작동하는지 보는 대조군 */
const PUBLIC_SENTINEL = "sb_publishable_BUNDLESCAN_CONTROL_0001";
/** 클라이언트 번들에 들어가면 안 되는 값 */
const SERVER_SENTINEL = "BUNDLESCAN_SERVER_ONLY_0002";

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

function filesContaining(needle: string): string[] {
  return walk(CLIENT_CHUNKS).filter((f) => readFileSync(f, "utf-8").includes(needle));
}

describe("INV-G1: AI 키는 클라이언트 번들에 안 들어간다", () => {
  it(
    "INV-G1: 센티넬 값으로 빌드하면 공개 키는 잡히고 AI 키는 안 잡힌다",
    () => {
      const built = spawnSync("npx", ["next", "build"], {
        cwd: APP,
        encoding: "utf-8",
        shell: true,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUBLIC_SENTINEL,
          GEMINI_API_KEY: SERVER_SENTINEL,
        },
      });
      expect(built.status, `빌드가 실패했다:\n${built.stdout}\n${built.stderr}`).toBe(0);

      // ① 대조군 — 이게 0건이면 스캔이 고장 난 것이다. 아래 ②의 「0건」이 아무 뜻도 없어진다.
      expect(
        filesContaining(PUBLIC_SENTINEL).length,
        "스캔이 작동하지 않는다 — 클라이언트 번들에 반드시 들어가는 공개 키를 못 찾았다",
      ).toBeGreaterThan(0);

      // ② 본검사 — AI 키는 한 파일에도 없어야 한다.
      expect(filesContaining(SERVER_SENTINEL)).toEqual([]);
    },
    240_000,
  );
});
