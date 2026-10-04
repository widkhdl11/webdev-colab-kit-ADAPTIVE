import { execFileSync, spawn } from "node:child_process";
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

/**
 * 다른 연결에서 행 잠금을 잡고 seconds 동안 쥐고 있는다. 잠금을 잡은 뒤에야 돌아오고,
 * 돌려준 `released` 는 잠금이 풀릴 때 끝난다. (Promise 를 그대로 돌려주면 async 함수가 그것을 풀어
 * 기다려 버려서, 잠금이 풀린 뒤에야 돌아온다 — 객체로 감싸는 이유다.) 동시 요청 시험이 「운 좋게 앞뒤로 와서」 통과하지 않게,
 * 요청들을 이 잠금 뒤에 줄 세워 확실히 겹치게 만든다.
 */
export async function holdRowLock(lockSql: string, seconds: number): Promise<{ released: Promise<void> }> {
  const marker = `hold_row_lock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sql = `begin; ${lockSql}; select pg_sleep(${seconds}) as ${marker}; commit;`;
  const child = spawn("docker", ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  const done = new Promise<void>((resolve, reject) => {
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`holdRowLock 실패 (${code})`))));
  });
  // 잠금 다음 문장(pg_sleep)이 돌기 시작했으면 잠금은 잡힌 것이다
  for (let i = 0; i < 100; i++) {
    const n = psql(`select count(*) from pg_stat_activity where state = 'active' and query like '%as ${marker}%' and pid <> pg_backend_pid()`);
    if (n === "1") return { released: done };
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw new Error("holdRowLock: 잠금을 잡지 못했다");
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

/** 시험이 만드는 주문의 물건 이름. 시드 주문은 이 이름을 쓰지 않는다 — 정리할 때 이것으로 가려낸다. */
export const TEST_ITEM_KINDS = ["시험 선물", "통합 시험 선물"] as const;

/**
 * 시험이 만든 주문을 딸린 상자·결제·승인 요청·열람 기록까지 한 트랜잭션으로 지운다.
 * 열람 기록은 DB 가 수정·삭제를 막아 두었으므로(INV-P7) 그 한 줄만 트리거를 끄고 지운다.
 * 로컬 컨테이너에만 붙는 psql 로 실행하므로 호스팅 DB 에는 닿지 않는다.
 */
export function deleteTestOrders(): void {
  const kinds = TEST_ITEM_KINDS.map((k) => `'${k}'`).join(", ");
  const ids = `select id from public.orders where item_kind in (${kinds})`;
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from public.decrypt_log where order_id in (${ids});`,
      // 사무실 작업 기록(검수·파쇄·라벨)은 추가만 되는 표라 같은 자리에서 지운다(INV-W4·W8)
      ...officeRowsDelete(`select id from public.boxes where order_id in (${ids})`, "box_id"),
      "set local session_replication_role = origin;",
      `delete from public.approval_requests where order_id in (${ids});`,
      `delete from public.refunds where payment_id in (select id from public.payments where order_id in (${ids}));`,
      `delete from public.payments where order_id in (${ids});`,
      `delete from public.orders where item_kind in (${kinds});`,
      "commit;",
    ].join(" "),
  );
}

/** 상자(또는 몫) id 목록에 딸린 사무실 작업 줄을 지우는 문장들. replica 역할 안에서 부른다 — 외래 키 연쇄 삭제가 꺼지므로 자식부터 지운다. */
export function officeRowsDelete(unitIds: string, column: "box_id" | "share_id"): string[] {
  const parcels = `select id from public.office_parcels where ${column} in (${unitIds})`;
  return [
    `delete from public.office_inspections where parcel_id in (${parcels});`,
    `delete from public.office_envelope_shreds where parcel_id in (${parcels});`,
    `delete from public.office_hold_alerts where parcel_id in (${parcels});`,
    `delete from public.office_label_pending where parcel_id in (${parcels});`,
    `delete from public.office_unmatched where matched_parcel_id in (${parcels});`,
    `delete from public.office_parcels where ${column} in (${unitIds});`,
  ];
}

/** 가입 시험이 쓰는 아이디 앞머리와 휴대폰 번호 앞자리. 시드 계정은 이 꼴을 쓰지 않는다. */
export const TEST_SIGNUP_ID_PREFIX = "it_";
export const TEST_SIGNUP_PHONE_PREFIX = "0109000";

/** 가입 시험이 만든 계정(로그인 정보 → 프로필·연락처·약관 동의가 따라 지워진다)과 본인 확인 기록을 지운다. */
export function deleteTestSignups(): void {
  psql(
    [
      `delete from auth.users where email like '${TEST_SIGNUP_ID_PREFIX.replace("_", "\\_")}%@login.fankkuk.invalid';`,
      `delete from pii.phone_verifications where phone like '${TEST_SIGNUP_PHONE_PREFIX}%';`,
    ].join(" "),
  );
}

/**
 * 시험이 만든 팬 차단 줄을 지운다(decline-block). 시드에는 차단이 없다 — 남겨 두면 별빛 → 하루 등록을 쓰는 다른 시험이 막힌다.
 * 차단 표가 아직 없을 때(구현 전 빨간불 확인)도 정리 단계가 멈추지 않게 표가 있을 때만 지운다.
 */
export function deleteTestBlocks(): void {
  psql("do $$ begin if to_regclass('public.creator_blocks') is not null then delete from public.creator_blocks; end if; end $$;");
}

export function countTestOrders(): number {
  const kinds = TEST_ITEM_KINDS.map((k) => `'${k}'`).join(", ");
  return Number(psql(`select count(*) from public.orders where item_kind in (${kinds});`));
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

/** 시험마다 새 주문을 만든다 — 결제 대기 상태. 소형 상자 n 개. 보내는 사람·받는 크리에이터를 안 주면 별빛 → 하루. */
export async function registerTestOrder(
  boxCount = 1,
  who: { senderId?: string; creatorId?: string } = {},
): Promise<{ orderId: string; orderNo: string; tossOrderId: string }> {
  const orderNo = `FC-T${randomCode(6)}`;
  const tossOrderId = `pay_test_${randomCode(12).toLowerCase()}`;
  const { data, error } = await adminClient().rpc("register_order", {
    p_fan_id: who.senderId ?? SEED.fanId,
    p_creator_id: who.creatorId ?? SEED.haruCreatorId,
    p_order_no: orderNo,
    p_item_kind: "시험 선물",
    p_has_electronics_or_metal: false,
    p_tiers: Array<string>(boxCount).fill("small"),
    p_toss_order_id: tossOrderId,
    p_goods_krw: 0,
    p_service_fee_krw: 1400 * boxCount,
    p_inspection_fee_krw: 1500 * boxCount,
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
