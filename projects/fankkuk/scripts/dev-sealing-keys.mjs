// 개발용 주소 봉인 키 쌍을 만든다(address-protection INV-P12 — 운영에서는 쓰지 않는다).
// - 공개키 → .env.local (앱 서버가 읽어 주소 입력 화면에 넘긴다)
// - 비밀키 → .env.decrypt.local (앱 서버는 이 파일을 읽지 않는다 — 「주소를 여는 키는 송장 출력 함수 한 곳만」.
//   Next 가 읽는 설정 파일은 .env · .env.local · .env.development(.local) 뿐이다)
// 두 파일 모두 저장소 무시 목록(.env.*)에 있다. 이미 있으면 바꾸지 않는다.
// 예전 판이 비밀키를 .env.local 에 넣었으면 그 줄을 .env.decrypt.local 로 옮긴다.
// 송장 출력 함수의 나머지 설정도 같은 복호화 전용 파일에 없으면 넣는다(로컬 전용):
// - DECRYPT_OWNER_USER_ID: 대표 계정 ID(INV-P8 — 시드의 팬꾹 운영 계정)
// - DECRYPT_DB_KEY: 복호화 전용 역할(address_decryptor) DB 토큰 — 로컬 Supabase 의 JWT 비밀로 서명(npx supabase status)
// 실행: node scripts/dev-sealing-keys.mjs   (projects/fankkuk 에서, 로컬 Supabase 가 떠 있어야 DB 토큰을 만든다)

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { execSync } from "node:child_process";

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
} else {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const oneLine = (pem) => JSON.stringify(pem.trim()).slice(1, -1); // 줄바꿈을 \n 으로
  append(APP_FILE, `# 개발용 주소 봉인 공개키 (scripts/dev-sealing-keys.mjs, 운영 금지)\nADDRESS_SEALING_PUBLIC_KEY="${oneLine(publicKey)}"\n`);
  append(DECRYPT_FILE, `# 개발용 주소 복호화 비밀키 — 앱 서버가 읽지 않는 파일 (scripts/dev-sealing-keys.mjs, 운영 금지)\nDEV_ADDRESS_PRIVATE_KEY="${oneLine(privateKey)}"\n`);
  console.log("개발용 키 쌍을 만들었다. 개발 서버를 다시 켜야 공개키가 읽힌다.");
}

// 3) 대표 계정 ID — 시드의 팬꾹 운영(fankkuk_admin). 운영에서는 이 파일 자체를 쓰지 않는다.
if (!/^DECRYPT_OWNER_USER_ID=/m.test(read(DECRYPT_FILE))) {
  append(DECRYPT_FILE, `# 송장 출력 함수의 대표 계정 ID (INV-P8 — 로컬 시드)\nDECRYPT_OWNER_USER_ID=00000000-0000-4000-a000-000000000021\n`);
  console.log("대표 계정 ID 를 넣었다.");
}

// 4) 복호화 전용 역할 DB 토큰 — 로컬 Supabase 의 JWT 비밀로 서명한다. 비밀 값은 화면에 찍지 않는다.
if (!/^DECRYPT_DB_KEY=/m.test(read(DECRYPT_FILE))) {
  const status = execSync("npx supabase status --output env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const secret = /^JWT_SECRET="?([^"\r\n]+)"?/m.exec(status)?.[1];
  const api = /^API_URL="?([^"\r\n]+)"?/m.exec(status)?.[1] ?? "";
  if (!secret || !/^http:\/\/127\.0\.0\.1:\d+$/.test(api)) {
    console.error("로컬 Supabase 를 찾지 못했다 — npx supabase start 뒤 다시 실행한다. DB 토큰은 넣지 않았다.");
    process.exit(1);
  }
  const b64 = (v) => Buffer.from(v).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ role: "address_decryptor", iss: "supabase-demo", iat: now, exp: now + 10 * 365 * 24 * 3600 }));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  append(DECRYPT_FILE, `# 송장 출력 함수의 DB 자격 — 복호화 전용 역할 토큰 (로컬 JWT 비밀로 서명, 운영 금지)\nDECRYPT_DB_KEY=${head}.${body}.${sig}\n`);
  console.log("복호화 전용 역할 DB 토큰을 넣었다.");
}
