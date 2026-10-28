// KMS 자체 시험 — 서버에서 서비스와 같은 계정·환경 변수로 돌린다:
//   sudo bash /opt/sign-gateway/scripts/kms-selftest.sh
//
// 1) 무작위 32바이트(데이터 키 크기)를 공개키로 RSA-OAEP SHA-256 으로 감싸 KMS 에 풀게 한다 → 원문과 같아야 한다
// 2) 같은 값을 SHA-1 방식으로 감싸 RSAES_OAEP_SHA_1 로 풀게 한다 → 정책의 알고리즘 조건에 막혀야 한다(위반을 심어 보는 항목)
// 실패하면 키 정책(IP·알고리즘 조건) → IAM 정책(Resource 의 key/ 포함 여부) 순으로 원인을 짚는다.
//
// 데이터 키·감싼 값·비밀 키는 출력하지 않는다. 출력은 통과/실패와 AWS 오류 이름·원문뿐이다.

import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { loadConfig } from "../lib/config.mjs";
import { KMS_ALGORITHM, KmsError, kmsDecrypt, kmsReady } from "../lib/kms.mjs";

const EXPECTED_IP = "3.34.120.193";
const publicKeyPath = process.argv[2] ?? "/etc/sign-gateway/sealing-public-key.pem";

function callerIp() {
  // 진단 전용: 서비스는 이 주소를 부르지 않는다(허용 목록 밖). 실패해도 시험은 계속한다
  return new Promise((resolve) => {
    https
      .get("https://checkip.amazonaws.com", { timeout: 5000 }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve(body.trim()));
      })
      .on("error", () => resolve("확인 실패"));
  });
}

function keyIdShape(keyId) {
  if (/^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[0-9a-f-]{36}$/.test(keyId)) return "키 ARN";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(keyId)) return "키 ID";
  if (/^alias\//.test(keyId) || /:alias\//.test(keyId)) return "별칭(IAM 정책의 key/ Resource 와 맞지 않을 수 있음)";
  return "알 수 없는 형식";
}

function diagnose(err, ip) {
  const lines = [];
  const msg = err.awsMessage ?? "";
  if (err.type === "AccessDeniedException") {
    const resourceSide = /resource-based policy/i.test(msg);
    const identitySide = /identity-based policy/i.test(msg);
    lines.push("① 키 정책 — IP 조건:");
    lines.push(`   이 서버가 AWS 에 보이는 IP = ${ip} (정책 값 ${EXPECTED_IP}/32 와 ${ip === EXPECTED_IP ? "같음" : "다름 → 키 정책·IAM 정책의 aws:SourceIp 를 고친다"})`);
    lines.push("① 키 정책 — 알고리즘 조건:");
    lines.push(`   이 시험은 ${KMS_ALGORITHM} 로 요청했다. 키 정책의 kms:EncryptionAlgorithm 값이 정확히 이 글자인지 본다`);
    lines.push("   키 정책의 Principal 이 arn:aws:iam::<계정ID>:user/fankkuk-sign-gateway 인지(계정 ID 자리표시를 바꿨는지) 본다");
    lines.push("② IAM 정책 — Resource:");
    lines.push("   arn:aws:kms:ap-northeast-2:<계정ID>:key/<키ID> 꼴이어야 한다. key/ 가 빠졌거나 별칭(alias/)이면 맞지 않는다");
    if (resourceSide) lines.push("→ AWS 원문이 「resource-based policy」 — ① 키 정책 쪽이 막았다");
    else if (identitySide) lines.push("→ AWS 원문이 「identity-based policy」 — ② IAM 정책 쪽이 막았다");
    else if (/explicit deny/i.test(msg)) lines.push("→ AWS 원문이 「explicit deny」 — 어딘가에 Deny 문이 있다(조직 SCP 포함)");
  } else if (["UnrecognizedClientException", "InvalidSignatureException", "IncompleteSignature"].includes(err.type)) {
    lines.push("액세스 키가 틀렸다 — AWS_ACCESS_KEY_ID·AWS_SECRET_ACCESS_KEY 를 다시 붙여 넣는다(앞뒤 공백 포함 여부)");
  } else if (err.type === "NotFoundException") {
    lines.push("키를 못 찾았다 — KMS_KEY_ID 와 리전(서울)을 확인한다");
  } else if (err.type === "InvalidCiphertextException" || err.type === "IncorrectKeyException") {
    lines.push("KMS 가 감싼 값을 못 풀었다 — 공개키 파일이 이 KMS 키에서 내려받은 것이 아니거나, 키 사양이 암호화·해독용 RSA 가 아니다");
  } else if (err.type === "KMSInvalidStateException" || err.type === "DisabledException") {
    lines.push("키가 꺼져 있거나 삭제 예약 상태다");
  } else if (err.type === "NotConfigured") {
    lines.push("환경 변수가 비어 있다");
  }
  return lines;
}

async function main() {
  const config = loadConfig();
  const ready = kmsReady(config.kms);
  console.log(`설정: KMS_KEY_ID 형식 = ${config.kms.keyId ? keyIdShape(config.kms.keyId) : "비어 있음"} · 준비 = ${ready.ok ? "됨" : ready.reason}`);
  if (!ready.ok) process.exit(1);

  const publicKey = crypto.createPublicKey(fs.readFileSync(publicKeyPath));
  const detail = publicKey.asymmetricKeyDetails;
  console.log(`공개키: ${publicKey.asymmetricKeyType} ${detail?.modulusLength ?? "?"}비트 (${publicKeyPath})`);
  const ip = await callerIp();
  console.log(`나가는 IP: ${ip}`);

  const dataKey = crypto.randomBytes(32);
  let failed = false;

  // 1) 맞는 방식은 풀려야 한다
  const wrapped = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, dataKey);
  try {
    const opened = await kmsDecrypt(config.kms, wrapped);
    if (opened.equals(dataKey)) {
      console.log("통과 1/2 — SHA-256 방식으로 감싼 값을 KMS 가 풀었고 원문과 같다");
    } else {
      failed = true;
      console.log("실패 1/2 — KMS 가 풀었지만 원문과 다르다");
    }
  } catch (err) {
    failed = true;
    if (!(err instanceof KmsError)) throw err;
    console.log(`실패 1/2 — ${err.type}: ${err.awsMessage}`);
    for (const line of diagnose(err, ip)) console.log(`   ${line}`);
  }

  // 2) 다른 방식은 정책 조건에 막혀야 한다
  const wrappedSha1 = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha1" }, dataKey);
  try {
    await kmsDecrypt(config.kms, wrappedSha1, { algorithm: "RSAES_OAEP_SHA_1" });
    failed = true;
    console.log("실패 2/2 — SHA-1 방식도 풀렸다: 키 정책·IAM 정책의 kms:EncryptionAlgorithm 조건이 빠졌거나 효과가 없다");
  } catch (err) {
    if (!(err instanceof KmsError)) throw err;
    if (err.type === "AccessDeniedException") {
      console.log("통과 2/2 — SHA-1 방식은 정책 조건에 막혔다(AccessDenied)");
    } else {
      failed = true;
      console.log(`실패 2/2 — 거부는 됐지만 이유가 정책 조건이 아니다: ${err.type}: ${err.awsMessage}`);
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`시험 중단: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
