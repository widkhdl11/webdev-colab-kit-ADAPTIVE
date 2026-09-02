/* 이름을 작은 원 안에 넣을 표식으로 줄인다.
 *
 * 로마자만 두 글자를 남기는 이유는 한 글자면 구별이 안 되기 때문이다 —
 * `GitHub` 과 `Google` 이 둘 다 `G` 가 된다. 한글은 한 글자에 이미 음절이 들어 있어
 * 첫 글자만으로 갈린다.
 */

const LATIN_LETTER = /[A-Za-z]/;

/**
 * @param name 원본 이름. 빈 문자열이면 빈 문자열을 돌려준다(부르는 쪽이 원을 안 그린다).
 * @returns 로마자로 시작하면 두 글자, 그 밖에는 한 글자.
 */
export function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";

  // 서러게이트 쌍(이모지 등)이 반쪽으로 잘리지 않게 코드포인트 단위로 센다.
  const chars = [...trimmed];
  const first = chars[0];
  if (first === undefined) return "";

  return LATIN_LETTER.test(first) ? chars.slice(0, 2).join("") : first;
}
