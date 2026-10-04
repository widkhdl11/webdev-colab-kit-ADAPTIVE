// 글자 수. 문자열 길이(UTF-16 단위)가 아니라 코드 포인트로 센다 — Postgres char_length 와 같은 기준이라
// 이모지가 섞여도 화면 검사와 DB 검사가 어긋나지 않는다.
export function charCount(text: string): number {
  return Array.from(text).length;
}
