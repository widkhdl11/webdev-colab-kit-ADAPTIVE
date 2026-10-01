import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// INV-S10: 카카오 인증 API 호출은 고정 IP 경로에서만 나간다 — 앱 서버 코드에 그 주소가 없어야 한다.
// 스펙이 정한 검사 방법 자체가 「앱 서버 코드에서 주소를 찾는다」라서 소스를 훑는다.
// 고정 IP 경로 모듈이 생기면 그 폴더만 ALLOWED_DIR 로 뺀다.

const SRC = join(process.cwd(), "src");
const ALLOWED_DIR = join("shared", "api", "fixed-ip-relay");
// 카카오 인증서·로그인 API 와 인증서 중개(딜러사) API 주소
const KAKAO_AUTH_HOST = /(kakaocert|barocert|kauth\.kakao\.com|kapi\.kakao\.com|ca\.kakao\.com)/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

function kakaoAuthHits(files: readonly { path: string; text: string }[]): string[] {
  return files
    .filter((f) => !f.path.split(sep).join("/").includes(ALLOWED_DIR.split(sep).join("/")))
    .filter((f) => KAKAO_AUTH_HOST.test(f.text))
    .map((f) => f.path);
}

describe("INV-S10: 앱 서버 코드에 카카오 인증 API 주소가 없다", () => {
  it("INV-S10: 검사기가 심어 둔 주소를 잡고, 고정 IP 경로 폴더는 뺀다", () => {
    expect(kakaoAuthHits([{ path: join("features", "x.ts"), text: 'fetch("https://kauth.kakao.com/oauth/token")' }])).toHaveLength(1);
    expect(kakaoAuthHits([{ path: join("entities", "y.ts"), text: "const base = 'https://api.kakaocert.com'" }])).toHaveLength(1);
    expect(kakaoAuthHits([{ path: join(ALLOWED_DIR, "client.ts"), text: "https://api.kakaocert.com" }])).toEqual([]);
    expect(kakaoAuthHits([{ path: join("widgets", "z.tsx"), text: "카카오톡 인증서로 서명해요" }])).toEqual([]);
  });

  it("INV-S10 S10: src 전체에서 고정 IP 경로 밖에는 주소가 나오지 않는다", () => {
    const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }));
    expect(files.length).toBeGreaterThan(50);
    expect(kakaoAuthHits(files)).toEqual([]);
  });
});
