/** 어댑터 설정(키·주소)이 아직 안 채워져 서명을 처리할 수 없다. 503 으로 답한다. */
export class AdapterNotReadyError extends Error {}

/** 서명 값·인증서 검증 실패. 승인 근거가 될 수 없다. 422 signature_invalid. reason 은 로그용 짧은 코드(개인정보 없음). */
export class SignatureInvalidError extends Error {
  constructor(reason = "signature_invalid") {
    super(reason);
    this.reason = reason;
  }
}

/** 서명한 사람이 요청 때 지정한 대상자가 아니다(승인 서명 INV-S4 — 이름·생년월일·번호·거래 ID). 422 signer_mismatch. */
export class SignerMismatchError extends Error {
  constructor(reason = "signer_mismatch") {
    super(reason);
    this.reason = reason;
  }
}

/** 서명된 원문이 그 거래의 원문과 다르다(INV-S2). 409 plaintext_mismatch. */
export class PlaintextMismatchError extends Error {}

/**
 * 딜러사(또는 KMS)가 예상 밖의 답을 했거나 닿지 못했다. code 는 딜러사 결과 코드 등 — 개인정보 없음.
 * retryable = 카카오톡 서명 요청이 딜러사에 가지 않은 것이 확실하다(앱이 한 번 더 불러도 된다) → 503 upstream_unreachable.
 * 아니면 502 upstream_error — 서명 요청을 보낸 뒤의 시간 초과·오류는 카카오톡이 이미 갔을 수 있어 앱이 다시 부르지 않는다(signup INV-U20).
 */
export class UpstreamError extends Error {
  constructor(code, retryable = false) {
    // 딜러사가 준 값이 섞이므로 로그에 넣기 전에 꼴을 좁힌다
    const safe = String(code).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    super(`upstream ${safe}`);
    this.code = safe;
    this.retryable = retryable === true;
  }
}

/** 어댑터가 모르는 거래 번호. 404 로 답한다. */
export class UnknownTransactionError extends Error {}
