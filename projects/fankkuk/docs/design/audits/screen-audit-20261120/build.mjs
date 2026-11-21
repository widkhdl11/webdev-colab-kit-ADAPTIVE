// measure.json + findings-*.json → 점검목록.md (화면별 캡처 + 미통과 항목 + 사용자 메모 칸)
import fs from "node:fs";
const here = new URL(".", import.meta.url);
const read = (f) => JSON.parse(fs.readFileSync(new URL(f, here), "utf8"));
const measure = read("measure.json");
const groups = ["A", "B", "C", "D", "E1", "E2"];
const findings = groups.flatMap((g) => (fs.existsSync(new URL(`findings-${g}.json`, here)) ? read(`findings-${g}.json`) : []));
const keyOf = (r) => `${r.role} ${r.url}`;
const fmap = new Map(findings.map((f) => [keyOf(f), f]));

const ROLE = { anon: "로그인 전", fan: "팬", creator: "크리에이터", operator: "운영자" };
const KIND = { flow: "흐름·구조", shared: "여러 화면 공통", single: "한 화면 겉모양" };
// 다른 화면으로 넘어가 같은 화면이 된 주소 — 따로 판정하지 않는다
const dup = (r) => r.final !== r.url && !r.url.startsWith("/creator/customize");
const screens = measure.filter((r) => !dup(r));
const order = ["anon", "fan", "creator", "operator"];
screens.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

let n = 0; const ids = new Map();
for (const s of screens) ids.set(keyOf(s), `S${String(++n).padStart(2, "0")}`);

const all = [];
for (const s of screens) {
  const f = fmap.get(keyOf(s));
  (f?.items || []).forEach((it, i) => all.push({ ...it, sid: ids.get(keyOf(s)), iid: `${ids.get(keyOf(s))}-${i + 1}`, screen: s }));
}
const count = (k) => all.filter((x) => x.kind === k).length;
const esc = (t) => String(t ?? "").replace(/\|/g, "／").replace(/\n/g, " ");

let md = `# 팬꾹 전체 화면 디자인 점검 목록 (2026-11-20)

이번에는 아무것도 고치지 않았다. 화면을 캡처하고, design-prompt.md 「검토할 때」 1~35번으로 미통과 항목만 적었다.

- 캡처: 로컬 개발 서버(로컬 DB 시험 데이터)에서 역할마다 로그인 화면으로 로그인해 1440·390 폭 전체 페이지를 찍었다. 시험 계정 별빛(팬)·하루(크리에이터)·팬꾹 운영(운영자 대표).
- 기계 측정(가로 넘침·12 미만 글자·44 미만 누르는 칸·글꼴)은 일부러 작은 글자와 낮은 링크를 심어 잡히는 것을 확인했다.
- 판정은 서브에이전트 여섯이 같은 지시문(BRIEF.md)으로 나눠 했고, 「여러 화면 공통」은 아래 요약에서 원인별로 다시 묶었다. 캡처에서 확인한 사실만 적었고 추측은 「확신 낮음」으로 표시했다.
- 캡처의 한계: 전체 페이지 캡처라 화면 아래에 붙어 있는 줄(크리에이터 꾸미기·프로필의 「취소/저장」 줄)이 페이지 중간에 겹쳐 찍힌 장이 있다. 실제 화면 문제가 아니라서 항목에서 뺐다. 팬·크리에이터 1440 캡처는 사이드바가 열리는 중간에 찍혀 한 번 다시 찍었다(사이드바 폭 240 확인).
- 운영자 화면은 휴대폰 폭(1023 이하)에서 전부 「PC에서 써 주세요」 안내로 막힌다(승인 시안대로). 그래서 운영자 390 캡처는 모두 같은 안내 화면이다.
- 항목 번호: 화면은 S01…, 항목은 S01-1… — 메모에 이 번호로 적으면 된다.

**세 종류**: 흐름·구조 ${count("flow")}건 · 여러 화면 공통 ${count("shared")}건 · 한 화면 겉모양 ${count("single")}건 (화면 ${screens.length}개)

## 찍지 못한 화면

- 데이터가 없어 들어갈 주소가 없던 화면: 역조공 상세(/me/revgifts/[주문번호]), 선물함 상세(/gift-boxes/[상자]), 크리에이터 역조공 상자 상세·송장 라벨(/creator/revgift-boxes/[상자], …/labels). 로컬 시험 데이터에 역조공·선물함 기록을 넣어야 찍을 수 있다.
- 다른 화면으로 넘어가 같은 화면이 된 주소(따로 판정 안 함): ${measure.filter(dup).map((r) => `${ROLE[r.role]} ${r.url} → ${r.final}`).join(" · ")}

## 여러 화면 공통 — 원인별

한 곳을 고치면 여러 화면이 같이 고쳐지는 묶음이다.

| 공통 원인 | 건수 | 화면 | 내용(대표) |
|---|---|---|---|
`;
const byKey = new Map();
for (const x of all.filter((x) => x.kind === "shared")) { const k = x.shared_key || "(이름 없음)"; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(x); }
for (const [k, xs] of [...byKey].sort((a, b) => b[1].length - a[1].length)) {
  md += `| ${esc(k)} | ${xs.length} | ${[...new Set(xs.map((x) => x.sid))].join(" ")} | ${esc(xs[0].what)} (${xs[0].no}번) |\n`;
}
md += `\n## 흐름·구조가 바뀌는 것 — 모아 보기\n\n고치면 할 일·입력·순서·구역 구성이 바뀌므로 바로 고치지 않고 제안으로 둔 것이다.\n\n`;
for (const x of all.filter((x) => x.kind === "flow")) md += `- **${x.iid}** ${ROLE[x.screen.role]} \`${x.screen.url}\` — ${esc(x.where)}: ${esc(x.what)} → ${esc(x.fix)}\n`;

