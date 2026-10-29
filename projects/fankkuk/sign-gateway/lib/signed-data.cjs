// 전자서명문(PKCS#7 / CMS SignedData) 직접 검증 — 외부 연결 INV-S3.
//
// 하는 일 (하나라도 어긋나면 SignedDataError, 호출하는 쪽이 422 signature_invalid 로 답한다):
//   1. 꼴: ContentInfo(signedData) 안에 서명자 정보가 정확히 하나, 원문(eContent)이 들어 있다
//   2. 서명 속성이 있으면 messageDigest = 원문 해시, contentType = 원문 꼴. 서명 값은 서명 속성을 SET(0x31)으로 다시 붙인 바이트에 대한 것
//      (속성이 없으면 원문 자체에 대한 서명)
//   3. 서명 값을 서명 인증서(전자서명문 안의 인증서 중 서명자 표시와 맞는 것)의 공개키로 crypto.verify
//   4. 인증서 체인: 서명 인증서 → (전자서명문 안의 중간 인증서) → 설정한 카카오 인증기관 인증서. 각 단계 X509Certificate.checkIssued·verify,
//      위쪽은 CA 표시가 있어야 하고, 모든 인증서가 지금 유효 기간 안
//   5. 폐기 여부: 서명 인증서의 OCSP 주소(AIA)로 묻는다. 주소가 없거나 허용 목록 밖이거나(https 만), 답이 서명 검증에 실패하거나,
//      「정상(good)」이 아니면 거부(fail closed). 중간 인증서의 폐기 여부는 묻지 않는다(테스트 키로 체인 깊이를 본 뒤 정한다).
//
// 받는 알고리즘: 해시 SHA-256/384/512 · 서명 RSA PKCS#1 v1.5 · RSA-PSS · ECDSA. SHA-1 은 받지 않는다(OCSP 의 CertID 해시만 예외 —
// RFC 5019 가 SHA-1 을 기본으로 정해 응답기 대부분이 그것만 안다. 서명 강도와는 관계없는 조회 열쇠다).

"use strict";

const crypto = require("node:crypto");
const der = require("./der.cjs");

