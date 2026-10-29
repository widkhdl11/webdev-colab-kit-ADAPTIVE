// 드림시큐리티 간편인증-API 어댑터 — 인증기관 카카오, 전자서명(serviceType "sign"), 결과는 hubToken 방식.
//
// CommonJS 파일이다. 드림시큐리티 Node.js 연동 모듈(eziok_Key_Manager)이 CommonJS 만 지원한다. 게이트웨이의 나머지는
// ES 모듈이라 index.mjs 가 createRequire 로 이 파일을 불러오고, ES 모듈 쪽 의존성(오류 클래스·outboundRequest·KMS)은 deps 로 넘긴다.
//
// 연동 모듈은 저장소에 넣지 않는다(라이선스 미확인) — 서버의 lib/vendor/eziok_Key_Manager.cjs (DREAM_MODULE_FILE).
// 모듈은 fs·crypto 만 쓰고 네트워크를 내보내지 않는다. 전역 상태 싱글턴이라 keyInit 은 프로세스에서 한 번만 한다.
// 딜러사로 가는 요청 셋(get-token · auth-enc-request · auth-result)과 OCSP 조회는 전부 deps.outboundRequest(허용 목록)로 나간다.
//
// 흐름 (가이드 4~6장):
//   요청  ① clientTxId = 접두사 + uuid(하이픈 없음), encClientTxId = RSAEncrypt("yyyyMMddHHmmss(한국시간)|clientTxId")
//         ② POST get-token → userToken·publicKey
//         ③ encUserReqInfo = RSAServerEncrypt(publicKey, JSON(대상자 세 값·원문·요청 구분 문구 …))
//         ④ POST auth-enc-request
//   결과  ⑤ 앱이 결과 경로를 부를 때마다 POST auth-result. 2000 이면 hubToken → getResult
//         ⑥ 거래 ID·발급 시각(10분)·대상자 세 값(INV-S4) → 전자서명문 직접 검증(INV-S3) → 감싼 틀을 벗긴 원문 = 그 거래 원문(INV-S2)
//
// 진행 중 거래는 메모리 Map 에만 둔다(디스크에 쓰지 않는다). 만든 때부터 5분이 지나면 지운다 — 재시작해도 사라지고, 그 txId 의 결과는 expired.
// 로그·오류 메시지에 키 비밀번호·키 내용·원문·이름·번호를 넣지 않는다. 오류에는 결과 코드나 짧은 이유 코드만.

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const envelope = require("../envelope.cjs");
const signedDataLib = require("../signed-data.cjs");

const TX_TTL_MS = 5 * 60 * 1000; // 거래토큰·결과 유효 시간(가이드 4장·오류 1012) = 승인 서명 INV-S16·S17 의 5분
const ISSUE_MAX_AGE_MS = 10 * 60 * 1000; // 결과 발급 뒤 10분 안에만 받는다(가이드 6장 권고, 외부 연결 INV-S3)
const CLOCK_SKEW_MS = 60 * 1000;
const MAX_TRANSACTIONS = 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const HOSTS = Object.freeze({ development: "scert-dir.ez-iok.com", production: "cert-dir.ez-iok.com" });

// 결과 코드 → 상태 (가이드 7장)
// 1014 「인증 요청 순서가 맞지 않습니다」— 사용자가 아직 카카오톡에서 인증하지 않았을 때 오는 코드로 추정한다.
//      테스트 키로 확인 필요: 앱 인증 전 auth-result 가 실제로 1014 를 주는지, 다른 코드(예: 대기 전용 코드)를 주는지.
const PENDING_CODES = new Set(["1014"]);
// 1001 인증 요청 시간 초과 · 1012 결과 응답 시간 5분 초과 · 6003 이미 사용됐거나 5분 초과 · 1009 거래 토큰 유효기간 초과
const EXPIRED_CODES = new Set(["1001", "1012", "6003", "1009"]);
// 5003 입력한 정보와 인증사업자의 사용자 정보 불일치 · 2800 인증사업자 쪽 오류(사용자 취소·미가입 등)
const REJECTED_CODES = new Set(["5003", "2800"]);

