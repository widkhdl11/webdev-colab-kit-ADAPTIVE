// 개발용 주소 봉인 키 쌍을 만들어 .env.local 끝에 붙인다(address-protection INV-P12 — 운영에서는 쓰지 않는다).
// 이미 두 이름이 있으면 아무것도 하지 않는다. 비밀키는 이 컴퓨터의 .env.local 에만 남는다(무시 목록에 있는 파일).
// 실행: node scripts/dev-sealing-keys.mjs   (projects/fankkuk 에서)

import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";

const FILE = ".env.local";
const current = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
if (/^ADDRESS_SEALING_PUBLIC_KEY=/m.test(current) && /^DEV_ADDRESS_PRIVATE_KEY=/m.test(current)) {
  console.log("이미 있다 — 바꾸지 않았다.");
  process.exit(0);
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const oneLine = (pem) => JSON.stringify(pem.trim()).slice(1, -1); // 줄바꿈을 \n 으로

appendFileSync(
  FILE,
  `${current.endsWith("\n") || current === "" ? "" : "\n"}# 개발용 주소 봉인 키 쌍 (scripts/dev-sealing-keys.mjs, 운영 금지)\nADDRESS_SEALING_PUBLIC_KEY="${oneLine(publicKey)}"\nDEV_ADDRESS_PRIVATE_KEY="${oneLine(privateKey)}"\n`,
);
console.log("개발용 키 쌍을 .env.local 에 붙였다. 개발 서버를 다시 켜야 읽힌다.");
