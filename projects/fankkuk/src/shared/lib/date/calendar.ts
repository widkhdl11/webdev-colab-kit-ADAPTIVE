// 달력 날짜 계산의 공용 조각 — 받는 양 조절(creator-receiving)과 함께한 시간(together)이 같이 쓴다. 도메인 규칙은 없다.

/** 그레고리력 윤년. */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** YYYY-MM-DD 글자를 연·월·일 숫자로 나눈다. 꼴이 다르면 null — 달력에 있는 날인지는 보지 않는다(2026-02-30 도 나눈다). */
export function splitIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}
