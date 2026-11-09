// 가입 휴대폰 번호 변환 — 옛 숫자 번호를 암호문·해시·앞 3자리·뒤 4자리로 바꾸고 숫자를 지운다(signup INV-U18, manual/0028 다음).
// 사람이 돌린다. 순서와 확인 쿼리: docs/ops/phone-encryption-rollout.md
//
// 앱과 같은 암호화 모듈(src/shared/api/phone-crypto/phone-crypto.ts)을 그대로 불러 쓴다 — 따로 베낀 구현이면 앱이 변환된 번호를 못 연다.
// 줄마다 만든 암호문을 바로 풀어 원래 번호와 같은지 확인한 뒤에만 DB 에 쓴다.
// 출력에는 번호를 찍지 않는다 — 건수와(겹칠 때) 계정 ID 만.
//
// 실행: node --env-file=<환경 파일> scripts/phone-encrypt-backfill.mjs [--dry-run]
//   환경 파일에 SUPABASE_URL · SUPABASE_SECRET_KEY(관리자 키) · 번호 키 두 개(앱과 같은 값)가 있어야 한다.
//   --dry-run: 남은 줄 수만 센다(쓰지 않는다).

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { decryptPhone, phoneBundle, phoneHash, readPhoneKeys } from "../src/shared/api/phone-crypto/phone-crypto.ts";

const dryRun = process.argv.includes("--dry-run");
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) {
  // 무엇이 빠졌는지 이름만 알린다(값은 찍지 않는다). 넘긴 파일이 UTF-16 이면 node 가 한 줄도 못 읽으므로 그것도 알린다
  const NEEDED = ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "FANKKUK_PHONE_ENC_KEY", "FANKKUK_PHONE_HASH_KEY"];
  console.error(`읽지 못한 이름: ${NEEDED.filter((n) => !process.env[n]).join(" · ")}`);
  const envArg = process.execArgv.find((a) => a.startsWith("--env-file="));
  if (!envArg) {
    console.error("--env-file=<파일> 을 node 뒤, 스크립트 앞에 넘긴다");
  } else {
    const path = envArg.slice("--env-file=".length);
    try {
      const head = readFileSync(path).subarray(0, 2);
      if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) {
        console.error(`${path} 가 UTF-16 으로 저장돼 있다 — 메모장 「다른 이름으로 저장」에서 인코딩을 UTF-8 로 바꿔 저장한다`);
      } else {
        console.error(`${path} 에 위 이름이 「이름=값」 한 줄로 있는지 본다(앞에 공백·export 없이)`);
      }
    } catch {
      console.error(`${path} 를 열지 못했다 — 지금 폴더(projects/fankkuk) 기준 경로인지 본다`);
    }
  }
  process.exit(2);
}
const keys = readPhoneKeys(process.env);
const db = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function pending(limit) {
  const { data, error } = await db.rpc("phone_backfill_pending", { p_limit: limit });
  if (error) throw new Error(`남은 줄을 읽지 못했다: ${error.code} — 0028 을 먼저 적용했는지 본다`);
  return data ?? [];
}

const counts = { done: 0, skipped: 0, duplicate: 0 };
const duplicates = [];

if (dryRun) {
  const rows = await pending(500);
  console.log(`남은 줄 ${rows.length}${rows.length === 500 ? " 이상" : ""} (쓰지 않음)`);
} else {
  await run();
}

// 끝낼 때 process.exit 를 부르지 않고 exitCode 만 정한다 — 열린 네트워크 연결을 강제로 끊으면
// Windows 의 Node 가 결과를 다 찍은 뒤 「Assertion failed … async.c」로 죽는다(2026-11-09, Node 24)
async function run() {
for (;;) {
  const rows = await pending(100);
  const todo = rows.filter((r) => !duplicates.includes(r.account_id));
  if (todo.length === 0) break;
  for (const row of todo) {
    const bundle = phoneBundle(keys, row.account_id, row.phone);
    const parsed = JSON.parse(bundle);
    if (decryptPhone(keys, row.account_id, parsed.sealed) !== row.phone || parsed.hash !== phoneHash(keys, row.phone)) {
      throw new Error(`암호문 확인 실패 — 계정 ${row.account_id}. 아무것도 쓰지 않고 멈춘다`);
    }
    const { data, error } = await db.rpc("phone_backfill_set", { p_account_id: row.account_id, p_phone: row.phone, p_bundle: bundle });
    if (error) throw new Error(`변환하지 못했다 — 계정 ${row.account_id}: ${error.code}`);
    counts[data] = (counts[data] ?? 0) + 1;
    if (data === "duplicate") duplicates.push(row.account_id);
  }
}

const left = (await pending(500)).length;
console.log(`변환 ${counts.done} · 이미 바뀜 ${counts.skipped} · 겹침 ${counts.duplicate} · 남은 줄 ${left}`);
if (duplicates.length > 0) {
  console.error(`같은 번호가 이미 다른 계정에 있다(변환 전 번호와 같은 번호로 새 가입) — 계정: ${duplicates.join(", ")}. 한 계정의 번호를 지운 뒤 다시 돌린다`);
  process.exitCode = 1;
  return;
}
process.exitCode = left === 0 ? 0 : 1;
}