/** 한국시간 yyyyMMddHHmmss */
function kstStamp(ms) {
  const iso = new Date(ms + KST_OFFSET_MS).toISOString();
  return iso.slice(0, 19).replace(/[-T:]/g, "");
}

/** 발급일 "yyyy-MM-dd HH:mm:ss.SSS"(한국시간) → ms. 꼴이 아니면 NaN */
function parseIssueDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(String(value ?? ""));
  if (!m) return Number.NaN;
  const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0;
  return Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6], ms) - KST_OFFSET_MS;
}

/**
 * 카카오는 요청 원문을 {"txId":…,"data":…} 로 감싸 서명한다(가이드 2.5). 예시: data = "{\"서명원문\":\"TEST 입니다.\"}".
 * 비교 후보: 감싼 틀을 벗긴 값 — data 가 JSON 객체이고 값이 하나(문자열)면 그 값, 아니면 data 자체 — 와, 감싸지 않은 원문 그대로.
 * 후보 중 하나가 요청 원문과 바이트 단위로 같아야 한다. 어느 후보든 서명 값이 덮는 바이트에서 나온다.
 * 테스트 키로 확인 필요: 실제 감싼 꼴(data 안 키 이름, txId 가 무엇의 ID 인지), 원문이 JSON 일 때 이스케이프.
 * txId 는 비교하지 않는다(어느 거래 ID 인지 가이드에 없다 — 확인 뒤 hubToken 의 txId·certTxId 와 맞춰 볼지 정한다).
 */
function unwrapKakaoContent(content) {
  const text = content.toString("utf8");
  const candidates = [text];
  try {
    const outer = JSON.parse(text);
    if (outer && typeof outer === "object" && !Array.isArray(outer) && typeof outer.data === "string") {
      candidates.push(outer.data);
      try {
        const inner = JSON.parse(outer.data);
        if (inner && typeof inner === "object" && !Array.isArray(inner)) {
          const values = Object.values(inner);
          if (values.length === 1 && typeof values[0] === "string") candidates.push(values[0]);
        }
      } catch {
        // data 가 JSON 이 아니면 data 자체가 원문
      }
    }
  } catch {
    // 감싸지 않은 원문
  }
  return candidates;
}

function sameUtf8(a, b) {
  return Buffer.from(a, "utf8").equals(Buffer.from(b, "utf8"));
}

/**
 * @param {any} config loadConfig 결과
 * @param {{
 *   errors: typeof import("./errors.mjs"),
 *   outboundRequest: typeof import("../outbound.mjs").outboundRequest,
 *   unwrapKey: (wrappedKey: Buffer) => Promise<Buffer>,
 *   unwrapReady: () => { ok: boolean, reason?: string },
 *   loadModule?: (file: string) => any,
 *   now?: () => number,
 * }} deps
 */
