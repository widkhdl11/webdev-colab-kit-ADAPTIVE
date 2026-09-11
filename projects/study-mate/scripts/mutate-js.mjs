// AI 국면의 강제 장치를 하나씩 무력화하고, 그것을 붙들어야 할 검사가 실제로 빨간불이
// 되는지 본다. 변이 하나는 강제 장치 하나만 무력화한다 — 갈래 여럿을 한 변이로 묶으면
// 그중 하나만 붙들려 있어도 「잡혔다」가 되고 나머지는 아무도 안 붙드는데 만점이 나온다.
//
// 사용: node scripts/mutate-js.mjs   (되돌리기는 자동 — 변이마다 심고 검사하고 원본을 되쓴다)
//
// 킷의 `mutate.mjs` 와 나눈 이유: 그쪽은 데이터베이스의 정책·권한·트리거를 무력화하는데,
// AI 국면의 강제 장치는 대부분 TypeScript 에 있다. 되돌리는 방법도 다르다 —
// 저쪽은 마이그레이션을 다시 적용하고 이쪽은 파일 원본을 되쓴다.
//
// **INV-G9 의 화면 쪽 절반과 INV-G1 의 번들 쪽 절반은 여기 없다.** 전자는 컴포넌트 검사가
// 직접 들고(`DraftAssistant.test.tsx`), 후자는 빌드 산출물을 뒤지는 통합 검사가 든다
// (`tests/integration/client-bundle-secrets.test.ts` — 그 검사는 대조군을 함께 심는다).
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const S = (p) => join(APP, "src", p);

