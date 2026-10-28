// 복호화 전용 역할(address_decryptor)의 DB 토큰을 만들어 서버 환경 변수 DECRYPT_DB_KEY 에 바로 넣는다 (root 로 실행).
//   sudo node /opt/sign-gateway/scripts/set-decrypt-db-key.mjs
//   → Supabase 프로젝트의 JWT 비밀(Settings → API → JWT Settings 의 Legacy JWT secret)을 붙여 넣고 Enter
//
// 비밀과 토큰은 화면에 찍지 않는다. 출력은 만료일뿐이다. 토큰 유효 기간은 365일 — 만료 전에 다시 돌린다.
// 전제: 그 DB 에 복호화 전용 역할이 있어야 한다(supabase/manual/0008·0009·0010 — 사람이 적용하는 SQL).

import { createHmac } from "node:crypto";
import fs from "node:fs";

const ENV_FILE = process.env.SIGN_GATEWAY_ENV_FILE ?? "/etc/sign-gateway/sign-gateway.env"; // 바꿔 끼우는 것은 시험용
const DAYS = 365;

function readSecret() {
  return new Promise((resolve) => {
    process.stdout.write("JWT 비밀을 붙여 넣고 Enter (화면에 보이지 않음): ");
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    let buf = "";
    process.stdin.on("data", (chunk) => {
      for (const ch of chunk.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          if (process.stdin.isTTY) process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.stdin.pause();
          resolve(buf.trim());
          return;
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        buf += ch;
      }
    });
  });
}

const b64url = (v) => Buffer.from(v).toString("base64url");

const secret = await readSecret();
if (secret.length < 32) {
  console.error("JWT 비밀이 너무 짧다 — 다시 확인한다");
  process.exit(1);
}
const now = Math.floor(Date.now() / 1000);
const exp = now + DAYS * 24 * 3600;
const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const body = b64url(JSON.stringify({ role: "address_decryptor", iss: "supabase", iat: now, exp }));
const token = `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;

const lines = fs.readFileSync(ENV_FILE, "utf8").split("\n");
let found = false;
const next = lines.map((line) => {
  if (!line.startsWith("DECRYPT_DB_KEY=")) return line;
  found = true;
  return `DECRYPT_DB_KEY=${token}`;
});
if (!found) next.push(`DECRYPT_DB_KEY=${token}`);
// 원래 파일의 소유·그룹(root:sign-gateway)을 그대로 — 그룹이 바뀌면 서비스가 파일을 못 읽는다
const { uid, gid } = fs.statSync(ENV_FILE);
fs.writeFileSync(`${ENV_FILE}.tmp`, next.join("\n"), { mode: 0o640 });
fs.chownSync(`${ENV_FILE}.tmp`, uid, gid);
fs.renameSync(`${ENV_FILE}.tmp`, ENV_FILE);
console.log(`DECRYPT_DB_KEY 를 넣었다. 만료: ${new Date(exp * 1000).toISOString().slice(0, 10)} — 이제 sudo systemctl restart sign-gateway`);
