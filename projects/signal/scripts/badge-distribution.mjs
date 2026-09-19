// 뱃지 줄에 실제로 무엇이 몇 개 오르는지 **세기만** 한다 (읽기 전용).
//
// 왜 필요한가: `badges.ts` 의 세 상수(`BADGE_WINDOW_DAYS`·`BADGE_MIN_COUNT`·`BADGE_LIMIT`)가
// 전부 잠정값이고, 그 값을 정하는 근거는 "창 안에 뱃지가 몇 개 남느냐"다. 화면을 열어
// 세는 것으로는 문턱을 2 에서 3 으로 올렸을 때 무엇이 사라지는지 못 본다 — 사라진 것은
// 화면에 없기 때문이다. 여기서는 문턱을 여러 개 동시에 놓고 비교한다.
//
// 출력 규칙(check-env.mjs·ingest-status.mjs 와 같다): 키·값은 어디에도 찍지 않는다.
// 읽기 전용 publishable 키를 쓴다 — 세는 데 secret 키가 필요할 이유가 없다.
//
// 실행: npm run badges            (기본 창 = BADGE_WINDOW_DAYS)
//       npm run badges -- --days 7

import { readFileSync } from "node:fs";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다.");
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// **상수를 베끼지 않고 `badges.ts` 에서 읽는다.**
//
// 2026-08-30 에 `BADGE_LIMIT` 를 24 → 60 으로 올렸는데 여기 베껴 둔 24 는 안 따라와서,
// 이 리포트가 "29개 / 24개"(= 상한에 잘린다)로 찍고 있었다. 화면은 29개를 다 그린다.
// 문턱을 다시 조정할 때 쓰는 유일한 계측이라 그 숫자가 결정에 그대로 들어간다
// (2026-08-31 리뷰 지적 — 이 파일이 자기 주석으로 경고해 둔 상태 그대로였다).
//
// `normalizeTagName` 을 여기 다시 구현하지 않고 DB 의 `normalized_name` 을 읽는 것과 같은 이유다.
const BADGES_TS = new URL("../src/entities/article/lib/badges.ts", import.meta.url);
function constFrom(source, name) {
  const m = source.match(new RegExp(`export const ${name} = (\\d+);`));
  if (m === null) {
    console.error(
      `badges.ts 에서 ${name} 을 못 찾았다. 이름이나 형태가 바뀌었으면 이 스크립트도 고쳐야 한다 —\n` +
        `베껴 쓴 값으로 조용히 넘어가면 이 리포트가 화면과 다른 것을 센다.`,
    );
    process.exit(1);
  }
  return Number(m[1]);
}
const badgesSource = readFileSync(BADGES_TS, "utf8");
const DEFAULT_WINDOW_DAYS = constFrom(badgesSource, "BADGE_WINDOW_DAYS");
const BADGE_LIMIT = constFrom(badgesSource, "BADGE_LIMIT");
const BADGE_MIN_COUNT = constFrom(badgesSource, "BADGE_MIN_COUNT");

// 지금 문턱을 가운데 두고 위아래를 같이 본다 — 올릴지 내릴지가 이 표에서 갈린다.
const THRESHOLDS = [...new Set([BADGE_MIN_COUNT - 1, BADGE_MIN_COUNT, BADGE_MIN_COUNT + 1, BADGE_MIN_COUNT + 2])]
  .filter((n) => n >= 1)
  .sort((a, b) => a - b);

const argv = process.argv.slice(2);
const at = argv.indexOf("--days");
const windowDays = at >= 0 ? Number(argv[at + 1]) : DEFAULT_WINDOW_DAYS;
if (!Number.isInteger(windowDays) || windowDays < 1) {
  console.error(`--days 는 1 이상의 정수여야 한다: ${argv[at + 1]}`);
  process.exit(1);
}

// KST 고정 — `shared/lib/datetime.ts` 의 dayKey 와 같은 기준이어야 한다.
// 다른 기준으로 세면 경계 근처 글이 리포트와 화면에서 다른 날에 들어간다.
const SEOUL_OFFSET_MINUTES = 9 * 60;
const dayKey = (iso) => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t + SEOUL_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
};

// 접는 기준은 **DB 의 `normalized_name` 을 그대로 읽는다**. `normalizeTagName` 을 여기에
// 다시 구현하면(NFC·하이픈·연속공백) 한 조각만 어긋나도 리포트가 화면과 다른 것을 센다 —
// 그러면 이 리포트로 정한 문턱이 화면에서 다른 결과를 낸다.
const now = Date.now();
const windowKeys = new Set();
for (let back = 0; back < windowDays; back += 1) {
  windowKeys.add(dayKey(new Date(now - back * 86_400_000).toISOString()));
}

