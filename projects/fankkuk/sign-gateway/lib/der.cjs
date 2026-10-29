// DER 읽기·쓰기 — 전자서명문(PKCS#7)·인증서·OCSP 를 직접 여는 데 쓴다. 외부 패키지 없음.
//
// 읽기는 정해진 길이(definite length)만 받는다. 길이를 정하지 않은 BER(0x80)은 거부한다 — 서명 검증의 입력은
// 애매한 꼴을 받아 주지 않는 편이 안전하다. 카카오 전자서명문이 그 꼴로 오면 테스트 키로 확인할 때 드러난다.

"use strict";

class DerError extends Error {}

/**
 * @typedef {{ tag: number, cls: number, constructed: boolean, number: number, content: Buffer, raw: Buffer, children: () => DerNode[] }} DerNode
 */

function readNode(buf, offset) {
  if (offset + 2 > buf.length) throw new DerError("짧다");
  const tag = buf[offset];
  if ((tag & 0x1f) === 0x1f) throw new DerError("큰 태그 번호는 받지 않는다");
  let pos = offset + 1;
  let length = buf[pos++];
  if (length === 0x80) throw new DerError("길이를 정하지 않은 꼴은 받지 않는다");
  if (length & 0x80) {
    const n = length & 0x7f;
    if (n > 4 || pos + n > buf.length) throw new DerError("길이 칸이 이상하다");
    length = 0;
    for (let i = 0; i < n; i++) length = length * 256 + buf[pos++];
  }
  const end = pos + length;
  if (end > buf.length) throw new DerError("길이가 넘친다");
  const content = buf.subarray(pos, end);
  const constructed = (tag & 0x20) !== 0;
  let cached = null;
  return {
    node: {
      tag,
      cls: tag >> 6,
      constructed,
      number: tag & 0x1f,
      content,
      raw: buf.subarray(offset, end),
      children() {
        if (!constructed) throw new DerError("단순 값에는 안이 없다");
        if (!cached) cached = readAll(content);
        return cached;
      },
    },
    end,
  };
}

function readAll(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    const { node, end } = readNode(buf, pos);
    out.push(node);
    pos = end;
  }
  return out;
}

/** 버퍼 전체가 값 하나여야 한다(뒤에 남는 바이트가 있으면 거부). */
function parse(buf) {
  const { node, end } = readNode(buf, 0);
  if (end !== buf.length) throw new DerError("뒤에 남는 바이트가 있다");
  return node;
}

function expect(node, tag, what) {
  if (!node || node.tag !== tag) throw new DerError(`${what} 자리가 아니다`);
  return node;
}

function decodeOid(content) {
  if (content.length === 0) throw new DerError("빈 OID");
  const parts = [];
  let value = 0;
  for (const b of content) {
    value = value * 128 + (b & 0x7f);
    if (!(b & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  const first = parts.shift();
  const a = first < 80 ? Math.floor(first / 40) : 2;
  return [a, first - a * 40, ...parts].join(".");
}

function readOid(node) {
  return decodeOid(expect(node, 0x06, "OID").content);
}

/** UTCTime(0x17)·GeneralizedTime(0x18) → Date */
function readTime(node) {
  const s = node.content.toString("latin1");
  let m;
  if (node.tag === 0x17 && (m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s))) {
    const y = Number(m[1]);
    return new Date(Date.UTC(y >= 50 ? 1900 + y : 2000 + y, m[2] - 1, m[3], m[4], m[5], m[6]));
  }
  if (node.tag === 0x18 && (m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3})\d*)?Z$/.exec(s))) {
    const ms = m[7] ? Number(m[7].padEnd(3, "0")) : 0;
    return new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5], m[6], ms));
  }
  throw new DerError("시각 꼴이 아니다");
}

/** 정수 내용의 앞 0x00 을 떼어 비교용 바이트로 */
function intBytes(content) {
  let i = 0;
  while (i < content.length - 1 && content[i] === 0) i++;
  return content.subarray(i);
}

// ── 쓰기 ──────────────────────────────────────────────

function encodeLength(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag, content) {
  const c = Buffer.isBuffer(content) ? content : Buffer.concat(content);
  return Buffer.concat([Buffer.from([tag]), encodeLength(c.length), c]);
}

function encodeOid(oid) {
  const parts = oid.split(".").map(Number);
  const out = [];
  const push = (v) => {
    const stack = [v & 0x7f];
    v = Math.floor(v / 128);
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    out.push(...stack);
  };
  push(parts[0] * 40 + parts[1]);
  for (const p of parts.slice(2)) push(p);
  return tlv(0x06, Buffer.from(out));
}

function encodeInt(bytes) {
  // 부호 없는 큰 수로 보고 최소 길이로 쓴다(DER: 앞의 0x00 은 부호 비트를 막을 때만)
  let b = intBytes(Buffer.from(bytes));
  if (b.length === 0) b = Buffer.from([0]);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

const enc = {
  tlv,
  seq: (...items) => tlv(0x30, items),
  set: (...items) => tlv(0x31, items),
  oid: encodeOid,
  int: encodeInt,
  smallInt: (n) => encodeInt(Buffer.from([n])),
  octet: (b) => tlv(0x04, b),
  bitString: (b) => tlv(0x03, Buffer.concat([Buffer.from([0]), b])),
  null: () => Buffer.from([0x05, 0x00]),
  bool: (v) => tlv(0x01, Buffer.from([v ? 0xff : 0])),
  utf8: (s) => tlv(0x0c, Buffer.from(s, "utf8")),
  explicit: (n, inner) => tlv(0xa0 | n, inner),
  implicit: (tag, content) => tlv(tag, content),
  utcTime(date) {
    const iso = date.toISOString();
    return tlv(0x17, Buffer.from(`${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`, "latin1"));
  },
  generalizedTime(date) {
    const iso = date.toISOString();
    return tlv(0x18, Buffer.from(`${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`, "latin1"));
  },
};

module.exports = { DerError, parse, readAll, expect, readOid, decodeOid, readTime, intBytes, enc };
