import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 통합 테스트 공용 도구. 주소·키는 setup-env 가 로컬 Supabase 에서 읽어 둔다.

const url = () => process.env.FK_TEST_API_URL ?? "";
const anonKey = () => process.env.FK_TEST_ANON_KEY ?? "";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** 앱 서버 키(Supabase 비밀 키) 클라이언트. */
export function adminClient(): SupabaseClient {
  return createClient(url(), process.env.FK_TEST_SERVICE_KEY ?? "", noSession);
}

/** 로그인하지 않은 브라우저 키 클라이언트. */
export function anonClient(): SupabaseClient {
  return createClient(url(), anonKey(), noSession);
}

/** seed.sql 의 시험 계정으로 로그인한 클라이언트. */
export async function signedInClient(loginId: string): Promise<SupabaseClient> {
  const client = createClient(url(), anonKey(), noSession);
  const { error } = await client.auth.signInWithPassword({ email: `${loginId}@fankkuk.test`, password: "fankkuk-local-1234" });
  if (error) throw new Error(`시험 계정 로그인 실패: ${loginId}`);
  return client;
}

/** DB 소유자(postgres)로 SQL 을 직접 실행한다 — 앱 서버 키로는 만들 수 없는 상태를 준비할 때만. */
export function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
}

/** psql 실행이 오류로 끝나면 그 메시지를, 성공하면 null 을 돌려준다. */
export function psqlError(sql: string): string | null {
  try {
    psql(sql);
    return null;
  } catch (e) {
    const err = e as { stderr?: string };
    return err.stderr ?? String(e);
  }
}

export const SEED = {
  fanId: "00000000-0000-4000-a000-000000000001", // 별빛
  otherFanId: "00000000-0000-4000-a000-000000000002", // 달토끼
  creatorProfileId: "00000000-0000-4000-a000-000000000011", // 하루
  haruCreatorId: "00000000-0000-4000-b000-000000000001",
} as const;

function randomCode(n: number): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
}

/** 시험마다 새 주문을 만든다 — 결제 대기 상태. 소형 상자 n 개. */
export async function registerTestOrder(boxCount = 1): Promise<{ orderId: string; orderNo: string; tossOrderId: string }> {
  const orderNo = `FC-T${randomCode(6)}`;
  const tossOrderId = `pay_test_${randomCode(12).toLowerCase()}`;
  const { data, error } = await adminClient().rpc("register_order", {
    p_fan_id: SEED.fanId,
    p_creator_id: SEED.haruCreatorId,
    p_order_no: orderNo,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: Array<string>(boxCount).fill("small"),
    p_toss_order_id: tossOrderId,
    p_goods_krw: 0,
    p_service_fee_krw: 2900 * boxCount,
    p_shipping_fee_krw: 4000 * boxCount,
    p_amount_krw: 6900 * boxCount,
  });
  if (error) throw new Error(`register_order 실패: ${error.message}`);
  return { orderId: data as string, orderNo, tossOrderId };
}

export function requestIdFor(orderNo: string): string {
  return `apr_${orderNo.replaceAll("-", "")}`;
}

/** 결제를 끝내고 승인 요청까지 만든다(settle_payment done). */
export async function payTestOrder(o: { orderNo: string; tossOrderId: string }): Promise<string> {
  const requestId = requestIdFor(o.orderNo);
  const at = new Date().toISOString();
  const { error } = await adminClient().rpc("settle_payment", {
    p_toss_order_id: o.tossOrderId,
    p_status: "done",
    p_payment_key: `pk_${o.tossOrderId}`,
    p_request_id: requestId,
    p_payload: `fankkuk-approval:v1|req=${requestId}|order=${o.orderNo}|at=${at}|fan=${"0".repeat(64)}`,
    p_requested_at: at,
  });
  if (error) throw new Error(`settle_payment 실패: ${error.message}`);
  return requestId;
}
