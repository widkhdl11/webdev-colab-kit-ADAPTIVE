// compare/<원인키>/result.json → 변경비교.md
// node build-compare.mjs part1  : 1부(공통 원인)로 새로 쓴다 — 이미 파일이 있으면 멈춘다(사용자가 적은 결정을 지우지 않게)
// node build-compare.mjs part2  : 2부(흐름·구조 제안, compare-flow/<번호>/result.json)를 파일 끝에 덧붙인다
import fs from "node:fs";
const here = new URL(".", import.meta.url);
const mode = process.argv[2];
const OUT = new URL("변경비교.md", here);
const readJson = (u) => JSON.parse(fs.readFileSync(u, "utf8"));

const decision = `**결정**: 승인 / 고쳐서 승인 / 안 함 → \n\n**메모**: \n`;
const shotTable = (dir, shots) => {
  let t = `| 화면 · 폭 | 지금 | 시안 |\n|---|---|---|\n`;
  for (const s of shots) {
    const img = (f) => (f ? `<a href="${dir}/${f}"><img src="${dir}/${f}" width="${s.width >= 1000 ? 520 : 260}"></a>` : "—");
    t += `| ${s.screen} · ${s.width} | ${img(s.before)} | ${img(s.after)} |\n`;
  }
  return t;
};

if (mode === "part1") {
  if (fs.existsSync(OUT)) throw new Error("변경비교.md 가 이미 있다 — 1부를 다시 쓰지 않는다");
  const ORDER = ["creator-card-recommend", "gray-sub-card", "empty-state", "section-save-bar", "creator-card", "creator-profile-head", "home-intro-banner", "policy-doc-toolbar", "policy-summary-panel", "doc-search-width", "auth-footer-link"];
  const NAME = Object.fromEntries(fs.readFileSync(new URL("작업범위.md", here), "utf8").split("\n").filter((l) => l.startsWith("| **")).map((l) => [l.match(/`([a-z0-9-]+)`/)?.[1], l.match(/\*\*(.+?)\*\*/)[1]]));
  let md = `# 팬꾹 화면 점검 — 변경 비교 (2026-11-21)

\`작업범위.md\`에서 「권고대로(시안 보고 확정)」로 정한 20줄의 지금 화면과 시안을 나란히 둔 문서다. **main 의 코드는 아직 고치지 않았다.** 시안은 별도 작업 폴더의 브랜치(원인마다 하나)에 실제로 적용해 찍었다.

줄마다 **결정** 칸에 「승인 / 고쳐서 승인 / 안 함」 중 하나를 적고, 고칠 점은 **메모** 칸에 적는다. 「승인」 줄만 구현하고, 「고쳐서 승인」 줄은 메모를 반영한 시안을 다시 보여 준다. 그림을 누르면 원본 크기로 열린다.

- 1부: 여러 화면 공통 ${ORDER.length}가지
- 2부: 흐름·구조 제안 9건 (1부 보고 뒤에 덧붙인다)

---

# 1부. 여러 화면 공통
`;
  ORDER.forEach((k, i) => {
    const u = new URL(`compare/${k}/result.json`, here);
    md += `\n## 1-${i + 1}. ${NAME[k] || k}\n\n`;
    if (!fs.existsSync(u)) { md += `_시안 없음 — 결과 파일이 없다_\n\n${decision}\n---\n`; return; }
    const r = readJson(u);
    md += `**무엇을**: ${r.what}\n\n**왜**: ${r.why}\n\n**어떻게**\n\n${r.how.map((h) => `- ${h}`).join("\n")}\n\n코드: ${r.how_code}\n\n`;
    if (r.also?.length) md += `**같이 바뀌는 곳**\n\n${r.also.map((h) => `- ${h}`).join("\n")}\n\n`;
    if (r.pg) md += `**심사 화면에서 달라지는 점**: ${r.pg}\n\n`;
    md += `**비교**\n\n${shotTable(`compare/${k}`, r.shots || [])}\n`;
    md += `확인: ${r.self_check || "—"} · 시험: ${r.tests || "—"} · 브랜치 \`${r.branch}\` (${String(r.commit || "").slice(0, 8)})\n\n${decision}\n---\n`;
  });
  fs.writeFileSync(OUT, md);
  console.log("1부 작성", ORDER.length);
} else if (mode === "part2") {
  const base = fs.readFileSync(OUT, "utf8");
  if (base.includes("# 2부.")) throw new Error("2부가 이미 있다");
  const dirs = fs.readdirSync(new URL("compare-flow/", here)).sort();
  let md = `\n# 2부. 흐름·구조 제안\n\n시안 절차(정적 시안)로 만들었다. 바꾸는 방법이 둘 이상이면 A안·B안을 나란히 둔다.\n`;
  dirs.forEach((d, i) => {
    const r = readJson(new URL(`compare-flow/${d}/result.json`, here));
    md += `\n## 2-${i + 1}. ${r.title} (${r.id})\n\n**무엇을**: ${r.what}\n\n**왜**: ${r.why}\n\n**어떻게**\n\n${r.how.map((h) => `- ${h}`).join("\n")}\n\n`;
    if (r.how_code) md += `코드: ${r.how_code}\n\n`;
    if (r.also?.length) md += `**같이 바뀌는 곳**\n\n${r.also.map((h) => `- ${h}`).join("\n")}\n\n`;
    if (r.pg) md += `**심사 화면에서 달라지는 점**: ${r.pg}\n\n`;
    md += `**비교**\n\n${shotTable(`compare-flow/${d}`, r.shots || [])}\n확인: ${r.self_check || "—"}\n\n${decision}\n---\n`;
  });
  fs.writeFileSync(OUT, base.trimEnd() + "\n" + md);
  console.log("2부 덧붙임", dirs.length);
} else throw new Error("part1 또는 part2");
