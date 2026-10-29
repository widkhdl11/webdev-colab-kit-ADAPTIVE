import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { lookupParcelReply } from "@/entities/parcel/api/lookup-parcel";
import { inspectionResultShape } from "@/entities/parcel/model/inspection";
import { officeErrorReply } from "@/entities/parcel/model/office-error";
import { qrCode } from "@/entities/parcel/model/scan-code";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { MEASURED_TIERS, measurementFromDb } from "./measurement";

// 검수 화면의 서버 쪽 (office-workflow INV-W1·W4).
// - lookup: 라벨 QR 로 상자를 불러온다
// - record: 검수 기록 저장(고치거나 지울 수 없다 — DB 표는 추가만). 결론이 검사 결과와 맞아야 한다
// - measure: 상자 실측 구간 기록(payment INV-M11) — 신고보다 크면 DB 가 차액 결제 요청을 만든다. 상자마다 한 번, 팬 선물만
// - complete: 같은 QR 을 다시 스캔 → 검수 완료·반송 대기·크리에이터 확인 대기 중 DB 가 정한 곳으로(추적기 반송도 반송 대기, 2026-10-12 D2·(2) D3 ②). 기록이 없으면 P0044
// 운영자가 아니면 404. 상태를 고르는 칸은 없다(INV-W1).

const MESSAGE_SHAPE = "스캔한 값이나 검수 기록의 형식이 맞지 않아요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
const MESSAGES = { limit: MESSAGE_SHAPE, failed: FAILED };
// INV-W4: 검수 기록은 상자마다 한 번 — 두 번째 기록은 DB 가 55000 으로 막는다
const RECORD_MESSAGES = { ...MESSAGES, conflict: "이미 검수 기록이 있어요. 기록은 고칠 수 없어요." };
// INV-M11: 실측은 상자마다 한 번, 입고 뒤·검수 스캔 전에만 — 그 밖은 DB 가 55000 으로 막는다
const MEASURE_MESSAGES = { ...MESSAGES, conflict: "이미 실측을 기록했거나 지금은 실측 단계가 아니에요." };

const bodyShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lookup"), qr: qrCode }).strict(),
  z.object({ kind: z.literal("record"), qr: qrCode, result: inspectionResultShape }).strict(),
  z.object({ kind: z.literal("measure"), qr: qrCode, tier: z.enum(MEASURED_TIERS) }).strict(),
  z.object({ kind: z.literal("complete"), qr: qrCode }).strict(),
]);

export type InspectWrite = z.input<typeof bodyShape>;

// held = 크리에이터 확인 대기(추적기 아님 블루투스·RF 상자, 2026-10-12 (2) D3 ②) · tracker_held = 추적기 보관(office-workflow INV-W14, 2026-10-17)
const afterInspect = z.enum(["inspected", "return_waiting", "held", "tracker_held"]);

export async function scanInspect(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_SHAPE } };
  const input = shaped.data;

  if (input.kind === "lookup") return lookupParcelReply(client, input.qr);

  if (input.kind === "record") {
    const { error } = await client.rpc("office_record_inspection", { p_qr: input.qr, p_result: input.result });
    if (error) return officeErrorReply(error.code, RECORD_MESSAGES);
    return { status: 200, body: { ok: true } };
  }

  if (input.kind === "measure") {
    const { data, error } = await client.rpc("office_record_measurement", { p_qr: input.qr, p_tier: input.tier });
    if (error) return officeErrorReply(error.code, MEASURE_MESSAGES);
    const measurement = measurementFromDb(data);
    if (!measurement) return { status: 500, body: { message: FAILED } };
    return { status: 200, body: { measurement } };
  }

  const { data, error } = await client.rpc("office_scan_inspect", { p_qr: input.qr });
  if (error) return officeErrorReply(error.code, MESSAGES);
  const state = afterInspect.safeParse(data);
  if (!state.success) return { status: 500, body: { message: FAILED } };
  return { status: 200, body: { state: state.data } };
}
