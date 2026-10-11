/** 사진이 없을 때 기본 이미지(단색 원)에 넣는 이름 첫 글자. 앞뒤 공백을 빼고 첫 글자(서로게이트 쌍도 한 글자). 빈 이름이면 빈 문자열. */
export function nameInitial(name: string): string {
  return [...name.trim()][0] ?? "";
}