function createDreamsecurityAdapter(config, deps) {
  const { AdapterNotReadyError, SignatureInvalidError, SignerMismatchError, PlaintextMismatchError, UpstreamError, UnknownTransactionError } =
    deps.errors;
  const settings = config.dreamsecurity;
  const now = deps.now ?? (() => Date.now());
  const loadModule = deps.loadModule ?? ((file) => require(file));
  const host = HOSTS[settings.env] ?? null;

  /** @type {Map<string, any>} */
  const transactions = new Map();
  let state = null; // { module, anchors } — 한 번 준비되면 그대로 쓴다

  function prepare() {
    if (state) return { ok: true };
    const missing = [
      ["keyFile", "DREAM_KEY_FILE"],
      ["keyPassword", "DREAM_KEY_PASSWORD"],
      ["siteUrl", "DREAM_SITE_URL"],
      ["env", "DREAM_ENV"],
      ["caFile", "DREAM_CA_FILE"],
    ]
      .filter(([key]) => !settings[key])
      .map(([, env]) => env);
    if (missing.length > 0) return { ok: false, reason: `환경 변수 비어 있음: ${missing.join(", ")}` };
    if (!host) return { ok: false, reason: "DREAM_ENV 는 development | production" };
    if (!config.allowedHosts.includes(host)) return { ok: false, reason: `OUTBOUND_ALLOWED_HOSTS 에 ${host} 가 없음` };
    const kms = deps.unwrapReady();
    if (!kms.ok) return { ok: false, reason: `KMS — ${kms.reason}` };
    if (!fs.existsSync(settings.moduleFile)) return { ok: false, reason: `연동 모듈 파일 없음 (DREAM_MODULE_FILE)` };
    if (!fs.existsSync(settings.keyFile)) return { ok: false, reason: "키 파일 없음 (DREAM_KEY_FILE)" };
    let anchors;
    try {
      anchors = signedDataLib.parsePemBundle(fs.readFileSync(settings.caFile, "utf8"));
    } catch {
      return { ok: false, reason: "카카오 인증기관 인증서를 읽지 못함 (DREAM_CA_FILE)" };
    }
    if (anchors.length === 0) return { ok: false, reason: "카카오 인증기관 인증서가 없음 (DREAM_CA_FILE)" };
    let mod;
    try {
      mod = loadModule(path.resolve(settings.moduleFile));
      mod.keyInit(settings.keyFile, settings.keyPassword);
      mod.setSiteUrl(settings.siteUrl);
      if (!mod.getServiceId()) throw new Error();
    } catch {
      // 모듈 오류 메시지에는 키 내용이 섞일 수 있어 그대로 옮기지 않는다
      return { ok: false, reason: "연동 모듈 키 초기화 실패 (키 파일·비밀번호 확인)" };
    }
    state = { module: mod, anchors };
    return { ok: true };
  }

  function ready() {
    return prepare();
  }

  function requireReady() {
    const r = prepare();
    if (!r.ok) throw new AdapterNotReadyError(r.reason);
    return state;
  }

  function url(name) {
    return `https://${host}/agent/${name}`;
  }

  async function post(name, payload) {
    let res;
    try {
      res = await deps.outboundRequest(url(name), {
        allowedHosts: config.allowedHosts,
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", accept: "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new UpstreamError(`${name}_unreachable`);
    }
    if (res.status !== 200) throw new UpstreamError(`${name}_http_${res.status}`);
    try {
      const parsed = JSON.parse(res.body);
      if (parsed === null || typeof parsed !== "object") throw new Error();
      return parsed;
    } catch {
      throw new UpstreamError(`${name}_bad_json`);
    }
  }

  function prune(at) {
    for (const [txId, tx] of transactions) {
      if (at >= tx.expiresAt) transactions.delete(txId);
    }
    while (transactions.size >= MAX_TRANSACTIONS) transactions.delete(transactions.keys().next().value);
  }

  async function openIdentity(signer) {
    if (signer === null || typeof signer !== "object") throw new TypeError("signer");
    const parsed = envelope.parseEnvelope(signer.envelope);
    let dek;
    try {
      dek = Buffer.from(await deps.unwrapKey(parsed.wrappedKey));
    } catch {
      throw new UpstreamError("kms_decrypt");
    }
    const identity = envelope.parseLinkIdentity(envelope.openEnvelope(parsed, dek));
    // 앱은 DB 가 그 요청의 크리에이터로 돌려준 ID 를 꼭 같이 보낸다 — 봉투 안의 것과 같아야 한다(다른 크리에이터의 봉투를 옮겨 붙이지 못하게).
    // 없거나 다르면 400 invalid_signer
    if (typeof signer.creatorId !== "string" || signer.creatorId.length === 0 || signer.creatorId !== identity.creatorId) {
      throw new TypeError("signer.creatorId");
    }
    return identity;
  }

  async function requestSignature({ requestId, plaintext, requestMessage, signer }) {
    const { module: mod } = requireReady();
    if (typeof requestMessage !== "string" || requestMessage.length === 0 || requestMessage.length > 40) {
      throw new TypeError("requestMessage");
    }
    const identity = await openIdentity(signer);

    const createdAt = now();
    const clientTxId = `${settings.txPrefix}${crypto.randomUUID().replace(/-/g, "")}`;
    const siteUrl = mod.getSiteUrl() || settings.siteUrl;

    const token = await post("get-token", {
      serviceId: mod.getServiceId(),
      siteUrl,
      encClientTxId: mod.RSAEncrypt(`${kstStamp(createdAt)}|${clientTxId}`),
    });
    if (String(token.resultCode) !== "2000") throw new UpstreamError(`get-token_${token.resultCode}`);
    if (typeof token.userToken !== "string" || typeof token.publicKey !== "string") throw new UpstreamError("get-token_shape");

    const jsonData = {
      siteUrl,
      serviceType: "sign",
      providerId: "kakao",
      username: identity.name,
      userphone: identity.phone,
      userbirthday: identity.birth,
      browserType: "MB",
      signTargetType: "PlainText",
      signContents: plaintext,
      signRequestMessage: requestMessage,
      retTransferType: "hubtoken",
      returnUrl: `https://${siteUrl}`,
    };
    const sent = await post("auth-enc-request", {
      userToken: token.userToken,
      encUserReqInfo: mod.RSAServerEncrypt(token.publicKey, JSON.stringify(jsonData)),
    });
    if (String(sent.resultCode) !== "2000") throw new UpstreamError(`auth-enc-request_${sent.resultCode}`);

    prune(createdAt);
    transactions.set(clientTxId, {
      requestId,
      plaintext,
      clientTxId,
      userToken: typeof sent.userToken === "string" && sent.userToken ? sent.userToken : token.userToken,
      identity,
      expiresAt: createdAt + TX_TTL_MS,
      final: null, // 끝난 결과(상태 또는 오류) — hubToken 은 한 번만 받으므로 다시 물어도 같은 답을 준다
      inflight: null,
    });
    return { txId: clientTxId, expiresAt: new Date(createdAt + TX_TTL_MS).toISOString() };
  }

  async function ocspPost(ocspUrl, body) {
    const res = await deps.outboundRequest(ocspUrl, {
      allowedHosts: config.allowedHosts,
      method: "POST",
      headers: { "content-type": "application/ocsp-request", accept: "application/ocsp-response" },
      body,
    });
    if (res.status !== 200 || !res.rawBody) throw new Error("ocsp http");
    return res.rawBody;
  }

  /** hubToken 결과 하나를 끝까지 검증한다. 통과하면 앱에 돌려줄 값. */
  async function verifyResult(tx, result, anchors) {
    // INV-S4: 결과의 거래 ID 는 이 거래 때 만든 것과 같아야 한다
    if (result.clientTxId !== tx.clientTxId) throw new SignerMismatchError("client_tx_id");
    if (result.serviceType !== "sign" || result.providerId !== "kakao") throw new SignatureInvalidError("service_type");

    const at = now();
    const issued = parseIssueDate(result.issueDate);
    if (!Number.isFinite(issued) || at - issued > ISSUE_MAX_AGE_MS || issued - at > CLOCK_SKEW_MS) {
      throw new SignatureInvalidError("issue_date");
    }

    // INV-S4: 이름·휴대폰·생년월일 세 값 모두. CI(encCi)는 풀지 않는다.
    // 테스트 키로 확인 필요: 풀린 번호·생년월일 꼴(하이픈·국가번호 여부). 숫자만 남겨 비교한다.
    const { module: mod } = state;
    let name;
    let phone;
    let birth;
    try {
      name = String(mod.aesDecode("kakao", result.encUsername ?? "")).trim();
      phone = String(mod.aesDecode("kakao", result.encUserphone ?? "")).replace(/\D/g, "");
      birth = String(mod.aesDecode("kakao", result.encUserbirthday ?? "")).replace(/\D/g, "");
    } catch {
      throw new SignerMismatchError("identity_decode");
    }
    const id = tx.identity;
    if (!(sameUtf8(name, id.name) && phone === id.phone && birth === id.birth)) throw new SignerMismatchError("identity");

    // INV-S3: 전자서명문을 직접 검증
    if (typeof result.signedData !== "string" || result.signedData.length === 0) throw new SignatureInvalidError("signed_data_missing");
    const signedData = Buffer.from(result.signedData, "base64");
    let verified;
    try {
      verified = await signedDataLib.verifySignedData({ signedData, anchors, now: new Date(at), ocspPost });
    } catch (err) {
      if (err instanceof signedDataLib.SignedDataError) throw new SignatureInvalidError(err.reason);
      throw new SignatureInvalidError("verify_error");
    }

    // INV-S2: 감싼 틀을 벗긴 원문이 이 거래의 원문과 바이트 단위로 같아야 한다
    const match = unwrapKakaoContent(verified.content).find((c) => sameUtf8(c, tx.plaintext));
    if (match === undefined) throw new PlaintextMismatchError("plaintext");

    const signedAt = verified.signingTime ?? new Date(issued);
    return {
      state: "signed",
      verified: { signedPlaintext: match, signature: result.signedData, signedAt: signedAt.toISOString() },
    };
  }

  async function poll(tx) {
    const { module: mod, anchors } = state;
    const res = await post("auth-result", { userToken: tx.userToken });
    const code = String(res.resultCode);
    if (PENDING_CODES.has(code)) return { state: "pending" };
    if (EXPIRED_CODES.has(code)) return { state: "expired", final: true };
    if (REJECTED_CODES.has(code)) return { state: "rejected", final: true };
    if (code !== "2000") throw new UpstreamError(`auth-result_${code}`);
    if (typeof res.hubToken !== "string" || res.hubToken === "") throw new UpstreamError("auth-result_no_hubtoken");
    let result;
    try {
      result = JSON.parse(mod.getResult(res.hubToken));
    } catch {
      throw new SignatureInvalidError("hubtoken_decode");
    }
    if (result === null || typeof result !== "object") throw new SignatureInvalidError("hubtoken_decode");
    return { ...(await verifyResult(tx, result, anchors)), final: true };
  }

  /**
   * 결과 조회. signed 는 이 안에서 검증을 다 마친 뒤에만 나온다 — 앱 쪽 app.mjs 는 돌려받은 원문을 앱이 보낸 원문과 한 번 더 대조한다.
   * 같은 거래를 동시에 물으면 하나씩 처리한다(hubToken 은 한 번만 나오므로, 동시에 두 번 물어 한쪽이 「만료」를 받지 않게).
   */
  async function fetchResult({ requestId, txId }) {
    requireReady();
    prune(now());
    const tx = transactions.get(txId);
    if (!tx) return { state: "expired" }; // 만료로 지웠거나 재시작으로 사라진 거래
    if (tx.requestId !== requestId) throw new UnknownTransactionError("모르는 거래 번호");

    while (tx.inflight) await tx.inflight.catch(() => {});
    if (tx.final) {
      if (tx.final.error) throw tx.final.error;
      return tx.final.value;
    }
    const run = (async () => {
      try {
        const out = await poll(tx);
        if (out.final) {
          const { final: _f, ...value } = out;
          tx.final = { value };
          tx.identity = null;
          return value;
        }
        return out;
      } catch (err) {
        // 검증 실패는 끝난 결과로 남긴다(hubToken 을 다시 받을 수 없다). 딜러사 연결 오류는 다음 조회에서 다시 묻는다
        if (!(err instanceof UpstreamError)) {
          tx.final = { error: err };
          tx.identity = null;
        }
        throw err;
      }
    })();
    tx.inflight = run;
    try {
      return await run;
    } finally {
      tx.inflight = null;
    }
  }

  return {
    name: "dreamsecurity",
    method: "kakao",
    ready,
    requestSignature,
    fetchResult,
  };
}

module.exports = { createDreamsecurityAdapter, unwrapKakaoContent, parseIssueDate, kstStamp, HOSTS };
