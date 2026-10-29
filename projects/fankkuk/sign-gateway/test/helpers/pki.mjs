// 시험용 인증기관·인증서·전자서명문(CMS SignedData)·OCSP 응답 — node crypto 와 게이트웨이의 DER 쓰기로 직접 만든다(openssl 없음).

import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const der = require("../../lib/der.cjs");
const { enc } = der;

const SHA256_RSA = "1.2.840.113549.1.1.11";
const SHA256 = "2.16.840.1.101.3.4.2.1";

const algId = (oid, withNull = true) => (withNull ? enc.seq(enc.oid(oid), enc.null()) : enc.seq(enc.oid(oid)));
const name = (cn) => enc.seq(enc.set(enc.seq(enc.oid("2.5.4.3"), enc.utf8(cn))));
const ext = (oid, critical, value) => enc.seq(enc.oid(oid), ...(critical ? [enc.bool(true)] : []), enc.octet(value));

let serialCounter = 1000;

/**
 * @param {{ cn: string, issuer?: { cn: string, key: crypto.KeyObject }, ca?: boolean, ocspUrl?: string,
 *           notBefore?: Date, notAfter?: Date, eku?: string[], keyType?: "rsa"|"ec" }} opts
 */
export function makeCert(opts) {
  const { publicKey, privateKey } =
    opts.keyType === "ec"
      ? crypto.generateKeyPairSync("ec", { namedCurve: "P-256" })
      : crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const issuerCn = opts.issuer?.cn ?? opts.cn;
  const signKey = opts.issuer?.key ?? privateKey;
  const serial = Buffer.from((serialCounter++).toString(16).padStart(8, "0"), "hex");
  const notBefore = opts.notBefore ?? new Date(Date.now() - 24 * 3600 * 1000);
  const notAfter = opts.notAfter ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);
  const extensions = [];
  if (opts.ca) {
    extensions.push(ext("2.5.29.19", true, enc.seq(enc.bool(true))));
    extensions.push(ext("2.5.29.15", true, enc.tlv(0x03, Buffer.from([0x01, 0x06])))); // keyCertSign·cRLSign
  } else {
    extensions.push(ext("2.5.29.15", true, enc.tlv(0x03, Buffer.from([0x06, 0xc0])))); // digitalSignature·nonRepudiation
  }
  if (opts.ocspUrl) {
    const aia = enc.seq(enc.seq(enc.oid("1.3.6.1.5.5.7.48.1"), enc.implicit(0x86, Buffer.from(opts.ocspUrl, "latin1"))));
    extensions.push(ext("1.3.6.1.5.5.7.1.1", false, aia));
  }
  if (opts.eku) extensions.push(ext("2.5.29.37", false, enc.seq(...opts.eku.map((o) => enc.oid(o)))));
  const tbs = enc.seq(
    enc.explicit(0, enc.smallInt(2)),
    enc.int(serial),
    algId(SHA256_RSA),
    name(issuerCn),
    enc.seq(enc.utcTime(notBefore), enc.utcTime(notAfter)),
    name(opts.cn),
    publicKey.export({ type: "spki", format: "der" }),
    enc.explicit(3, enc.seq(...extensions)),
  );
  // 발급 키가 RSA 라고 가정한다(시험 인증기관은 RSA)
  const signature = crypto.sign("sha256", tbs, signKey);
  const raw = enc.seq(tbs, algId(SHA256_RSA), enc.bitString(signature));
  return { cn: opts.cn, key: privateKey, publicKey, serial, raw, x509: new crypto.X509Certificate(raw), pem: new crypto.X509Certificate(raw).toString() };
}

/** 시험 인증기관 + 서명 인증서(OCSP 주소 포함) */
export function makePki({ ocspUrl = "https://ocsp.kakao.com/ocsp", leafKeyType = "rsa" } = {}) {
  const ca = makeCert({ cn: "Test Kakao CA", ca: true });
  const leaf = makeCert({ cn: "signer", issuer: ca, ocspUrl, keyType: leafKeyType });
  return { ca, leaf };
}