class SignedDataError extends Error {
  /** @param {string} reason 로그에 남기는 짧은 이유 코드 — 원문·이름·번호는 넣지 않는다 */
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const OID = Object.freeze({
  signedData: "1.2.840.113549.1.7.2",
  data: "1.2.840.113549.1.7.1",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  rsaEncryption: "1.2.840.113549.1.1.1",
  rsaPss: "1.2.840.113549.1.1.10",
  mgf1: "1.2.840.113549.1.1.8",
  subjectKeyIdentifier: "2.5.29.14",
  keyUsage: "2.5.29.15",
  ocspBasic: "1.3.6.1.5.5.7.48.1.1",
  ocspSigning: "1.3.6.1.5.5.7.3.9",
  sha1: "1.3.14.3.2.26",
});

const DIGESTS = Object.freeze({
  "2.16.840.1.101.3.4.2.1": "sha256",
  "2.16.840.1.101.3.4.2.2": "sha384",
  "2.16.840.1.101.3.4.2.3": "sha512",
});

// 서명 알고리즘 → { kind, hash } (hash 가 null 이면 따로 적힌 해시 알고리즘을 쓴다)
const SIGNATURES = Object.freeze({
  [OID.rsaEncryption]: { kind: "rsa", hash: null },
  "1.2.840.113549.1.1.11": { kind: "rsa", hash: "sha256" },
  "1.2.840.113549.1.1.12": { kind: "rsa", hash: "sha384" },
  "1.2.840.113549.1.1.13": { kind: "rsa", hash: "sha512" },
  "1.2.840.10045.4.3.2": { kind: "ec", hash: "sha256" },
  "1.2.840.10045.4.3.3": { kind: "ec", hash: "sha384" },
  "1.2.840.10045.4.3.4": { kind: "ec", hash: "sha512" },
  [OID.rsaPss]: { kind: "pss", hash: null },
});

function fail(reason) {
  return new SignedDataError(reason);
}

function guard(fn, reason) {
  try {
    return fn();
  } catch (err) {
    if (err instanceof SignedDataError) throw err;
    throw fail(reason);
  }
}

/** AlgorithmIdentifier SEQUENCE → { oid, params } */
function readAlg(node) {
  const [oidNode, params] = der.expect(node, 0x30, "알고리즘").children();
  return { oid: der.readOid(oidNode), params: params ?? null };
}

function digestName(alg) {
  const name = DIGESTS[alg.oid];
  if (!name) throw fail("digest_unsupported");
  return name;
}

/** 서명 알고리즘과 (있으면) 해시 알고리즘으로 crypto.verify 인자를 만든다 */
function verifyArgs(sigAlg, digestAlg, key) {
  const spec = SIGNATURES[sigAlg.oid];
  if (!spec) throw fail("signature_alg_unsupported");
  if (spec.kind === "pss") {
    if (key.asymmetricKeyType !== "rsa" && key.asymmetricKeyType !== "rsa-pss") throw fail("key_type_mismatch");
    // RSASSA-PSS-params: [0] hashAlgorithm(기본 SHA-1 — 받지 않음) [1] maskGen [2] saltLength(기본 20)
    let hash = null;
    let saltLength = 20;
    let mgfHash = null;
    for (const p of sigAlg.params ? sigAlg.params.children() : []) {
      if (p.tag === 0xa0) hash = digestName(readAlg(p.children()[0]));
      else if (p.tag === 0xa1) {
        const mgf = readAlg(p.children()[0]);
        if (mgf.oid !== OID.mgf1 || !mgf.params) throw fail("pss_mgf_unsupported");
        mgfHash = digestName(readAlg(mgf.params));
      } else if (p.tag === 0xa2) saltLength = Number.parseInt(der.intBytes(der.expect(p.children()[0], 0x02, "salt").content).toString("hex"), 16);
    }
    if (!hash) throw fail("digest_unsupported");
    if (mgfHash !== hash) throw fail("pss_mgf_unsupported");
    return { hash, options: { key, padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength } };
  }
  const hash = spec.hash ?? (digestAlg ? digestName(digestAlg) : null);
  if (!hash) throw fail("digest_unsupported");
  if (digestAlg && spec.hash && digestName(digestAlg) !== spec.hash) throw fail("digest_mismatch");
  if (spec.kind === "rsa" && key.asymmetricKeyType !== "rsa") throw fail("key_type_mismatch");
  if (spec.kind === "ec" && key.asymmetricKeyType !== "ec") throw fail("key_type_mismatch");
  return { hash, options: spec.kind === "ec" ? { key, dsaEncoding: "der" } : { key } };
}

function verifyWith(sigAlg, digestAlg, key, data, signature) {
  const { hash, options } = verifyArgs(sigAlg, digestAlg, key);
  return crypto.verify(hash, data, options, signature);
}

// ── 인증서 안쪽 (X509Certificate 가 주지 않는 것만 직접 읽는다) ─────────────

function certParts(x509) {
  return guard(() => {
    const [tbs] = der.parse(x509.raw).children();
    const fields = tbs.children();
    let i = fields[0].tag === 0xa0 ? 1 : 0; // version
    const serial = der.expect(fields[i++], 0x02, "일련번호");
    i++; // signature
    const issuer = der.expect(fields[i++], 0x30, "발급자");
    i++; // validity
    const subject = der.expect(fields[i++], 0x30, "주체");
    const spki = der.expect(fields[i++], 0x30, "공개키");
    const extensions = new Map();
    for (const f of fields.slice(i)) {
      if (f.tag !== 0xa3) continue;
      for (const ext of f.children()[0].children()) {
        const parts = ext.children();
        const value = parts[parts.length - 1];
        extensions.set(der.readOid(parts[0]), der.expect(value, 0x04, "확장 값").content);
      }
    }
    const keyBits = der.expect(spki.children()[1], 0x03, "공개키 비트");
    return { serial: serial.content, issuer: issuer.raw, subject: subject.raw, publicKeyBits: keyBits.content.subarray(1), extensions };
  }, "certificate_malformed");
}

function parseCertificate(raw) {
  return guard(() => new crypto.X509Certificate(raw), "certificate_malformed");
}

/** PEM 묶음(여러 장 가능) → X509Certificate[] */
function parsePemBundle(text) {
  const blocks = String(text).match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((b) => new crypto.X509Certificate(b));
}

function withinValidity(x509, now) {
  return new Date(x509.validFrom).getTime() <= now.getTime() && now.getTime() <= new Date(x509.validTo).getTime();
}

/** KeyUsage 확장이 있으면 digitalSignature(0번) 또는 nonRepudiation(1번)이 켜져 있어야 한다 */
function allowsSigning(parts) {
  const ku = parts.extensions.get(OID.keyUsage);
  if (!ku) return true;
  const bits = der.parse(ku);
  if (bits.tag !== 0x03 || bits.content.length < 2) return false;
  return (bits.content[1] & 0xc0) !== 0;
}

// ── SignedData ──────────────────────────────────────────

function readEContent(node) {
  // [0] EXPLICIT OCTET STRING — 조각으로 나뉜(constructed) OCTET STRING 도 이어 붙인다
  const inner = node.children()[0];
  if (inner.tag === 0x04) return Buffer.from(inner.content);
  if (inner.tag === 0x24) return Buffer.concat(inner.children().map((c) => der.expect(c, 0x04, "원문 조각").content));
  throw fail("content_malformed");
}

function parseSignedData(input) {
  return guard(() => {
    const [typeNode, wrapped] = der.expect(der.parse(input), 0x30, "ContentInfo").children();
    if (der.readOid(typeNode) !== OID.signedData) throw fail("not_signed_data");
    const sd = der.expect(wrapped, 0xa0, "SignedData").children()[0];
    const fields = der.expect(sd, 0x30, "SignedData").children();
    let i = 1; // version
    i++; // digestAlgorithms
    const [eTypeNode, eContentNode] = der.expect(fields[i++], 0x30, "encapContentInfo").children();
    const eContentType = der.readOid(eTypeNode);
    if (!eContentNode) throw fail("detached_content"); // 원문을 담지 않은 서명은 받지 않는다(PlainText 서명은 원문을 담는다)
    const content = readEContent(eContentNode);
    const certs = [];
    while (fields[i] && (fields[i].tag === 0xa0 || fields[i].tag === 0xa1)) {
      if (fields[i].tag === 0xa0) for (const c of fields[i].children()) if (c.tag === 0x30) certs.push(parseCertificate(c.raw));
      i++;
    }
    const signerInfos = der.expect(fields[i], 0x31, "signerInfos").children();
    if (signerInfos.length !== 1) throw fail("signer_count");
    const si = signerInfos[0].children();
    let j = 1; // version
    const sid = si[j++];
    const digestAlg = readAlg(si[j++]);
    let signedAttrs = null;
    if (si[j].tag === 0xa0) signedAttrs = si[j++];
    const signatureAlg = readAlg(si[j++]);
    const signature = der.expect(si[j++], 0x04, "서명 값").content;
    return { eContentType, content, certs, sid, digestAlg, signedAttrs, signatureAlg, signature };
  }, "signed_data_malformed");
}

function findSigner(sid, certs) {
  for (const cert of certs) {
    const parts = certParts(cert);
    if (sid.tag === 0x30) {
      const [issuer, serial] = sid.children();
      if (issuer.raw.equals(parts.issuer) && der.intBytes(serial.content).equals(der.intBytes(parts.serial))) return { cert, parts };
    } else if (sid.tag === 0x80) {
      const ski = parts.extensions.get(OID.subjectKeyIdentifier);
      if (ski && der.parse(ski).content.equals(sid.content)) return { cert, parts };
    }
  }
  throw fail("signer_certificate_missing");
}

function readAttributes(signedAttrs) {
  const attrs = new Map();
  for (const attr of signedAttrs.children()) {
    const [oidNode, values] = attr.children();
    const oid = der.readOid(oidNode);
    if (attrs.has(oid)) throw fail("attribute_duplicate");
    const list = der.expect(values, 0x31, "속성 값").children();
    if (list.length !== 1) throw fail("attribute_value_count");
    attrs.set(oid, list[0]);
  }
  return attrs;
}

/**
 * 서명 값·서명 속성을 검증하고 원문을 꺼낸다(체인·폐기 여부는 verifyCertificatePath 에서).
 * @returns {{ content: Buffer, signer: import("node:crypto").X509Certificate, certs: import("node:crypto").X509Certificate[], signingTime: Date|null }}
 */
function verifySignature(input) {
  const sd = parseSignedData(input);
  const { cert, parts } = findSigner(sd.sid, sd.certs);
  if (!allowsSigning(parts)) throw fail("key_usage");
  const hash = digestName(sd.digestAlg);
  let signedBytes = sd.content;
  let signingTime = null;
  if (sd.signedAttrs) {
    const attrs = guard(() => readAttributes(sd.signedAttrs), "attributes_malformed");
    const md = attrs.get(OID.messageDigest);
    if (!md || md.tag !== 0x04) throw fail("message_digest_missing");
    const actual = crypto.createHash(hash).update(sd.content).digest();
    if (!actual.equals(md.content)) throw fail("message_digest_mismatch");
    const ct = attrs.get(OID.contentType);
    if (!ct || guard(() => der.readOid(ct), "attributes_malformed") !== sd.eContentType) throw fail("content_type_mismatch");
    const st = attrs.get(OID.signingTime);
    if (st) signingTime = guard(() => der.readTime(st), "attributes_malformed");
    // 서명은 [0] IMPLICIT 로 붙은 속성을 SET OF 로 다시 인코딩한 바이트에 대한 것 — 태그 한 바이트만 0x31 로 바뀐다
    signedBytes = Buffer.from(sd.signedAttrs.raw);
    signedBytes[0] = 0x31;
  }
  const ok = guard(() => verifyWith(sd.signatureAlg, sd.digestAlg, cert.publicKey, signedBytes, sd.signature), "signature_check_error");
  if (!ok) throw fail("signature_mismatch");
  return { content: sd.content, signer: cert, certs: sd.certs, signingTime };
}

/**
 * 서명 인증서에서 설정한 인증기관 인증서까지 이어지는지, 모두 유효 기간 안인지 본다.
 * @returns {import("node:crypto").X509Certificate} 서명 인증서를 발급한 인증서(OCSP 에 쓴다)
 */
function verifyChain(leaf, intermediates, anchors, now) {
  if (anchors.length === 0) throw fail("no_trust_anchor");
  const issuedBy = (child, parent) => {
    try {
      return child.checkIssued(parent) && child.verify(parent.publicKey);
    } catch {
      return false;
    }
  };
  let current = leaf;
  let leafIssuer = null;
  for (let depth = 0; depth < 6; depth++) {
    if (!withinValidity(current, now)) throw fail(depth === 0 ? "certificate_expired" : "chain_certificate_expired");
    const anchor = anchors.find((a) => issuedBy(current, a));
    if (anchor) {
      if (!anchor.ca || !withinValidity(anchor, now)) throw fail("trust_anchor_invalid");
      return leafIssuer ?? anchor;
    }
    const next = intermediates.find((c) => c !== current && !c.raw.equals(current.raw) && issuedBy(current, c));
    if (!next || !next.ca) throw fail("chain_untrusted");
    if (!leafIssuer) leafIssuer = next;
    current = next;
  }
  throw fail("chain_too_long");
}

// ── OCSP (RFC 6960) ─────────────────────────────────────

function certId(leafParts, issuerParts) {
  const sha1 = (b) => crypto.createHash("sha1").update(b).digest();
  return der.enc.seq(
    der.enc.seq(der.enc.oid(OID.sha1), der.enc.null()),
    der.enc.octet(sha1(issuerParts.subject)),
    der.enc.octet(sha1(issuerParts.publicKeyBits)),
    der.enc.int(der.intBytes(leafParts.serial)),
  );
}

function buildOcspRequest(leaf, issuer) {
  const id = certId(certParts(leaf), certParts(issuer));
  return der.enc.seq(der.enc.seq(der.enc.seq(der.enc.seq(id))));
}

/** OCSP 주소 — 인증서 AIA 의 OCSP 항목 */
function ocspUrls(leaf) {
  const info = leaf.infoAccess ?? "";
  return [...info.matchAll(/^OCSP - URI:(\S+)$/gm)].map((m) => m[1]);
}

function verifyOcspResponse(body, leaf, issuer, now) {
  const leafParts = certParts(leaf);
  const issuerParts = certParts(issuer);
  return guard(() => {
    const [status, bytes] = der.expect(der.parse(body), 0x30, "OCSPResponse").children();
    if (status.tag !== 0x0a || status.content.length !== 1 || status.content[0] !== 0) throw fail("ocsp_status");
    const [typeNode, octets] = der.expect(bytes, 0xa0, "responseBytes").children()[0].children();
    if (der.readOid(typeNode) !== OID.ocspBasic) throw fail("ocsp_type");
    const basic = der.parse(der.expect(octets, 0x04, "response").content).children();
    const [tbs, sigAlgNode, sigNode, certsNode] = basic;
    const sigAlg = readAlg(sigAlgNode);
    const signature = der.expect(sigNode, 0x03, "OCSP 서명").content.subarray(1);

    // 응답 서명: 발급 인증기관 자신, 또는 그 인증기관이 발급한 OCSP 전용 인증서(EKU id-kp-OCSPSigning)
    const signers = [issuer];
    if (certsNode && certsNode.tag === 0xa0) {
      for (const c of certsNode.children()[0].children()) {
        const responder = parseCertificate(c.raw);
        const delegated =
          responder.checkIssued(issuer) &&
          responder.verify(issuer.publicKey) &&
          withinValidity(responder, now) &&
          (responder.keyUsage ?? []).includes(OID.ocspSigning);
        if (delegated) signers.push(responder);
      }
    }
    const signed = signers.some((s) => {
      try {
        return verifyWith(sigAlg, null, s.publicKey, tbs.raw, signature);
      } catch {
        return false;
      }
    });
    if (!signed) throw fail("ocsp_signature");

    const fields = tbs.children();
    let i = fields[0].tag === 0xa0 ? 1 : 0;
    i++; // responderID
    i++; // producedAt
    const responses = der.expect(fields[i], 0x30, "responses").children();
    const wanted = certId(leafParts, issuerParts);
    for (const single of responses) {
      const parts = single.children();
      const [, nameHash, keyHash, serial] = parts[0].children();
      const [, wNameHash, wKeyHash, wSerial] = der.parse(wanted).children();
      if (!der.intBytes(serial.content).equals(der.intBytes(wSerial.content))) continue;
      if (!nameHash.content.equals(wNameHash.content) || !keyHash.content.equals(wKeyHash.content)) continue;
      const certStatus = parts[1];
      if (certStatus.tag === 0xa1) throw fail("certificate_revoked");
      if (certStatus.tag !== 0x80) throw fail("ocsp_status_unknown");
      const thisUpdate = der.readTime(parts[2]);
      const next = parts.slice(3).find((p) => p.tag === 0xa0);
      const skew = 5 * 60 * 1000;
      if (thisUpdate.getTime() > now.getTime() + skew) throw fail("ocsp_not_yet_valid");
      if (next) {
        if (der.readTime(next.children()[0]).getTime() + skew < now.getTime()) throw fail("ocsp_stale");
      } else if (now.getTime() - thisUpdate.getTime() > 24 * 60 * 60 * 1000) {
        throw fail("ocsp_stale");
      }
      return true;
    }
    throw fail("ocsp_no_matching_response");
  }, "ocsp_malformed");
}

/**
 * 폐기 여부 — 묻지 못하면 거부한다.
 * @param {(url: string, body: Buffer) => Promise<Buffer>} post 허용 목록을 거치는 요청(목록 밖·http 면 예외)
 */
async function checkRevocation(leaf, issuer, now, post) {
  const urls = ocspUrls(leaf);
  if (urls.length === 0) throw fail("ocsp_url_missing");
  const request = buildOcspRequest(leaf, issuer);
  let lastReason = "ocsp_unreachable";
  for (const url of urls) {
    let body;
    try {
      body = await post(url, request);
    } catch {
      lastReason = "ocsp_unreachable"; // 허용 목록 밖·http 주소·연결 실패 모두 여기 — 묻지 못했으니 거부
      continue;
    }
    verifyOcspResponse(body, leaf, issuer, now);
    return;
  }
  throw fail(lastReason);
}

/**
 * 전부: 서명 값 → 체인 → 폐기 여부.
 * @param {{ signedData: Buffer, anchors: import("node:crypto").X509Certificate[], now: Date, ocspPost: (url: string, body: Buffer) => Promise<Buffer> }} input
 */
async function verifySignedData({ signedData, anchors, now, ocspPost }) {
  const result = verifySignature(signedData);
  const intermediates = result.certs.filter((c) => c !== result.signer);
  const issuer = verifyChain(result.signer, intermediates, anchors, now);
  await checkRevocation(result.signer, issuer, now, ocspPost);
  return { content: result.content, signingTime: result.signingTime };
}

module.exports = {
  SignedDataError,
  OID,
  verifySignedData,
  verifySignature,
  verifyChain,
  checkRevocation,
  buildOcspRequest,
  verifyOcspResponse,
  parsePemBundle,
  certParts,
};
