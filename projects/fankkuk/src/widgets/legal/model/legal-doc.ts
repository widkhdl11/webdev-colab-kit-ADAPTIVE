// 약관·개인정보처리방침·환불 규정·안내 페이지가 같이 쓰는 글 모양. 화면(legal-page)은 이 모양만 알고 내용은 모른다.
// 레포에 정해지지 않은 값은 지어내지 않고 「(출시 전 기재)」(값만 비어 있음) · 「[확인 필요]」(설계 문서에 없는 정책·법률 문구)로 둔다.
// 「[확인 필요: 무엇]」처럼 무엇을 확인할지 붙여 쓸 수 있다(toCheck). 출시 전 점검 목록은 openItems 가 모은다.

import { SITE_INFO_BLANK } from "@/shared/config/site-info";

/** 값만 비어 있음 — 사업자 정보 빈칸과 같은 글자(openItems 가 둘을 같이 모은다) */
export const TO_FILL = SITE_INFO_BLANK;
export const TO_DECIDE = "[확인 필요]";
export const toCheck = (what: string) => `[확인 필요: ${what}]`;

/** 환불 금액 칸의 색 꼬리표 — 전액(초록)·없음(빨강). 일부만 돌려받는 칸은 붙이지 않는다(design-rules 14절) */
export type RefundTone = "full" | "none";
export type LegalRow = { title: string; fields: readonly (readonly [string, string, RefundTone?])[] };

export type LegalBlock =
  | { kind: "text"; text: string }
  /** 점 목록 */
  | { kind: "list"; items: readonly string[] }
  /** 차례가 있는 목록(1. 2. 3.) */
  | { kind: "steps"; items: readonly string[] }
  /** 제목 + 이름·값 줄의 묶음. 표 대신 쓴다 — 휴대폰 폭에서 옆으로 밀리지 않고 위아래로 쌓인다. */
  | { kind: "rows"; rows: readonly LegalRow[] }
  /** 낱말 정의 — [낱말, 뜻]. 뜻은 「~을 말합니다」로 끝나는 문장 */
  | { kind: "defs"; items: readonly (readonly [string, string])[] }
  /** 상자 구간별 요금 — 구간 이름·기준 한 칸 + 금액 칸(columns 순서) */
  | { kind: "prices"; columns: readonly string[]; rows: readonly LegalPriceRow[] }
  /** 단계 칩 한 줄 — 이름표 + 단계 이름(차례대로) + 아래 덧붙임 한 줄 */
  | { kind: "stages"; title: string; items: readonly string[]; note: string };

export type LegalPriceRow = { name: string; rule: string; amounts: readonly string[] };

export type LegalSection = { id: string; title: string; blocks: readonly LegalBlock[] };

/** 목차 묶음 — 조가 많은 글만. ids 는 sections 의 id */
export type LegalTocGroup = { title: string; ids: readonly string[] };

export type LegalDoc = {
  title: string;
  lead: string;
  /** 맨 위 세 줄 요약 — 본문을 다 읽지 않아도 알아야 할 것 */
  summary: readonly [string, string, string];
  facts: readonly (readonly [string, string])[];
  sections: readonly LegalSection[];
  tocGroups?: readonly LegalTocGroup[];
};

/** 글 안에 남은 빈칸 표시를 모은다(출시 전 점검용). 같은 문장은 한 번만. */
export function openItems(doc: LegalDoc): string[] {
  const texts: string[] = [...doc.summary];
  for (const [k, v] of doc.facts) texts.push(`${k}: ${v}`);
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.kind === "text") texts.push(b.text);
      else if (b.kind === "rows") for (const r of b.rows) for (const [k, v] of r.fields) texts.push(`${r.title} — ${k}: ${v}`);
      else if (b.kind === "defs") for (const [k, v] of b.items) texts.push(`${k}: ${v}`);
      else if (b.kind === "prices") for (const r of b.rows) texts.push(`${r.name} — ${r.rule}: ${r.amounts.join(" · ")}`);
      else if (b.kind === "stages") texts.push(b.title, ...b.items, b.note);
      else texts.push(...b.items);
    }
  }
  return [...new Set(texts.filter((t) => t.includes(TO_FILL) || t.includes("[확인 필요")))];
}
