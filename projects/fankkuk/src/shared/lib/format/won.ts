/** 금액 표시 「6,900원」 — 화면마다 따로 두던 같은 함수를 한 곳으로 */
export function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}
