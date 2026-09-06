/**
 * 폼에서 온 값 하나를 다듬는다. 빈 문자열은 "안 적음"이라 null 이다.
 *
 * **줄바꿈을 먼저 통일한다.** HTML 폼 제출은 textarea 의 줄바꿈을 전부 CRLF 로 바꿔 보낸다.
 * 그런데 본문을 문단으로 나누는 쪽은 `content.split(/\n{2,}/)` 로 **`\n` 이 연달아 두 번**
 * 오는 것을 찾는다 — `\r\n\r\n` 은 CR·LF·CR·LF 라 한 번도 안 맞고, **본문 전체가 한 문단으로
 * 렌더된다.** 지금까지 안 드러난 이유는 본문이 전부 SQL 로 넣은 시드였기 때문이고,
 * 브라우저 textarea 에서 본문이 들어오는 경로는 2026-09-06 에 처음 생겼다.
 *
 * 이 함수가 한 자리에 있는 이유가 그것이다 — 두 벌로 두면 모집글 본문은 문단이 나뉘고
 * 스터디 설명은 안 나뉘는 상태가 만들어지고, 그 차이를 아무도 못 본다.
 */
export function formText(form: FormData, key: string): string | null {
  const v = String(form.get(key) ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  return v === "" ? null : v;
}