const MUTATIONS = [
  // ── INV-G1 · 키가 브라우저로 나가는 길 ─────────────────────────────────
  {
    label: "g1-public-env-name",
    what: "INV-G1 — 키 이름에 공개 접두가 붙는다",
    file: S("shared/api/model/config.ts"),
    from: 'export const MODEL_API_KEY_ENV = "GEMINI_API_KEY";',
    to: 'export const MODEL_API_KEY_ENV = "NEXT_PUBLIC_GEMINI_API_KEY";',
    test: "src/shared/api/model/config.test.ts",
  },
  {
    label: "g1-public-fallback",
    what: "INV-G1 — 공개 접두 이름으로도 키를 찾는다",
    file: S("shared/api/model/config.ts"),
    from: "  const apiKey = process.env[MODEL_API_KEY_ENV];",
    to: "  const apiKey = process.env[MODEL_API_KEY_ENV] ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;",
    test: "src/shared/api/model/config.test.ts",
  },

  // ── INV-G2 · 어느 연결로 읽는가 ────────────────────────────────────────
  {
    label: "g2-bypass-connection",
    what: "INV-G2 — 근거를 세션이 아닌 연결로 읽는다",
    file: S("features/recommend-studies/api/read-evidence.ts"),
    from: "const db = await createServerSupabase();",
    to: 'const db = { tag: "bypass" };',
    test: "src/features/recommend-studies/api/read-evidence.test.ts",
  },
  {
    label: "g2-drop-partial-evidence",
    what: "INV-G2 — 근거 하나가 죽으면 전부 버린다",
    file: S("features/recommend-studies/api/read-evidence.ts"),
    from: "await Promise.allSettled([",
    to: "await Promise.all([",
    test: "src/features/recommend-studies/api/read-evidence.test.ts",
  },

  // ── INV-G3 · 모델의 답을 값으로 안 믿는다 ──────────────────────────────
  {
    label: "g3-accept-any-id",
    what: "INV-G3 — 후보 밖의 id 를 안 버린다",
    file: S("features/recommend-studies/model/parse.ts"),
    from: "if (!allowedSet.has(id) || seen.has(id)) continue;",
    to: "if (seen.has(id)) continue;",
    test: "src/features/recommend-studies/model/parse.test.ts",
  },
  {
    label: "g3-partial-parse",
    what: "INV-G3 — 모양이 달라도 문자열만 골라 쓴다",
    file: S("features/recommend-studies/model/parse.ts"),
    from: 'if (!ranked.every((id): id is string => typeof id === "string")) return null;',
    to: "",
    test: "src/features/recommend-studies/model/parse.test.ts",
  },
  {
    label: "g3-no-candidate-cap",
    what: "INV-G3 — 후보 상한을 안 건다",
    file: S("features/recommend-studies/model/prompt.ts"),
    from: "candidates.slice(0, CANDIDATE_MAX).map((post) => ({",
    to: "candidates.map((post) => ({",
    test: "src/features/recommend-studies/model/prompt.test.ts",
  },
  {
    label: "g3-candidate-max-value",
    what: "INV-G3 — 후보 상한 값을 늘린다",
    file: S("features/recommend-studies/model/limits.ts"),
    from: "export const CANDIDATE_MAX = 50;",
    to: "export const CANDIDATE_MAX = 5000;",
    test: "src/features/recommend-studies/model/limits.test.ts",
  },

  // ── INV-G4 · 비로그인은 모델에 못 닿는다 ───────────────────────────────
  {
    label: "g4-no-anon-gate",
    what: "INV-G4 — 비로그인도 모델에 닿는다",
    file: S("features/recommend-studies/model/pipeline.ts"),
    from: 'if (userId === null) return rule("anonymous", candidates);',
    to: 'if (userId === null) userId = "anonymous";',
    test: "src/features/recommend-studies/model/pipeline.test.ts",
  },

  // ── INV-G5 · 지연·실패가 홈을 안 막는다 ────────────────────────────────
  {
    label: "g5-no-timeout",
    what: "INV-G5 — 상한 없이 기다린다",
    file: S("features/recommend-studies/model/pipeline.ts"),
    from: "const raw = await withTimeout(\n      (signal) =>\n        deps.model.generate({",
    to: "const raw = await ((signal) =>\n        deps.model.generate({",
    also: {
      from: "      deps.timeoutMs ?? MODEL_TIMEOUT_MS,\n    );",
      to: "      )(new AbortController().signal);",
    },
    test: "src/features/recommend-studies/model/pipeline.test.ts",
  },
  {
    label: "g5-timeout-value",
    what: "INV-G5 — 추천 상한 값을 늘린다",
    file: S("features/recommend-studies/model/limits.ts"),
    from: "export const MODEL_TIMEOUT_MS = 8_000;",
    to: "export const MODEL_TIMEOUT_MS = 800_000;",
    test: "src/features/recommend-studies/model/limits.test.ts",
  },
  {
    label: "g5-draft-timeout-value",
    what: "INV-G5 — 초안 상한 값을 늘린다",
    file: S("features/create-post/model/draft-limits.ts"),
    from: "export const DRAFT_TIMEOUT_MS = 12_000;",
    to: "export const DRAFT_TIMEOUT_MS = 120_000;",
    test: "src/features/create-post/model/draft-limits.test.ts",
  },
  {
    label: "g5-leak-cause",
    what: "INV-G5 — 모델 오류 원문을 화면으로 보낸다",
    file: S("features/create-post/api/draft-post.ts"),
    from: '    return { ok: false, message: UNAVAILABLE };\n  }\n}',
    to: "    return { ok: false, message: String(cause) };\n  }\n}",
    test: "src/features/create-post/api/draft-post.test.ts",
  },

  // ── INV-G6 · 근거가 없으면 안 부르고 「추천」이라 안 한다 ───────────────
  {
    label: "g6-no-evidence-gate",
    what: "INV-G6 — 근거가 없어도 모델을 부른다",
    file: S("features/recommend-studies/model/pipeline.ts"),
    from: 'if (!hasEvidence(evidence)) return rule("no-evidence", candidates);',
    to: "",
    test: "src/features/recommend-studies/model/pipeline.test.ts",
  },
  {
    label: "g6-same-copy",
    what: "INV-G6 — 규칙 순서도 「추천」이라 부른다",
    file: S("features/recommend-studies/model/section-copy.ts"),
    from: '    sub: "좋아요가 많고 최근에 열린 순서입니다.",',
    to: '    sub: "관심 분야와 그동안 누른 좋아요·신청 기록을 보고 추천했습니다.",',
    test: "src/features/recommend-studies/model/section-copy.test.ts",
  },
  {
    label: "g6-hardcode-copy-in-ui",
    what: "INV-G6 — 화면이 문구 함수를 안 쓰고 모델 쪽으로 고정한다",
    file: S("widgets/post-grid/ui/RecommendedSection.tsx"),
    from: "const copy = sectionCopy(outcome.kind);",
    to: 'const copy = sectionCopy("model");',
    test: "src/widgets/post-grid/ui/RecommendedSection.test.tsx",
  },

  // ── INV-G7 · 재사용은 요청자별이고 창을 지킨다 ─────────────────────────
  {
    label: "g7-shared-key",
    what: "INV-G7 — 재사용이 사용자를 안 가른다",
    file: S("features/recommend-studies/model/reuse.ts"),
    from: "      const hit = entries.get(userId);",
    to: '      const hit = entries.get("everyone");',
    also: {
      from: "      entries.set(userId, { at: now(), ranking: [...ranking] });",
      to: '      entries.set("everyone", { at: now(), ranking: [...ranking] });',
    },
    test: "src/features/recommend-studies/model/reuse.test.ts",
  },
  {
    label: "g7-never-expires",
    what: "INV-G7 — 재사용이 만료되지 않는다",
    file: S("features/recommend-studies/model/reuse.ts"),
    from: "      if (now() - hit.at > ttlMs) {",
    to: "      if (false) {",
    test: "src/features/recommend-studies/model/reuse.test.ts",
  },
  {
    label: "g7-reuse-value",
    what: "INV-G7 — 재사용 시간 값을 늘린다",
    file: S("features/recommend-studies/model/limits.ts"),
    from: "export const RECOMMENDATION_REUSE_MS = 60_000;",
    to: "export const RECOMMENDATION_REUSE_MS = 600_000;",
    test: "src/features/recommend-studies/model/limits.test.ts",
  },
  {
    label: "g7-caches-rule",
    what: "INV-G7 — 규칙 결과도 모델 결과인 척 담는다",
    file: S("features/recommend-studies/model/pipeline.ts"),
    from: '): RecommendOutcome => ({ kind: "rule", reason, posts: ruleOrder(candidates) });',
    to: '): RecommendOutcome => ({ kind: "model", reason, posts: ruleOrder(candidates) });',
    test: "src/features/recommend-studies/model/pipeline.test.ts",
  },
  {
    label: "g7-no-store-on-failure",
    what: "INV-G7 — 모델이 실패하면 아무것도 안 담는다(창이 사라진다)",
    file: S("features/recommend-studies/model/pipeline.ts"),
    from: "deps.reuse.set(userId, ranking ?? []);",
    to: "if (ranking !== null) deps.reuse.set(userId, ranking);",
    test: "src/features/recommend-studies/model/pipeline.test.ts",
  },

  // ── INV-G8 · 초안의 근거는 본인이 쓴 것뿐 ──────────────────────────────
  {
    label: "g8-no-study-guard",
    what: "INV-G8 — 스터디를 안 골라도 요청을 낸다",
    file: S("features/create-post/ui/DraftAssistant.tsx"),
    from: 'disabled={studyId === "" || pending}',
    to: "disabled={pending}",
    test: "src/features/create-post/ui/DraftAssistant.test.tsx",
  },
  {
    label: "g8-trust-client-id",
    what: "INV-G8 — 화면이 보낸 값을 사용자 id 자리에 넣는다",
    file: S("features/create-post/api/draft-post.ts"),
    from: "hostedStudyForDraftQuery(db, studyId, user.id)",
    to: "hostedStudyForDraftQuery(db, studyId, studyId)",
    test: "src/features/create-post/api/draft-post.test.ts",
  },
  {
    label: "g8-model-before-host",
    what: "INV-G8 — 호스트 확인보다 모델을 먼저 부른다",
    file: S("features/create-post/api/draft-post.ts"),
    from: "  const db = await createServerSupabase();",
    to: '  await geminiModel.generate({ instruction: "", data: "{}" });\n  const db = await createServerSupabase();',
    test: "src/features/create-post/api/draft-post.test.ts",
  },

  // ── INV-G9 · 적용 전에는 폼 값이 아니다 ────────────────────────────────
  {
    label: "g9-truncate",
    what: "INV-G9 — 상한을 넘으면 조용히 자른다",
    file: S("features/create-post/model/draft.ts"),
    from: '  return trimmed.length > max ? "" : trimmed;',
    to: "  return trimmed.slice(0, max);",
    test: "src/features/create-post/model/draft.test.ts",
  },
  {
    label: "g9-loose-shape",
    what: "INV-G9 — 모양이 달라도 받아들인다",
    file: S("features/create-post/model/draft.ts"),
    from: '  if (typeof title !== "string" || typeof summary !== "string" || typeof content !== "string") {\n    return null;\n  }',
    to: '  if (typeof title !== "string" && typeof summary !== "string" && typeof content !== "string") {\n    return null;\n  }',
    test: "src/features/create-post/model/draft.test.ts",
  },
  {
    label: "g9-apply-overwrites",
    what: "INV-G9 — 비워진 칸이 사용자가 쓴 글을 덮는다",
    file: S("features/create-post/model/draft.ts"),
    from: '    title: draft.title === "" ? current.title : draft.title,',
    to: "    title: draft.title,",
    test: "src/features/create-post/model/draft.test.ts",
  },
  {
    label: "g9-auto-apply",
    what: "INV-G9 — 초안이 도착하면 바로 폼에 넣는다",
    file: S("features/create-post/ui/DraftAssistant.tsx"),
    from: "        setDraft(result.value);",
    to: "        setDraft(result.value);\n        onApply(result.value);",
    test: "src/features/create-post/ui/DraftAssistant.test.tsx",
  },
];

