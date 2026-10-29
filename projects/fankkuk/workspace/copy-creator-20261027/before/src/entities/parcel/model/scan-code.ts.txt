import { z } from "zod";
import { WAYBILL_PATTERN } from "./waybill-no";

// 사무실 작업 화면의 스캔 값 꼴 (office-workflow INV-W1 — 강제 위치 「서버: 스캔 값 꼴 검사」).
// 택배 송장 = 숫자 10~14자리(정본: waybill-no.ts) · 내부 라벨 QR = 「Q-」 + 숫자 여섯 자리. 꼴이 다른 값은 DB 까지 보내지 않는다.

export const QR_PATTERN = /^Q-[0-9]{6}$/;

export const waybillNo = z.string().regex(WAYBILL_PATTERN);
export const qrCode = z.string().regex(QR_PATTERN);

export type ScanCode = { kind: "waybill"; value: string } | { kind: "qr"; value: string } | { kind: "invalid" };

/** 스캐너가 읽은 값이 송장인지 라벨 QR 인지. 앞뒤 공백(스캐너가 붙이는 줄바꿈 포함)만 뗀다. */
export function readScan(raw: string): ScanCode {
  const value = raw.trim();
  if (WAYBILL_PATTERN.test(value)) return { kind: "waybill", value };
  if (QR_PATTERN.test(value)) return { kind: "qr", value };
  return { kind: "invalid" };
}
