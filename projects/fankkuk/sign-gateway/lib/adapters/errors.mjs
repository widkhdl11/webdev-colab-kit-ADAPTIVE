/** 어댑터 설정(키·주소)이 아직 안 채워져 서명을 처리할 수 없다. 503 으로 답한다. */
export class AdapterNotReadyError extends Error {}

/** 서명 값·인증서 검증 실패. 승인 근거가 될 수 없다. */
export class SignatureInvalidError extends Error {}

/** 어댑터가 모르는 거래 번호. 404 로 답한다. */
export class UnknownTransactionError extends Error {}
