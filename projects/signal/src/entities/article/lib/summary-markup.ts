/**
 * AI 요약의 서식 해석 — content-safety INV-D7 (2026-09-23 사용자 결정).
 *
 * **허용 목록 넷만 해석한다**: 빈 줄로 나뉜 문단 · `**굵게**` · 줄 머리의 `- ` 점 목록 ·
 * 파이프 표. 그 밖의 표기(링크·이미지·제목·태그·맨 주소·번호 목록·인용)는 **글자 조각으로만**
 * 돌려준다 — 이 모듈이 돌려주는 모양에는 링크나 이미지를 담을 자리가 아예 없다.
 *
 * 요약은 남의 웹페이지를 근거로 모델이 쓴 글이라 신뢰 경계 밖이다(INV-S1). 거기 심은 링크가
 * 「AI 요약」 자리에 앉지 않게 하는 것이 이 모듈의 일이다. HTML 문자열을 만들지 않고
 * 구조만 돌려주며, 그리는 일은 widgets 가 React 요소로 한다(INV-D3).
 */

export type SummaryInline = { kind: "text"; text: string } | { kind: "bold"; text: string };

export type SummaryBlock =
  | { kind: "paragraph"; inlines: SummaryInline[] }
  | { kind: "list"; items: SummaryInline[][] }
  | { kind: "table"; head: SummaryInline[][]; rows: SummaryInline[][][] };

/**
 * 표로 그리는 한도. 390px 폭에서 가로 스크롤 없이 들어가는 크기다(design-rules 는 가로
 * 스크롤을 안 쓴다). 넘는 표는 요약이 아니라 원문의 일이라, 표로 그리지 않고 글자로 둔다.
 */
export const TABLE_MIN_COLS = 2;
export const TABLE_MAX_COLS = 3;
export const TABLE_MAX_ROWS = 8;

/** 표 모양 한도 검사 — 해석기와 수집 쪽 변환기가 **같은 함수**를 쓴다. */
function fitsTableLimits(
  head: readonly unknown[],
  body: readonly (readonly unknown[])[],
): boolean {
  const cols = head.length;
  if (cols < TABLE_MIN_COLS || cols > TABLE_MAX_COLS) return false;
  if (body.length === 0 || body.length > TABLE_MAX_ROWS) return false;
  return body.every((r) => r.length === cols);
}

const BOLD = /\*\*([^*\n]+?)\*\*/g;
// 뒤에 글자가 있어야 목록 줄이다 — `- ` 만 있는 줄이 빈 항목이 되지 않게(2026-09-23 리뷰).
const LIST_ITEM = /^- (.*\S.*)$/;
const SEPARATOR_CELL = /^:?-{3,}:?$/;

