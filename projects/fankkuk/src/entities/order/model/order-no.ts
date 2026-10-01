// 주문번호: FC-7K3M9 (등록 건) 또는 FC-001-2 (상자 나눔). 대문자·숫자·하이픈만.
// 이 형식 밖의 문자가 들어올 자리가 없어야 서명 원문·QR 에 다른 정보가 섞이지 않는다.
export const ORDER_NO_PATTERN = /^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$/;

export function isOrderNo(value: string): boolean {
  return ORDER_NO_PATTERN.test(value);
}