const results = [];
for (const m of MUTATIONS) {
  const original = readFileSync(m.file, "utf-8");
  // 파일이 CRLF 라 여러 줄짜리 변이가 안 맞았다. 심을 때만 LF 로 맞추고 되돌릴 때 원본을 쓴다.
  let mutated = original.split("\r\n").join("\n");
  if (!mutated.includes(m.from)) {
    results.push([m.label, "심지 못함", "찾는 글이 파일에 없다 — 변이 정의가 낡았다"]);
    continue;
  }
  mutated = mutated.replace(m.from, m.to);
  if (m.also) {
    if (!mutated.includes(m.also.from)) {
      results.push([m.label, "심지 못함", "두 번째 치환 대상이 없다"]);
      continue;
    }
    mutated = mutated.replace(m.also.from, m.also.to);
  }
  writeFileSync(m.file, mutated);
  const run = spawnSync("npx", ["vitest", "run", m.test], {
    cwd: APP,
    encoding: "utf-8",
    shell: true,
  });
  writeFileSync(m.file, original);
  const caught = run.status !== 0;
  results.push([m.label, caught ? "잡혔다" : "안 잡혔다 ← 아무도 안 붙들고 있다", m.what]);
}

console.log("\n=== 변이 결과 ===");
let caught = 0;
for (const [label, verdict, what] of results) {
  if (verdict === "잡혔다") caught += 1;
  const mark = verdict === "잡혔다" ? "o" : "X";
  console.log(`${mark} ${label.padEnd(24)} ${verdict.padEnd(30)} ${what}`);
}
console.log(`\n${caught}/${results.length} 잡혔다`);
process.exit(caught === results.length ? 0 : 1);
