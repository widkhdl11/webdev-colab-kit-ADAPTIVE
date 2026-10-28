// 시험 어댑터 — 드림시큐리티 명세가 오기 전에 게이트웨이 흐름을 끝까지 돌리기 위한 가짜 서명 창구.
//
// 프로세스가 뜰 때 Ed25519 키 쌍을 만들고 그 키로 서명한다. 돌려주는 서명 방식은 항상 "fake" 라서
// 앱 쪽 DB 는 가짜 서명 허용 줄이 없는 운영 DB 에서 이 결과를 받지 않는다(승인 서명 INV-S11).
//
// signer.outcome 으로 결과를 고를 수 있다(시험용):
//   signed(기본) · pending · rejected · expired · tampered(다른 원문에 서명) · badsig(서명 값 훼손)

import crypto from "node:crypto";
import { SignatureInvalidError, UnknownTransactionError } from "./errors.mjs";

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;
const OUTCOMES = new Set(["signed", "pending", "rejected", "expired", "tampered", "badsig"]);

export function createTestAdapter() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  /** @type {Map<string, { requestId: string, plaintext: string, subjectId: string, outcome: string, createdAt: number }>} */
  const transactions = new Map();

  function prune(now) {
    for (const [txId, tx] of transactions) {
      if (now - tx.createdAt > TTL_MS) transactions.delete(txId);
    }
    while (transactions.size >= MAX_ENTRIES) {
      transactions.delete(transactions.keys().next().value);
    }
  }

  return {
    name: "test",
    method: "fake",

    ready() {
      return { ok: true };
    },

    async requestSignature({ requestId, plaintext, signer }) {
      const subjectId = typeof signer?.subjectId === "string" ? signer.subjectId : "";
      if (!subjectId || subjectId.length > 128) throw new TypeError("signer.subjectId 가 필요하다");
      const outcome = signer.outcome ?? "signed";
      if (!OUTCOMES.has(outcome)) throw new TypeError("signer.outcome 이 올바르지 않다");
      const now = Date.now();
      prune(now);
      const txId = `test_${crypto.randomUUID()}`;
      transactions.set(txId, { requestId, plaintext, subjectId, outcome, createdAt: now });
      return { txId, expiresAt: new Date(now + TTL_MS).toISOString() };
    },

    async fetchResult({ requestId, txId }) {
      const tx = transactions.get(txId);
      if (!tx || tx.requestId !== requestId) throw new UnknownTransactionError("모르는 거래 번호");
      if (tx.outcome === "pending" || tx.outcome === "rejected" || tx.outcome === "expired") {
        return { state: tx.outcome };
      }
      const signedPlaintext = tx.outcome === "tampered" ? `${tx.plaintext}#tampered` : tx.plaintext;
      let signature = crypto.sign(null, Buffer.from(signedPlaintext, "utf8"), privateKey);
      if (tx.outcome === "badsig") {
        signature = Buffer.from(signature);
        signature[0] ^= 0xff;
      }
      return {
        state: "signed",
        raw: {
          signedPlaintext,
          signature: signature.toString("base64"),
          certificate: publicKeyPem,
          subjectId: tx.subjectId,
        },
      };
    },

    /** 서명 값을 직접 검증한다. 원문과 서명자는 검증한 값에서만 꺼낸다. */
    async verify(raw) {
      const ok = crypto.verify(
        null,
        Buffer.from(raw.signedPlaintext, "utf8"),
        publicKey,
        Buffer.from(raw.signature, "base64"),
      );
      if (!ok) throw new SignatureInvalidError("서명 값이 원문과 맞지 않는다");
      return {
        signedPlaintext: raw.signedPlaintext,
        signerId: `fake:${raw.subjectId}`,
        signature: raw.signature,
        certificate: raw.certificate,
      };
    },
  };
}
