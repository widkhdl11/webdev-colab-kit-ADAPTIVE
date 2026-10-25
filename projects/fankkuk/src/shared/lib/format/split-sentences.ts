// 짧은 여러 문장 안내를 문장마다 나눈다(design-rules 29절 줄바꿈 3). 화면 문장은 해요체라 「요.」·「요?」·「다.」 뒤의 띄어쓰기에서만 자른다 —
// 「(인스타그램은 프로페셔널 계정만). SOOP …」처럼 괄호 뒤 마침표나 「1.5」 같은 숫자에서는 자르지 않는다.
// 자르는 자리는 보통 띄어쓰기·줄바꿈만이다(\s 는 U+00A0 까지 잡아 「일부러 붙인」 자리를 자르게 된다).
const SENTENCE_END = /(?<=[요다][.?!])[ \t\r\n]+(?=\S)/u;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .map((part) => part.trim())
    .filter((part) => part !== "");
}
