/** 낱말 뒤에 주격 조사 이/가를 붙인다 — 마지막 글자에 받침이 있으면 「이」, 없으면(한글이 아니어도) 「가」. 이름이 바뀌어도 조사가 따라오게. */
export function withSubjectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0) - 0xac00;
  const hasFinal = code >= 0 && code < 11172 && code % 28 !== 0;
  return `${word}${hasFinal ? "이" : "가"}`;
}
