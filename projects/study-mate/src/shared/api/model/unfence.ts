/**
 * 모델이 답을 코드 울타리로 감싸 보내면 벗긴다.
 *
 * **제공자 경계의 일이지 도메인 판단이 아니다.** 추천과 초안이 똑같은 함수를 한 벌씩
 * 들고 있었는데(정규식·`trim`·폴백까지 같았다), 갈라 두면 `~~~` 울타리나 앞에 한 줄 붙은
 * 산문을 만나 한쪽만 고치는 날 **추천은 살아나고 초안은 계속 실패한다** — 두 파일이 따로
 * 있어서 아무도 대조를 안 한다(2026-09-10 code-reviewer).
 *
 * **지금 제공자에서는 이 갈래가 안 돈다.** 부르는 두 자리가 다 `expectJson: true` 를 주고
 * 그것이 `responseMimeType: "application/json"` 으로 내려가서 울타리가 애초에 안 붙는다.
 * 제공자를 바꿀 날의 보험으로 남기되, 안 도는 코드가 두 벌일 이유는 더더욱 없다.
 */
export function unfence(raw: string): string {
  const fenced = raw.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n?\s*```\s*$/);
  return (fenced?.[1] ?? raw).trim();
}