md += `\n---\n\n# 화면별\n`;
let curRole = "";
for (const s of screens) {
  if (s.role !== curRole) { curRole = s.role; md += `\n## ${ROLE[s.role]}\n`; }
  const sid = ids.get(keyOf(s)); const f = fmap.get(keyOf(s));
  const m1 = s.m?.[1440] || {}; const m3 = s.m?.[390] || {};
  md += `\n### ${sid} \`${s.url}\`${s.final !== s.url ? ` (→ \`${s.final}\`)` : ""}\n\n`;
  if (f?.summary) md += `${f.summary}\n\n`;
  md += `<table><tr><td valign="top"><a href="shots/${s.shots?.[1440]}"><img src="shots/${s.shots?.[1440]}" width="560"></a><br>1440</td><td valign="top"><a href="shots/${s.shots?.[390]}"><img src="shots/${s.shots?.[390]}" width="200"></a><br>390</td></tr></table>\n\n`;
  md += `측정: 가로 넘침 ${m1.overflow ?? "-"} / ${m3.overflow ?? "-"} · 12 미만 글자 ${m1.smallN ?? "-"} / ${m3.smallN ?? "-"} · 44 미만 누르는 칸 ${m1.tapsN ?? "-"} / ${m3.tapsN ?? "-"} (1440 / 390)\n\n`;
  const items = all.filter((x) => x.sid === sid);
  if (!f) md += `_판정 결과 없음_\n\n`;
  else if (!items.length) md += `미통과 없음\n\n`;
  else {
    for (const k of ["flow", "shared", "single"]) {
      const xs = items.filter((x) => x.kind === k); if (!xs.length) continue;
      md += `**${KIND[k]}**\n\n| 번호 | 기준 | 폭 | 어디 | 무엇 | 고칠 방향 |\n|---|---|---|---|---|---|\n`;
      for (const x of xs) md += `| ${x.iid} | ${x.no} | ${esc(x.width)} | ${esc(x.where)} | ${esc(x.what)}${x.confidence === "낮음" ? " (확신 낮음)" : ""}${x.shared_key ? ` [${esc(x.shared_key)}]` : ""} | ${esc(x.fix)} |\n`;
      md += `\n`;
    }
  }
  md += `**내 메모** (더할 것·뺄 번호·종류 바꿀 번호)\n\n- 더할 것: \n- 뺄 것: \n- 종류 바꿀 것: \n`;
}
fs.writeFileSync(new URL("점검목록.md", here), md);
console.log("화면", screens.length, "항목", all.length, "flow", count("flow"), "shared", count("shared"), "single", count("single"), "판정 없는 화면", screens.filter((s) => !fmap.get(keyOf(s))).map((s) => s.url).join(" "));
