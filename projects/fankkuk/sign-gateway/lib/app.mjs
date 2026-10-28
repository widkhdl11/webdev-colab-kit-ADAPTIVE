// 요청 처리. Vercel 앱 서버만 부른다 — Authorization: Bearer <GATEWAY_TOKEN>.
//
//   GET  /healthz                              토큰 없이. 살아 있는지만(어댑터 상태는 밖에 알리지 않는다 — 로그에 있다).
//   POST /v1/sign/requests                     { requestId, plaintext, signer } → { txId, expiresAt }
//   POST /v1/sign/requests/:requestId/result   { txId, plaintext }  → { state, ... }
//
// 결과 조회에서 state 가 signed 이면 어댑터가 서명 값을 직접 검증하고(외부 연결 INV-S3),
// 검증된 서명의 원문이 앱이 보낸 원문과 바이트 단위로 같을 때만 돌려준다(승인 서명 INV-S2 의 이중 확인).
// 같지 않으면 409. 앱 서버는 돌려받은 원문을 자기가 저장한 원문과 다시 대조한다 — 여기서 맞췄다고 건너뛰지 않는다.
//
// 로그에는 원문·서명·서명자 정보를 남기지 않는다. 경로·상태 코드·걸린 시간만.

import crypto from "node:crypto";
import { AdapterNotReadyError, SignatureInvalidError, UnknownTransactionError } from "./adapters/errors.mjs";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_PLAINTEXT_LENGTH = 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const RESULT_PATH = /^\/v1\/sign\/requests\/([A-Za-z0-9_-]{1,128})\/result$/;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function digest(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

export function tokenMatches(header, tokens) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const given = digest(header.slice("Bearer ".length));
  // 길이를 같게 만든 뒤 비교해 응답 시간으로 토큰을 추측하지 못하게 한다
  let matched = false;
  for (const token of tokens) {
    if (crypto.timingSafeEqual(given, digest(token))) matched = true;
  }
  return matched;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers["content-type"] ?? "";
    if (!type.startsWith("application/json")) {
      reject(new HttpError(415, "json_only"));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error();
        resolve(body);
      } catch {
        reject(new HttpError(400, "invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function requireString(body, name, pattern, maxLength) {
  const value = body[name];
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new HttpError(400, `invalid_${name}`);
  }
  if (pattern && !pattern.test(value)) throw new HttpError(400, `invalid_${name}`);
  return value;
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "strict-transport-security": "max-age=31536000",
  });
  res.end(body);
}

export function createHandler({ config, adapter, log = console.log }) {
  async function route(req) {
    const url = new URL(req.url ?? "/", "https://gateway.invalid");
    const path = url.pathname;

    if (req.method === "GET" && path === "/healthz") {
      return [200, { ok: true }];
    }

    if (!tokenMatches(req.headers.authorization, config.tokens)) throw new HttpError(401, "unauthorized");
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");

    if (path === "/v1/sign/requests") {
      const body = await readJson(req);
      const requestId = requireString(body, "requestId", ID_PATTERN, 128);
      const plaintext = requireString(body, "plaintext", null, MAX_PLAINTEXT_LENGTH);
      if (body.signer === null || typeof body.signer !== "object" || Array.isArray(body.signer)) {
        throw new HttpError(400, "invalid_signer");
      }
      let result;
      try {
        result = await adapter.requestSignature({ requestId, plaintext, signer: body.signer });
      } catch (err) {
        if (err instanceof TypeError) throw new HttpError(400, "invalid_signer");
        throw err;
      }
      return [201, { requestId, txId: result.txId, expiresAt: result.expiresAt }];
    }

    const match = path.match(RESULT_PATH);
    if (match) {
      const requestId = match[1];
      const body = await readJson(req);
      const txId = requireString(body, "txId", ID_PATTERN, 128);
      const plaintext = requireString(body, "plaintext", null, MAX_PLAINTEXT_LENGTH);

      const fetched = await adapter.fetchResult({ requestId, txId });
      if (fetched.state !== "signed") return [200, { requestId, state: fetched.state }];

      const verified = await adapter.verify(fetched.raw);
      const same = Buffer.from(verified.signedPlaintext, "utf8").equals(Buffer.from(plaintext, "utf8"));
      if (!same) throw new HttpError(409, "plaintext_mismatch");

      return [
        200,
        {
          requestId,
          state: "signed",
          method: adapter.method,
          signedPlaintext: verified.signedPlaintext,
          signerId: verified.signerId,
          signature: verified.signature,
          certificate: verified.certificate,
        },
      ];
    }

    throw new HttpError(404, "not_found");
  }

  return async function handle(req, res) {
    const started = Date.now();
    let status = 500;
    try {
      const [s, payload] = await route(req);
      status = s;
      send(res, status, payload);
    } catch (err) {
      let code = "internal_error";
      if (err instanceof HttpError) {
        status = err.status;
        code = err.code;
      } else if (err instanceof AdapterNotReadyError) {
        status = 503;
        code = "adapter_not_ready";
      } else if (err instanceof SignatureInvalidError) {
        status = 422;
        code = "signature_invalid";
      } else if (err instanceof UnknownTransactionError) {
        status = 404;
        code = "unknown_transaction";
      } else {
        status = 500;
        log(`error ${err instanceof Error ? err.name : "unknown"}`);
      }
      if (!res.headersSent) send(res, status, { error: code });
    } finally {
      const path = (req.url ?? "").split("?")[0].replace(RESULT_PATH, "/v1/sign/requests/:id/result");
      log(`${req.method} ${path} ${status} ${Date.now() - started}ms`);
    }
  };
}
