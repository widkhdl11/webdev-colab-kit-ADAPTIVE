// 개발용 주소 봉인 키 쌍을 만든다(address-protection INV-P12 — 운영에서는 쓰지 않는다).
// - 공개키 → .env.local (앱 서버가 읽어 주소 입력 화면에 넘긴다)
// - 비밀키 → .env.decrypt.local (앱 서버는 이 파일을 읽지 않는다 — 「주소를 여는 키는 송장 출력 함수 한 곳만」.
//   Next 가 읽는 설정 파일은 .env · .env.local · .env.development(.local) 뿐이다)
// 두 파일 모두 저장소 무시 목록(.env.*)에 있다. 이미 있으면 바꾸지 않는다.
// 예전 판이 비밀키를 .env.local 에 넣었으면 그 줄을 .env.decrypt.local 로 옮긴다.
// 실행: node scripts/dev-sealing-keys.mjs   (projects/fankkuk 에서)

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";

const APP_FILE = ".env.local";
const DECRYPT_FILE = ".env.decrypt.local";
const read = (f) => (existsSync(f) ? readFileSync(f, "utf8") : "");
const append = (f, text) => {
  const cur = read(f);
  appendFileSync(f, `${cur === "" || cur.endsWith("\n") ? "" : "\n"}${text}`);
};

// 1) 예전 판이 남긴 비밀키 줄 옮기기
const app = read(APP_FILE);
const privLine = app.split(/\r?\n/).find((l) => l.startsWith("DEV_ADDRESS_PRIVATE_KEY="));
if (privLine) {
  if (!/^DEV_ADDRESS_PRIVATE_KEY=/m.test(read(DECRYPT_FILE))) append(DECRYPT_FILE, `${privLine}\n`);
  writeFileSync(APP_FILE, app.split(/\r?\n/).filter((l) => !l.startsWith("DEV_ADDRESS_PRIVATE_KEY=")).join("\n"));
  console.log("비밀키 줄을 앱 서버 설정에서 복호화 전용 파일로 옮겼다.");
}

// 2) 키 쌍이 없으면 만든다
if (/^ADDRESS_SEALING_PUBLIC_KEY=/m.test(read(APP_FILE)) && /^DEV_ADDRESS_PRIVATE_KEY=/m.test(read(DECRYPT_FILE))) {
  console.log("키 쌍이 이미 있다 — 바꾸지 않았다.");
  process.exit(0);
}
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const oneLine = (pem) => JSON.stringify(pem.trim()).slice(1, -1); // 줄바꿈을 \n 으로
append(APP_FILE, `# 개발용 주소 봉인 공개키 (scripts/dev-sealing-keys.mjs, 운영 금지)\nADDRESS_SEALING_PUBLIC_KEY="${oneLine(publicKey)}"\n`);
append(DECRYPT_FILE, `# 개발용 주소 복호화 비밀키 — 앱 서버가 읽지 않는 파일 (scripts/dev-sealing-keys.mjs, 운영 금지)\nDEV_ADDRESS_PRIVATE_KEY="${oneLine(privateKey)}"\n`);
console.log("개발용 키 쌍을 만들었다. 개발 서버를 다시 켜야 공개키가 읽힌다.");
