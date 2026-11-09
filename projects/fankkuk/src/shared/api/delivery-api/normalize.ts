import { z } from "zod";

// 배송 조회 서비스가 준 본문(웹훅 · 수동 조회 응답)을 한 꼴로 정리한다. 서명 검증이 끝난 본문만 넘긴다.
// 정리한 꼴: { courierCode, trackingNumber, status(상태 코드), progresses[{ at(ISO, 시간대 포함), status }], raw(받은 항목 그대로) }.
// raw 에는 대리점·기사·수령인 칸이 그대로 있다 — 원본 표에만 넣고 화면·응답으로 보내지 않는다(부르는 쪽 책임).
// 근거: https://www.deliveryapi.co.kr/docs · /blog/webhook-guide (2026-11-09 읽음)
// - 웹훅: { event, requestId, timestamp, items: [{ courierCode, trackingNumber, clientId, previousStatus, currentStatus, hasChanged, isDelivered,
//          trackingData: { progresses: [{ dateTime, location, status, statusCode, description }], receiverName, senderName, arrivalBranch } }] }
// - 수동 조회: { isSuccess, data: { results: [{ clientId, success, data?: { trackingNumber, courierCode, deliveryStatus, isDelivered, progresses } }] } }

export type NormalizedTrackingItem = {
  courierCode: string;
  trackingNumber: string;
  status: string | null;
  progresses: { at: string; status: string }[];
  raw: Record<string, unknown>;
};

const CODE = /^[A-Z_]{1,30}$/;

const progressShape = z.object({ dateTime: z.unknown().optional(), status: z.unknown().optional(), statusCode: z.unknown().optional() }).passthrough();

/** 택배사 시각을 ISO 로 — 시간대가 없으면 한국 시각으로 본다(국내 택배사). 알아볼 수 없으면 null */
export function normalizeCarrierTime(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.exec(v.trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2]}${m[3] ?? ":00"}${m[4] ?? "+09:00"}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function codeOf(...vs: unknown[]): string | null {
  for (const v of vs) if (typeof v === "string" && CODE.test(v)) return v;
  return null;
}

function progressesOf(v: unknown): NormalizedTrackingItem["progresses"] {
  const parsed = z.array(progressShape).safeParse(v);
  if (!parsed.success) return [];
  const out: NormalizedTrackingItem["progresses"] = [];
  for (const p of parsed.data.slice(0, 100)) {
    const at = normalizeCarrierTime(p.dateTime);
    const status = codeOf(p.statusCode, p.status);
    if (at && status) out.push({ at, status });
  }
  return out;
}

const webhookItem = z
  .object({
    courierCode: z.string().regex(/^[a-z0-9_]{1,20}$/),
    trackingNumber: z.string().regex(/^[0-9]{8,20}$/),
    currentStatus: z.unknown().optional(),
    trackingData: z.object({ progresses: z.unknown().optional() }).passthrough().nullable().optional(),
  })
  .passthrough();

const webhookBody = z.object({ items: z.array(z.unknown()).max(200) }).passthrough();

/** 웹훅 본문. 꼴이 아니면 null, 꼴이 맞지 않는 항목은 건너뛴다 */
export function normalizeWebhookBody(body: unknown): NormalizedTrackingItem[] | null {
  const parsed = webhookBody.safeParse(body);
  if (!parsed.success) return null;
  const out: NormalizedTrackingItem[] = [];
  for (const raw of parsed.data.items) {
    const it = webhookItem.safeParse(raw);
    if (!it.success) continue;
    out.push({
      courierCode: it.data.courierCode,
      trackingNumber: it.data.trackingNumber,
      status: codeOf(it.data.currentStatus),
      progresses: progressesOf(it.data.trackingData?.progresses),
      raw: raw as Record<string, unknown>,
    });
  }
  return out;
}

const traceResult = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        courierCode: z.string().regex(/^[a-z0-9_]{1,20}$/),
        trackingNumber: z.string().regex(/^[0-9]{8,20}$/),
        deliveryStatus: z.unknown().optional(),
        progresses: z.unknown().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

const traceBody = z.object({ isSuccess: z.literal(true), data: z.object({ results: z.array(z.unknown()).max(100) }).passthrough() }).passthrough();

/** 수동 조회 응답. 꼴이 아니면 null. 조회에 실패한 항목 수를 같이 준다 */
export function normalizeTraceResponse(body: unknown): { items: NormalizedTrackingItem[]; failed: number } | null {
  const parsed = traceBody.safeParse(body);
  if (!parsed.success) return null;
  const items: NormalizedTrackingItem[] = [];
  let failed = 0;
  for (const raw of parsed.data.data.results) {
    const r = traceResult.safeParse(raw);
    if (!r.success || !r.data.success || !r.data.data) {
      failed += 1;
      continue;
    }
    items.push({
      courierCode: r.data.data.courierCode,
      trackingNumber: r.data.data.trackingNumber,
      status: codeOf(r.data.data.deliveryStatus),
      progresses: progressesOf(r.data.data.progresses),
      raw: r.data.data as Record<string, unknown>,
    });
  }
  return { items, failed };
}
