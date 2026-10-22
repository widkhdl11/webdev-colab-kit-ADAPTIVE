import type { LegalBlock, LegalDoc, LegalSection } from "./legal-doc";

// 문서형 페이지(약관 셋 · 안내 글 · 자주 묻는 질문)의 찾기 도구가 같이 쓰는 계산 — docs/ux/document-pages.md 원칙 ①~⑥.
// 화면(doc-page·faq-page)은 결과만 그린다. 글 내용은 읽기만 하고 바꾸지 않는다.

/** 검색·분류·목차가 보는 한 칸 — 약관·안내 글의 조 하나, 자주 묻는 질문의 질문 하나 */
export type NavItem = { id: string; title: string; text: string; tags: readonly string[]; frequent: boolean };

/** 목차 묶음 — 약관처럼 묶음이 있는 글만 제목이 있다 */
export type TocGroup = { title: string | null; items: readonly { id: string; label: string }[] };

/** 글 모양 하나에 든 글자 전부(검색이 읽는 것) — 표·정의·요금·단계 칩까지 */
export function blockTexts(block: LegalBlock): string[] {
  switch (block.kind) {
    case "text":
      return [block.text];
    case "list":
    case "steps":
      return [...block.items];
    case "rows":
      return block.rows.flatMap((r) => [r.title, ...r.fields.flatMap(([k, v]) => [k, v])]);
    case "defs":
      return block.items.flatMap(([k, v]) => [k, v]);
    case "prices":
      return [...block.columns, ...block.rows.flatMap((r) => [r.name, r.rule, ...r.amounts])];
    case "stages":
      return [block.title, ...block.items, block.note];
  }
}

export function sectionItems(sections: readonly LegalSection[]): NavItem[] {
  return sections.map((sec) => ({
    id: sec.id,
    title: sec.title,
    text: [sec.title, ...sec.blocks.flatMap(blockTexts)].join("\n"),
    tags: sec.tags ?? [],
    frequent: sec.frequent === true,
  }));
}

const fold = (s: string) => s.toLocaleLowerCase("ko-KR");

/** 검색칸 글자 → 찾을 낱말(띄어쓰기로 나눔, 같은 낱말은 한 번) */
export function queryWords(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter((w) => w.length > 0))];
}

/** 낱말이 모두 들어 있는 칸의 id — 본문 차례대로. 낱말이 없으면 빈 목록 */
export function findIds(items: readonly NavItem[], words: readonly string[]): string[] {
  if (words.length === 0) return [];
  return items.filter((i) => words.every((w) => fold(i.text).includes(w))).map((i) => i.id);
}

export type MarkPart = { text: string; hit: boolean };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 글자를 찾은 낱말 자리와 나머지로 나눈다(<mark> 를 씌울 자리). 긴 낱말을 먼저 맞춘다 */
export function markParts(text: string, words: readonly string[]): MarkPart[] {
  if (words.length === 0 || text.length === 0) return [{ text, hit: false }];
  const re = new RegExp([...words].sort((a, b) => b.length - a.length).map(escapeRe).join("|"), "giu");
  const parts: MarkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), hit: false });
    parts.push({ text: m[0], hit: true });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts.length > 0 ? parts : [{ text, hit: false }];
}

/** 분류 칩 차례 — tagOrder 가 있으면 그 차례(조에 없는 이름은 빼고, tagOrder 에 없는 이름은 뒤에 등장 순), 없으면 등장 순 */
export function chipTags(items: readonly Pick<NavItem, "tags">[], tagOrder?: readonly string[]): string[] {
  const seen = [...new Set(items.flatMap((i) => i.tags))];
  if (!tagOrder) return seen;
  return [...new Set([...tagOrder.filter((t) => seen.includes(t)), ...seen.filter((t) => !tagOrder.includes(t))])];
}

/** 요약 줄마다 갈 조 id. 길이가 요약과 다르면 줄을 엇갈려 잇지 않게 전부 링크 없이(null), 없는 id 도 그 줄만 null */
export function summaryTargets(
  summary: readonly string[],
  links: readonly string[] | undefined,
  ids: readonly string[],
): (string | null)[] {
  if (!links || links.length !== summary.length) return summary.map(() => null);
  return links.map((id) => (ids.includes(id) ? id : null));
}

/** 목차 묶음 — 묶음에 없는 id 는 빼고, 어느 묶음에도 없는 조는 맨 뒤 이름 없는 묶음으로(목차에서 조가 조용히 빠지지 않게) */
export function tocGroupsOf(doc: Pick<LegalDoc, "sections" | "tocGroups">): TocGroup[] {
  const label = new Map(doc.sections.map((sec) => [sec.id, sec.title]));
  const grouped = new Set(doc.tocGroups?.flatMap((g) => g.ids) ?? []);
  const rest = doc.sections.filter((sec) => !grouped.has(sec.id)).map((sec) => ({ id: sec.id, label: sec.title }));
  return [
    ...(doc.tocGroups ?? []).map((g) => ({
      title: g.title,
      items: g.ids.flatMap((id) => {
        const name = label.get(id);
        return name ? [{ id, label: name }] : [];
      }),
    })),
    ...(rest.length > 0 ? [{ title: null, items: rest }] : []),
  ];
}

/** 「2026-10-23」 → 「2026.10.23」. 날짜 형식이 아니면 받은 글자 그대로 */
export function formatUpdated(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : value;
}
