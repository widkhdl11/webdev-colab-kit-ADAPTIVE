/**
 * 화면의 상태를 주소에 담는다. 필터가 주소에 있으면 뒤로 가기·새로고침·공유가
 * 그냥 동작하고, 화면을 다시 그리는 데 브라우저 코드가 필요 없다.
 */

export type QueryValue = string | number | boolean | readonly string[] | undefined | null;

/** 빈 값은 아예 넣지 않는다 — `?q=&region=` 같은 주소가 공유되지 않게 */
export function buildQuery(params: Readonly<Record<string, QueryValue>>): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out.set(key, value.join(","));
    } else {
      out.set(key, String(value));
    }
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/** 쉼표로 이어 붙인 값을 목록으로. 빈 조각은 버린다 */
export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 목록에 있으면 빼고 없으면 넣는다 — 칩 하나를 눌렀을 때의 다음 상태 */
export function toggleInList(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 1 이상의 정수만. 아니면 1 */
export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}