/** 한 줄 안에서 `**굵게**` 만 해석한다. 짝이 안 맞는 별표는 글자로 남는다. */
export function parseInline(text: string): SummaryInline[] {
  const out: SummaryInline[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({ kind: "bold", text: m[1] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** `| a | b |` → `["a", "b"]`. 양끝 파이프가 없으면 표 줄이 아니다. */
function splitRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 2) return null;
  return t
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

/**
 * 표 한 덩어리를 해석한다. 조건을 하나라도 못 맞추면 `null` — 부르는 쪽이 글자로 둔다.
 * 조건: 머리행 + 구분행(`---`) + 본문 행 1~8개, 모든 행의 열 수가 같고 2~3개.
 */
function parseTable(lines: string[]): SummaryBlock | null {
  if (lines.length < 3) return null;
  const rows = lines.map(splitRow);
  if (rows.some((r) => r === null)) return null;
  const [head, sep, ...body] = rows as string[][];
  if (!fitsTableLimits(head, body)) return null;
  if (sep.length !== head.length || !sep.every((c) => SEPARATOR_CELL.test(c))) return null;
  return {
    kind: "table",
    head: head.map(parseInline),
    rows: body.map((r) => r.map(parseInline)),
  };
}

/** 한 덩어리(빈 줄 사이)를 블록으로. 표·목록이 섞이면 줄 종류가 바뀌는 자리에서 가른다. */
function parseChunk(lines: string[]): SummaryBlock[] {
  const out: SummaryBlock[] = [];
  let i = 0;
  const pushText = (textLines: string[]) => {
    if (textLines.length === 0) return;
    // 문단 안의 줄바꿈은 한 칸으로 잇는다 — 모델이 문장마다 줄을 바꿔도 한 문단으로 읽힌다.
    out.push({ kind: "paragraph", inlines: parseInline(textLines.join(" ")) });
  };

  while (i < lines.length) {
    const line = lines[i];
    if (splitRow(line) !== null) {
      let j = i;
      while (j < lines.length && splitRow(lines[j]) !== null) j++;
      const group = lines.slice(i, j);
      const table = parseTable(group);
      // 표 조건을 못 맞춘 파이프 줄은 **글자 그대로** 둔다. 줄마다 한 문단으로 두어야
      // 원래 모양(행이 줄마다)이 보인다 — 한 줄로 이으면 읽을 수 없는 기호 덩어리가 된다.
      if (table !== null) out.push(table);
      else for (const g of group) pushText([g]);
      i = j;
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const items: SummaryInline[][] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        items.push(parseInline((LIST_ITEM.exec(lines[i]) as RegExpExecArray)[1].trim()));
        i++;
      }
      out.push({ kind: "list", items });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && splitRow(lines[i]) === null && !LIST_ITEM.test(lines[i])) {
      text.push(lines[i].trim());
      i++;
    }
    pushText(text);
  }
  return out;
}

export function parseSummaryMarkup(source: string): SummaryBlock[] {
  const chunks = source
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((c) => c.split("\n").filter((l) => l.trim() !== ""))
    .filter((c) => c.length > 0);
  return chunks.flatMap(parseChunk);
}

const plain = (xs: SummaryInline[]) => xs.map((x) => x.text).join("");

/**
 * 목록 카드의 두 줄 미리보기 (INV-D7). **서식 기호를 벗긴 문단 글자.**
 * 표는 건너뛴다 — 두 줄 안에 표를 글자로 풀면 `모델 컨텍스트 가격 A 20만…` 이 된다.
 * 목록뿐인 요약이면 항목을 가운뎃점으로 잇는다.
 */
export function summaryPreviewText(source: string): string {
  const blocks = parseSummaryMarkup(source);
  // 문단을 **전부** 잇는다 — 첫 문단이 40자짜리 한 문장이면 두 줄 미리보기의 둘째 줄이 빈다
  // (2026-09-23 리뷰). 자르는 일은 카드 CSS(두 줄)가 한다.
  const paras = blocks.flatMap((b) => (b.kind === "paragraph" ? [plain(b.inlines)] : []));
  if (paras.length > 0) return paras.join(" ");
  const list = blocks.find((b) => b.kind === "list");
  if (list?.kind === "list") return list.items.map(plain).join(" · ");
  return "";
}

/**
 * 모델이 **따로 준 표**를 요약 표기로 옮긴다 (INV-D7).
 *
 * 처음에는 요약 문자열 안에 파이프 표를 직접 쓰게 했는데, 실측(2026-09-23, 3건)에서 두 모델의
 * 가격이 나란히 나온 글에서도 표가 한 번도 안 나왔다 — JSON 문자열 하나 안에 줄바꿈과 파이프를
 * 짜 넣는 것을 모델이 꺼린다. 그래서 표는 `{ head, rows }` 칸으로 받고 여기서 옮긴다.
 * 덤으로 모양 검사를 받을 때 한 번 더 한다: 조건을 못 맞추면 표를 **버린다**(요약은 남는다).
 * 칸 안의 `|`·줄바꿈은 표를 깨므로 바꿔 넣는다.
 */
export function tableToMarkup(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const { head, rows } = value as { head?: unknown; rows?: unknown };
  const isRow = (r: unknown): r is string[] =>
    Array.isArray(r) && r.every((c) => typeof c === "string" && c.trim() !== "");
  if (!isRow(head) || !Array.isArray(rows) || !rows.every(isRow)) return null;
  if (!fitsTableLimits(head, rows)) return null;
  // 공백을 한 칸으로 접는다 — 줄바꿈도 같이 접혀 표 줄이 깨지지 않는다. 앞뒤에 `\s*` 를 둔
  // 옛 식은 긴 공백에서 되돌아가기가 제곱으로 늘었다(2026-09-23 보안 리뷰).
  const cell = (c: string) => c.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  const line = (r: string[]) => `| ${r.map(cell).join(" | ")} |`;
  return [line(head), `|${" --- |".repeat(head.length)}`, ...rows.map(line)].join("\n");
}

/**
 * 모델이 따로 준 **한 문장 요약**을 요약 표기로 옮긴다 (2026-09-23 사용자 요구).
 *
 * "첫 줄에 간단요약이 있어야 표를 봐도 무슨 이야기인지 알고 읽을 수 있다" — 그래서 이 한 문장은
 * 저장할 때 요약의 **첫 문단**이 되고, 화면은 첫 문단을 맨 위에 앞세운다(`splitLead`).
 * 한 줄로 접고, 목록·표 기호로 시작하면 떼어 낸다 — 첫 문단이 문단이 아니면 앞세울 수 없다.
 */
export function leadToMarkup(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const line = value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:-\s+|\|\s*)+/, "")
    .trim();
  return line === "" ? null : line;
}

/** 한 문장 요약으로 치는 최대 길이. 지시문이 "40자 안팎"이라 두 배 여유를 둔다. */
export const LEAD_MAX_CHARS = 80;

/**
 * 첫 문단을 앞세우고 나머지를 따로 돌려준다 — 상세의 순서(한 문장 → 핵심 → 문단 → 표)를
 * 그리려고 쓴다. 첫 블록이 문단이 아니면 앞세울 것이 없다.
 */
export function splitLead(source: string): {
  lead: SummaryInline[] | null;
  rest: SummaryBlock[];
} {
  const blocks = parseSummaryMarkup(source);
  const [first, ...rest] = blocks;
  if (first?.kind !== "paragraph") return { lead: null, rest: blocks };
  // **짧고 뒤에 이어지는 것이 있을 때만** 한 문장으로 친다(2026-09-23 리뷰). 저장 형식에는
  // "한 문장이 붙었나"가 안 남는다 — 옛 요약(문단 하나)이나 모델이 lead 를 빠뜨린 요약에서
  // 두세 문장짜리 첫 문단 전체가 굵게 앞에 서면 안 된다.
  if (rest.length === 0 || plain(first.inlines).length > LEAD_MAX_CHARS) {
    return { lead: null, rest: blocks };
  }
  return { lead: first.inlines, rest };
}
