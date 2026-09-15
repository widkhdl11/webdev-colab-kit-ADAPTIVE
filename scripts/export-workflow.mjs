#!/usr/bin/env node
//
// export-workflow.mjs — 그래프 선언을 대시보드가 읽는 1층 파일로 내보낸다.
//
//   node scripts/export-workflow.mjs [프로젝트 slug]
//
// slug 를 안 주면 루트 ACTIVE 를 읽는다. 산출물은 projects/<slug>/report/workflow.json.
// 워크플로우 선언(graph.mjs)이 바뀔 때만 다시 돌리면 된다 — 낡으면 check-report 가 잡는다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GRAPH } from "../graph.mjs";
import { deriveWorkflow } from "./lib/report-model.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 노드↔스킬 지도는 여기 코드에 두지 않는다(docs-contract 8절). 이 파일이 유일한 출처다.
const BINDINGS = join(ROOT, "docs", "references", "node-skills.json");

// 서브에이전트 목록의 출처도 코드가 아니라 실제 정의 파일이다. 목록을 여기 박으면
// 에이전트를 더한 사람이 이 파일을 안 고쳐서 화면에서만 조용히 빠진다.
const AGENTS_DIR = join(ROOT, ".claude", "agents");
function readAgents() {
  let files;
  try { files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md")); } catch { return []; }
  return files.map((f) => {
    const name = f.replace(/\.md$/, "");
    let description = "";
    try {
      const m = readFileSync(join(AGENTS_DIR, f), "utf-8").match(/^description:\s*(.+)$/m);
      if (m) description = m[1].trim();
    } catch { /* 설명이 없어도 목록에는 올린다 */ }
    return { name, description };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function activeSlug() {
  try {
    return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim();
  } catch {
    return "";
  }
}

const slug = (process.argv[2] ?? activeSlug()).trim();
if (!slug) {
  console.error("프로젝트 slug 를 못 정했다. 인자로 주거나 루트 ACTIVE 를 채운다.");
  process.exit(2);
}

const outDir = join(ROOT, "projects", slug, "report");
mkdirSync(outDir, { recursive: true });
let bindings;
try {
  bindings = JSON.parse(readFileSync(BINDINGS, "utf-8")).bindings ?? [];
} catch (e) {
  console.error(`노드↔스킬 바인딩을 못 읽었다: ${BINDINGS}\n${e.message}`);
  process.exit(2);
}
const workflow = { ...deriveWorkflow(GRAPH, bindings), agents: readAgents() };
writeFileSync(join(outDir, "workflow.json"), `${JSON.stringify(workflow, null, 2)}\n`, "utf-8");
console.log(`workflow.json — 노드 ${workflow.nodes.length}개 · 엣지 ${workflow.edges.length}개 · 스킬 ${workflow.skills.length}개 · 에이전트 ${workflow.agents.length}개 → projects/${slug}/report/`);
