// 서명 게이트웨이 진입점. systemd 가 /etc/sign-gateway/sign-gateway.env 를 넣어 실행한다.
//
// TLS_CERT_FILE·TLS_KEY_FILE 이 있으면 https 로 뜬다. 둘 다 없으면 http 로 뜨되,
// 그때는 LISTEN_HOST 가 127.0.0.1 이어야 한다(밖으로 평문을 열지 않는다 — 로컬 시험용).

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { createAdapter } from "./lib/adapters/index.mjs";
import { createHandler } from "./lib/app.mjs";
import { ConfigError, loadConfig } from "./lib/config.mjs";
import { createInvoicePrinters } from "./lib/invoice.mjs";

let config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`설정 오류: ${err.message}`);
    process.exit(78); // EX_CONFIG — systemd 가 재시작을 반복하지 않게 RestartPreventExitStatus 에 걸어 둠
  }
  throw err;
}

const adapter = createAdapter(config);
// 송장 출력 함수 — 설정이 덜 됐거나 묶음 파일(dist/decryptor.mjs)이 없으면 송장 출력만 503 이고 서명 쪽은 그대로 돈다
let invoice;
try {
  invoice = await createInvoicePrinters(config);
} catch (err) {
  invoice = { ready: { ok: false, reason: `송장 출력 함수를 불러오지 못했다 (${err instanceof Error ? err.name : "unknown"})` }, printers: null };
}
const handler = createHandler({ config, adapter, invoice });

let server;
if (config.tlsCertFile && config.tlsKeyFile) {
  server = https.createServer(
    { cert: fs.readFileSync(config.tlsCertFile), key: fs.readFileSync(config.tlsKeyFile), minVersion: "TLSv1.2" },
    handler,
  );
} else {
  if (config.host !== "127.0.0.1") {
    console.error("설정 오류: TLS 인증서 없이 뜰 때는 LISTEN_HOST=127.0.0.1 이어야 한다");
    process.exit(78);
  }
  server = http.createServer(handler);
}

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(config.port, config.host, () => {
  const ready = adapter.ready();
  console.log(
    `sign-gateway listening ${config.host}:${config.port} adapter=${adapter.name} ready=${ready.ok}${ready.ok ? "" : ` (${ready.reason})`}`,
  );
  console.log(`invoice ready=${invoice.ready.ok}${invoice.ready.ok ? "" : ` (${invoice.ready.reason})`}`);
  // 카카오 서명 재검증 준비(INV-P4 a) — 준비 안 됐으면 kakao 서명 주문의 송장은 전부 거부된다
  if (invoice.signatureCheck) {
    console.log(`invoice kakao-signature-check=${invoice.signatureCheck.ok}${invoice.signatureCheck.ok ? "" : ` (${invoice.signatureCheck.reason})`}`);
  }
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
