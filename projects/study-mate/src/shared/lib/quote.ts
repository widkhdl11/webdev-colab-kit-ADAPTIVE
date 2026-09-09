/**
 * 사람이 자유롭게 정한 문자열을 **제품이 쓴 문장 안에 넣을 때** 두르는 표시.
 * 규칙과 그 근거는 시각 기준의 「남이 쓴 글자와 제품이 쓴 글자」에 있다.
 *
 * 여기서 지키는 것은 둘이다.
 * ① 두르는 것은 화면이 하고, **두른 값을 저장하지 않는다.** 저장된 값에 섞으면 다음 화면이
 *    다시 두르면서 두 겹이 된다.
 * ② **두른 글자 안에서는 같은 기호가 나오지 않는다.** 안 그러면 두르는 쪽이 무엇을 하든
 *    안쪽 문자열이 그 표시를 그대로 흉내 낼 수 있다.
 */

/** 제품이 그리는 여는 표시. */
export const QUOTE_OPEN = "「";
/** 제품이 그리는 닫는 표시. */
export const QUOTE_CLOSE = "」";

/**
 * 두른 글자 안에서 같은 기호를 대신하는 짝. **글자를 지우거나 자르지 않는다** —
 * 안쪽 내용이 그대로 보이되 바깥 표시와 겹치지 않게만 한다.
 */
const INNER: Readonly<Record<string, string>> = { [QUOTE_OPEN]: "『", [QUOTE_CLOSE]: "』" };

/**
 * 두른 결과를 **조각으로** 준다. 화면은 가운데만 굵게 그려야 해서 한 문자열로 못 받는다.
 *
 * **조각을 주는 자리가 하나여야 하는 이유**: 보이는 문장과 낭독기용 이름이 각자 두르면,
 * 두르기에 판단이 붙는 날 한쪽만 고쳐진다. 그리고 그때 안 고쳐지는 쪽이 보통 눈에 보이는
 * 쪽이다 — 이름 붙은 함수가 더 눈에 띄니까.
 */
export function quotedParts(text: string): { open: string; body: string; close: string } {
  return {
    open: QUOTE_OPEN,
    body: text.replace(/[「」]/g, (c) => INNER[c] ?? c),
    close: QUOTE_CLOSE,
  };
}

/**
 * 두른 결과를 한 문자열로. 낭독기용 이름처럼 조각이 필요 없는 자리가 쓴다.
 *
 * **낭독기에는 이 구분이 없다** — 문장부호는 기본 설정에서 안 읽힌다. 그래서 이 표시가
 * 지키는 것은 눈으로 보는 쪽이고, 소리로는 제품 문장의 모양을 흉내 낸 글자를 못 가른다.
 * 그쪽을 받치는 것은 값이 들어오는 자리의 길이 제한뿐이다.
 */
export function quoteUserText(text: string): string {
  const { open, body, close } = quotedParts(text);
  return `${open}${body}${close}`;
}