/**
 * CMS SignedData(서명 속성 contentType·signingTime·messageDigest) — base64 가 아니라 DER 바이트.
 * @param {{ content: Buffer, signer: ReturnType<typeof makeCert>, certs?: Buffer[], signingTime?: Date, tamper?: "signature"|"digest" }} opts
 */
export function makeSignedData(opts) {
  const content = opts.content;
  let digest = crypto.createHash("sha256").update(content).digest();
  if (opts.tamper === "digest") digest = crypto.createHash("sha256").update(Buffer.concat([content, Buffer.from("x")])).digest();
  const attrs = [
    enc.seq(enc.oid("1.2.840.113549.1.9.3"), enc.set(enc.oid("1.2.840.113549.1.7.1"))),
    enc.seq(enc.oid("1.2.840.113549.1.9.5"), enc.set(enc.utcTime(opts.signingTime ?? new Date()))),
    enc.seq(enc.oid("1.2.840.113549.1.9.4"), enc.set(enc.octet(digest))),
  ];
  const attrSet = enc.set(...attrs);
  const isEc = opts.signer.publicKey.asymmetricKeyType === "ec";
  let signature = crypto.sign("sha256", attrSet, isEc ? { key: opts.signer.key, dsaEncoding: "der" } : opts.signer.key);
  if (opts.tamper === "signature") {
    signature = Buffer.from(signature);
    signature[signature.length - 5] ^= 0xff;
  }
  const signedAttrs = Buffer.from(attrSet);
  signedAttrs[0] = 0xa0;
  const issuerName = der.parse(opts.signer.raw).children()[0].children()[3].raw;
  const signerInfo = enc.seq(
    enc.smallInt(1),
    enc.seq(issuerName, enc.int(opts.signer.serial)),
    algId(SHA256, false),
    signedAttrs,
    isEc ? algId("1.2.840.10045.4.3.2", false) : algId("1.2.840.113549.1.1.1"),
    enc.octet(signature),
  );
  const certs = opts.certs ?? [opts.signer.raw];
  const signedData = enc.seq(
    enc.smallInt(1),
    enc.set(algId(SHA256, false)),
    enc.seq(enc.oid("1.2.840.113549.1.7.1"), enc.explicit(0, enc.octet(content))),
    enc.tlv(0xa0, Buffer.concat(certs)),
    enc.set(signerInfo),
  );
  return enc.seq(enc.oid("1.2.840.113549.1.7.2"), enc.explicit(0, signedData));
}

/**
 * OCSP 응답 — 요청 바이트에서 CertID 를 그대로 옮겨 답한다.
 * @param {{ request: Buffer, responderKey: crypto.KeyObject, status?: "good"|"revoked"|"unknown", thisUpdate?: Date, nextUpdate?: Date|null }} opts
 */
export function makeOcspResponse(opts) {
  const certId = der.parse(opts.request).children()[0].children()[0].children()[0].children()[0].raw;
  const status = opts.status ?? "good";
  const certStatus =
    status === "good"
      ? Buffer.from([0x80, 0x00])
      : status === "revoked"
        ? enc.tlv(0xa1, enc.generalizedTime(new Date(Date.now() - 3600 * 1000)))
        : Buffer.from([0x82, 0x00]);
  const thisUpdate = opts.thisUpdate ?? new Date(Date.now() - 60 * 1000);
  const nextUpdate = opts.nextUpdate === undefined ? new Date(Date.now() + 3600 * 1000) : opts.nextUpdate;
  const single = enc.seq(
    certId,
    certStatus,
    enc.generalizedTime(thisUpdate),
    ...(nextUpdate ? [enc.explicit(0, enc.generalizedTime(nextUpdate))] : []),
  );
  const tbs = enc.seq(
    enc.explicit(2, enc.octet(Buffer.alloc(20, 1))), // responderID byKey
    enc.generalizedTime(new Date()),
    enc.seq(single),
  );
  const signature = crypto.sign("sha256", tbs, opts.responderKey);
  const basic = enc.seq(tbs, algId(SHA256_RSA), enc.bitString(signature));
  return enc.seq(
    enc.tlv(0x0a, Buffer.from([0])),
    enc.explicit(0, enc.seq(enc.oid("1.3.6.1.5.5.7.48.1.1"), enc.octet(basic))),
  );
}
