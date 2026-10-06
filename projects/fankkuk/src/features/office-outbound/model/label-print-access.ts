/**
 * 송장 다시 출력(받는 사람 주소를 한 번 더 연다)은 대표만 — address-protection INV-P8, office-workflow INV-W3.
 * 팬 선물(크리에이터 주소)·역조공(팬 주소, reverse-gift INV-R7) 모두 상자마다 3번까지다.
 * 서버(scan-outbound 의 print_label, 송장 출력 함수)가 같은 판정을 다시 한다. 화면은 이 값으로 버튼과 안내를 보일지만 정한다.
 */
export function canReprintLabel(access: "staff" | "owner"): boolean {
  return access === "owner";
}
