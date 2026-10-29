// 드림시큐리티 어댑터 — 카카오 인증서 전자서명. 테스트 키와 API 명세가 오면 채운다.
//
// CommonJS 파일이다. 드림시큐리티 Node.js 연동 모듈이 CommonJS 만 지원하므로(ES 모듈 불가) 이 파일에서
// require 로 직접 부른다. 게이트웨이의 나머지는 ES 모듈이라 index.mjs 가 createRequire 로 이 파일을 불러온다.
// 오류 클래스와 outboundRequest 는 ES 모듈 쪽에 있으니 require 하지 말고 두 번째 인자(deps)로 받은 것을 쓴다.
// 연동 모듈·샘플 코드는 lib/ 아래에 둔다 — 서버 설치(deploy/install.sh)는 lib/ 를 통째로 복사한다.
//
// 지금은 자리만 있다. 설정이 다 채워져도 아래 세 함수가 구현되기 전까지는 서명 요청을 받지 않는다(503).
//
// 명세가 오면 채울 것:
//   requestSignature — 서명 요청 API 호출. 원문은 승인 서명 INV-S1 의 네 값뿐이고, 서명자 식별(이름·전화 등)은
//                      signer 로 받는다. 호출은 반드시 deps.outboundRequest 로 한다(허용 목록).
//   fetchResult      — 결과 조회 API 호출. 응답의 「성공」 표시는 state 를 정하는 데만 쓰고 승인 근거로 쓰지 않는다.
//   verify           — 외부 연결 INV-S3: 서명 값·인증서 체인·서명 알고리즘·유효 기간·폐기 여부를 여기서 직접 검증하고,
//                      원문과 서명자 식별값(INV-S4)을 검증된 서명 데이터에서 꺼낸다. 폐기 확인(OCSP·CRL) 주소가
//                      허용 목록 밖이면 config.mjs 의 ALLOWED_HOST_SUFFIXES 에 그 도메인을 더해야 한다.
//   연동 모듈이 자체로 HTTP 를 내보내면 허용 목록을 거치지 않는다 — 그 경우 모듈의 전송 부분을 outboundRequest 로
//   바꿔 끼울 수 있는지부터 본다.

"use strict";

const REQUIRED = [
  ["apiBaseUrl", "DREAM_API_BASE_URL"],
  ["clientId", "DREAM_CLIENT_ID"],
  ["clientSecret", "DREAM_CLIENT_SECRET"],
];

const IMPLEMENTED = false;

/**
 * @param {any} config
 * @param {{ errors: typeof import("./errors.mjs"), outboundRequest: typeof import("../outbound.mjs").outboundRequest }} deps
 */
function createDreamsecurityAdapter(config, deps) {
  const { AdapterNotReadyError } = deps.errors;

  function ready() {
    const missing = REQUIRED.filter(([key]) => !config.dreamsecurity[key]).map(([, env]) => env);
    if (missing.length > 0) return { ok: false, reason: `환경 변수 비어 있음: ${missing.join(", ")}` };
    if (config.allowedHosts.length === 0) return { ok: false, reason: "OUTBOUND_ALLOWED_HOSTS 가 비어 있음" };
    if (!IMPLEMENTED) return { ok: false, reason: "드림시큐리티 API 명세 반영 전" };
    return { ok: true };
  }

  function notReady() {
    return new AdapterNotReadyError(ready().reason ?? "준비되지 않음");
  }

  return {
    name: "dreamsecurity",
    method: "kakao",
    ready,
    async requestSignature() {
      throw notReady();
    },
    async fetchResult() {
      throw notReady();
    },
    async verify() {
      throw notReady();
    },
  };
}

module.exports = { createDreamsecurityAdapter };
