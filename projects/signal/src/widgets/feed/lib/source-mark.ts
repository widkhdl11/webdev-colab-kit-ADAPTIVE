/**
 * 출처 이름 → 카드 메타 줄 앞에 붙는 짧은 표식.
 *
 * 카드 12장이 전부 균질한 텍스트 덩어리라 훑을 때 눈이 걸릴 지점이 없다는 문제를 푼다.
 * 한글은 한 글자로 충분하고(자체 폭이 넓다), 로마자는 한 글자면 "G"·"H" 처럼 구별이
 * 안 돼서 두 글자를 쓴다.
 */

const HANGUL = /[ㄱ-ㆎ가-힣]/;

export function sourceMark(sourceName: string): string {
  const name = sourceName.trim();
  if (name === "") return "·";
  return HANGUL.test(name[0]) ? name.slice(0, 1) : name.slice(0, 2);
}
