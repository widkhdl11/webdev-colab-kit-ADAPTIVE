// 개발용 출고·반송 송장번호 (숫자 12자리). 택배사 송장 API 가 아직 없어서(office-workflow 비범위 — 계약 뒤)
// 서버가 대신 만든다. 택배사 API 를 붙이면 이 함수 대신 그 API 가 준 송장번호를 DB 출력 함수에 넘긴다.
// 암호학적 난수로 만들어 다른 상자의 송장번호를 짐작해 맞출 수 없게 한다.

const LENGTH = 12;

export function devWaybillNo(): string {
  let out = "";
  while (out.length < LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(LENGTH));
    for (const b of bytes) {
      if (b < 250 && out.length < LENGTH) out += String(b % 10); // 250 이상은 버린다 — 0~9 가 고르게 나오게
    }
  }
  return out;
}
