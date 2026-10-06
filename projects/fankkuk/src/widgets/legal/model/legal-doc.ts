// 이용약관·개인정보처리방침이 같이 쓰는 글 모양. 화면(legal-page)은 이 모양만 알고 내용은 모른다.
// 레포에 정해지지 않은 값은 지어내지 않고 「(출시 전 기재)」(값만 비어 있음) · 「(결정 필요)」(정책 자체가 없음)로 둔다.

export const TO_FILL = "(출시 전 기재)";
export const TO_DECIDE = "(결정 필요)";

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
  facts: readonly (readonly [string, string])[];
  sections: readonly LegalSection[];
};

/** 글 안에 남은 빈칸 표시를 모은다(출시 전 점검용). 같은 문장은 한 번만. */
export function openItems(doc: LegalDoc): string[] {
  const texts: string[] = [];
  for (const [k, v] of doc.facts) texts.push(`${k}: ${v}`);
  for (const sec of doc.sections) {
    for (const b of sec.blocks) {
      if (b.kind === "text") texts.push(b.text);
      else if (b.kind === "rows") for (const r of b.rows) for (const [k, v] of r.fields) texts.push(`${r.title} — ${k}: ${v}`);
      else texts.push(...b.items);
    }
  }
  return [...new Set(texts.filter((t) => t.includes(TO_FILL) || t.includes(TO_DECIDE)))];
}
