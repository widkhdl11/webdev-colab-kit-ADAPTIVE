// 약관·개인정보처리방침·환불 규정·안내 페이지가 같이 쓰는 글 모양. 화면(legal-page)은 이 모양만 알고 내용은 모른다.
// 레포에 정해지지 않은 값은 지어내지 않고 「(출시 전 기재)」(값만 비어 있음) · 「[확인 필요]」(설계 문서에 없는 정책·법률 문구)로 둔다.
// 「[확인 필요: 무엇]」처럼 무엇을 확인할지 붙여 쓸 수 있다(toCheck). 출시 전 점검 목록은 openItems 가 모은다.

import { SITE_INFO_BLANK } from "@/shared/config/site-info";

/** 값만 비어 있음 — 사업자 정보 빈칸과 같은 글자(openItems 가 둘을 같이 모은다) */
export const TO_FILL = SITE_INFO_BLANK;
export const TO_DECIDE = "[확인 필요]";
export const toCheck = (what: string) => `[확인 필요: ${what}]`;

export type LegalRow = { title: string; fields: readonly (readonly [string, string])[] };

export type LegalBlock =
  | { kind: "text"; text: string }
  /** 점 목록 */
  | { kind: "list"; items: readonly string[] }
  /** 차례가 있는 목록(1. 2. 3.) */
  | { kind: "steps"; items: readonly string[] }
  /** 제목 + 이름·값 줄의 묶음. 표 대신 쓴다 — 휴대폰 폭에서 옆으로 밀리지 않고 위아래로 쌓인다. */
  | { kind: "rows"; rows: readonly LegalRow[] };

export type LegalSection = { id: string; title: string; blocks: readonly LegalBlock[] };

export type LegalDoc = {
  title: string;
  lead: string;
  /** 맨 위 세 줄 요약 — 본문을 다 읽지 않아도 알아야 할 것 */
  summary: readonly [string, string, string];
  facts: readonly (readonly [string, string])[];
  sections: readonly LegalSection[];
};

/** 글 안에 남은 빈칸 표시를 모은다(출시 전 점검용). 같은 문장은 한 번만. */
export function openItems(doc: LegalDoc): string[] {
  const texts: string[] = [...doc.summary];
  for (const [k, v] of doc.facts) texts.push(`${k}: ${v}`);
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.kind === "text") texts.push(b.text);
      else if (b.kind === "rows") for (const r of b.rows) for (const [k, v] of r.fields) texts.push(`${r.title} — ${k}: ${v}`);
      else texts.push(...b.items);
    }
  }
  return [...new Set(texts.filter((t) => t.includes(TO_FILL) || t.includes("[확인 필요")))];
}