/** 남의 서버가 준 글자를 터미널에 그대로 찍지 않는다 (keywords.ts 와 같은 규칙). */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const plain = (s) => String(s).replace(CONTROL_CHARS, " ");

/**
 * PostgREST 는 한 번에 1000행까지 준다 — Range 로 넘겨 받는다.
 *
 * **`order` 를 반드시 붙여 부른다.** ORDER BY 없는 조회는 행 순서가 보장되지 않아서,
 * 1000행을 넘는 순간 페이지 사이에서 행이 빠지거나 겹칠 수 있다(item 은 이미 1,300건대다).
 * 그러면 창 안 글 수가 조용히 어긋나고, 그 숫자가 문턱을 정하는 근거로 쓰인다.
 */
async function fetchAll(path) {
  if (!path.includes("order=")) throw new Error(`order= 없이 부르면 안 된다: ${path}`);
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { ...headers, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) {
      throw new Error(`${path} → HTTP ${res.status} ${plain(await res.text())}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

const items = await fetchAll("item?select=id,published_at&order=id");
const links = await fetchAll("item_tag?select=item_id,tag_id&order=item_id,tag_id");
const tags = await fetchAll("tag?select=id,name,axis,normalized_name&order=id");

const tagById = new Map(tags.map((t) => [t.id, t]));
const inWindow = new Set(
  items.filter((i) => windowKeys.has(dayKey(i.published_at))).map((i) => i.id),
);

// 창 안에서 뱃지별 건수. 한 글이 같은 뱃지를 두 번 올리지 않는다(화면과 같은 규칙).
const counts = new Map(); // normalized -> { name, axis, total }
const perItem = new Map(); // itemId -> Set(normalized)
for (const link of links) {
  if (!inWindow.has(link.item_id)) continue;
  const tag = tagById.get(link.tag_id);
  if (!tag) continue;
  const k = tag.normalized_name;
  if (!k) continue;
  const seen = perItem.get(link.item_id) ?? new Set();
  if (seen.has(k)) continue;
  seen.add(k);
  perItem.set(link.item_id, seen);
  const cur = counts.get(k);
  if (cur) cur.total += 1;
  else counts.set(k, { name: tag.name, axis: tag.axis, total: 1 });
}

const all = [...counts.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
const dates = [...windowKeys].sort();

console.log(`창 ${windowDays}일 (${dates[0]} ~ ${dates[dates.length - 1]}, KST)`);
console.log(`  창 안 글 ${inWindow.size}건 / 전체 ${items.length}건`);
console.log(`  그중 키워드가 붙은 글 ${perItem.size}건`);
console.log(`  서로 다른 키워드 ${all.length}종 (전체 태그 ${tags.length}종 · 연결 ${links.length}건)`);

console.log(`\n문턱별로 뱃지 줄에 남는 수 (상한 ${BADGE_LIMIT} 적용 전 / 후)`);
for (const min of THRESHOLDS) {
  const kept = all.filter((b) => b.total >= min);
  const field = kept.filter((b) => b.axis === "field").length;
  const kind = kept.filter((b) => b.axis === "kind").length;
  const mark = min === BADGE_MIN_COUNT ? " ← 지금" : "";
  console.log(
    `  ${min}건 이상 → ${String(kept.length).padStart(3)}개 / ${Math.min(kept.length, BADGE_LIMIT)}개` +
      `   (분야 ${field} · 사건종류 ${kind})${mark}`,
  );
}

// 꼬리가 얼마나 두꺼운지 — 문턱을 올리는 근거는 여기 있다.
console.log("\n건수별 분포");
const histogram = new Map();
for (const b of all) histogram.set(b.total, (histogram.get(b.total) ?? 0) + 1);
for (const n of [...histogram.keys()].sort((a, b) => a - b)) {
  console.log(`  ${String(n).padStart(3)}건짜리  ${histogram.get(n)}종`);
}

// 실제로 무엇이 오르는지. 이름을 봐야 "2건짜리를 버려도 되나"를 판단할 수 있다.
console.log(`\n상위 ${Math.min(40, all.length)}개 (건수 · 축 · 표기)`);
for (const b of all.slice(0, 40)) {
  // 이름은 모델이 만든 값이다 — 제어문자가 섞이면 이미 찍은 줄을 덮어쓸 수 있다.
  console.log(
    `  ${String(b.total).padStart(3)}  ${b.axis === "field" ? "분야  " : "사건종류"}  ${plain(b.name)}`,
  );
}
