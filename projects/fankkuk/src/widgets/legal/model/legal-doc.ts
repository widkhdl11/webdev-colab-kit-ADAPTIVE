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
export type LegalRow = {
  title: string;
  fields: readonly (readonly [string, string, RefundTone?])[];
  /** 분류 칩 이름 — 칩을 고르면 이 줄만 남긴다(취소·환불 규정 2절의 시점). 없으면 칩과 상관없이 늘 보인다 */
  tags?: readonly string[];
};

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
  | { kind: "stages"; title: string; items: readonly string[]; note: string }
  // ── 아래는 문서형 대표 시안(guide-fan-r2 · faq-20261112, 2026-11-12 사용자 고름)의 모양. 글은 그대로, 모양만 고른다 ──
  /** 이어지는 세로 단계 — 번호 원 + 직선(차례가 있는 긴 절차) */
  | { kind: "timeline"; items: readonly string[] }
  /** 상자 크기 카드 셋 — 이름 · 기준 · 요금. pic 이 있으면 카드 위 그림 칸 */
  | { kind: "tiers"; items: readonly LegalTier[] }
  /** 보낼 수 없는 것 — × 표시 줄(글자와 같이) */
  | { kind: "banned"; items: readonly string[] }
  /** 한도 한 칸 — 회색 면 + 자 그림 */
  | { kind: "limit"; text: string }
  /** 주의 판 — 결과를 알리는 한 문단(노란 면 + 경고 그림) */
  | { kind: "warn"; text: string }
  /** 가로 단계 — [이름, 뜻] 차례대로. 칸이 좁으면 세로 */
  | { kind: "progress"; items: readonly (readonly [string, string])[] }
  /** 규칙 줄 목록 — 조용한 번호(01·02…) + 줄 사이 선. alert 와 같은 줄은 빨간 꼬리표 */
  | { kind: "rules"; items: readonly string[]; alert?: string }
  /** 약속 한 줄 판 — 그림 + 큰 글자 한 문장 */
  | { kind: "promise"; text: string; pic: string }
  /** 두 칸 흐름 — 1 → 2 */
  | { kind: "pair"; items: readonly [string, string] }
  /** 송장 그림 — 상자마다 보내는 분 · 받는 사람 주소 + 끝 6자리 칸. 바로 아래 문장을 그림으로 다시 보여 주는 장식이라 낭독기·검색은 읽지 않는다.
   *  note 는 「화면 예시」 표시(5-5), sender·receiver 는 [칸 이름, 칸 값] */
  | {
      kind: "slips";
      note: string;
      sender: readonly [string, string];
      receiver: readonly [string, string];
      boxes: readonly { title: string; code: string }[];
    }
  /** 경우 | 결과 줄 — 결과에 tone 이 있으면 꼬리표(전액 초록 · 없음 빨강) */
  | { kind: "cases"; items: readonly (readonly [string, string, RefundTone?])[] };

export type LegalTier = { name: string; rule: string; price: string; pic?: string };

export type LegalPriceRow = { name: string; rule: string; amounts: readonly string[] };

export type LegalSection = {
  id: string;
  title: string;
  blocks: readonly LegalBlock[];
  /** 분류 칩 이름(문서형 원칙 ②) — 없으면 칩을 고를 때 이 조는 접힌다. 문서에 tags 가 하나도 없으면 칩 줄을 그리지 않는다 */
  tags?: readonly string[];
  /** 「주요」 배지(원칙 ③) — 조 제목 옆과 목차 줄 */
  frequent?: true;
  /** 끝 판 모양(하늘 면, design-rules 28절) — 글 맨 끝 「더 궁금하면」 같은 조. 목록 대신 문단으로 그린다 */
  closing?: true;
  /** 글 속 링크 — [낱말, 주소]. 문장마다 그 낱말이 처음 나오는 자리만 링크로 감싼다(문장은 그대로) */
  links?: readonly (readonly [string, string])[];
  /** 굵게 강조할 말(design-prompt 3-8, 조마다 2~3개) — 문장마다 처음 나오는 자리만. 글자는 그대로 */
  strong?: readonly string[];
};

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
  /** 요약 세 줄이 차례(1 → 2 → 3)인 글 — 안내 글 요약 칸에 번호와 칸 사이 화살표를 붙인다(design-prompt 5-2). 차례가 아닌 요약에는 두지 않는다 */
  summaryOrdered?: true;
  /** 요약 줄마다 이어지는 조 id(원칙 ④) — summary 와 같은 길이. 길이가 다르면 화면은 링크 없이 그린다 */
  summaryLinks?: readonly string[];
  /** 분류 칩 순서 — 없으면 조에 처음 나온 차례 */
  tagOrder?: readonly string[];
  /** 안내 글의 최종 수정일 「YYYY-MM-DD」(원칙 ⑥ · 기준 11). 버전이 있는 세 글은 쓰지 않는다 */
  updated?: string;
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
      else if (b.kind === "tiers") for (const t of b.items) texts.push(`${t.name} — ${t.rule}: ${t.price}`);
      else if (b.kind === "limit" || b.kind === "warn" || b.kind === "promise") texts.push(b.text);
      else if (b.kind === "progress") for (const [k, v] of b.items) texts.push(`${k}: ${v}`);
      else if (b.kind === "cases") for (const [k, v] of b.items) texts.push(`${k}: ${v}`);
      else if (b.kind === "slips") continue;
      else texts.push(...b.items);
    }
  }
  return [...new Set(texts.filter((t) => t.includes(TO_FILL) || t.includes("[확인 필요")))];
}
