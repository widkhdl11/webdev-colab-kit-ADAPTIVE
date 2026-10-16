import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, officeRowsDelete, psql } from "./helpers";

// 역조공 통합 시험 공용. 시험이 만든 보내기는 주문번호가 RG-T 로 시작한다 — 끝나면 그것만 지운다.

export const PROFILE = {
  byeolbit: "00000000-0000-4000-a000-000000000001", // 팬 별빛 — 시드에서 하루를 팔로우한다
  daltokki: "00000000-0000-4000-a000-000000000002", // 팬 달토끼 — 하루를 팔로우하지 않는다
  gureumppang: "00000000-0000-4000-a000-000000000003", // 팬 구름빵 — 시험이 팔로우를 붙인다
  somsatang: "00000000-0000-4000-a000-000000000004", // 팬 솜사탕 — 시험이 팔로우를 붙인다
  haru: "00000000-0000-4000-a000-000000000011", // 크리에이터 하루(계정)
  momo: "00000000-0000-4000-a000-000000000012", // 크리에이터 모모(계정)
} as const;

export const HARU_CREATOR_ID = "00000000-0000-4000-b000-000000000001";

const TIER_KRW = {
  small: { total: 5400, service: 1400, shipping: 4000 },
  medium: { total: 6900, service: 1900, shipping: 5000 },
  large: { total: 8400, service: 1900, shipping: 6500 },
} as const;

export type Tier = keyof typeof TIER_KRW;

function randomCode(n: number): string {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => alphabet[b % alphabet.length]).join("");
}

export function followHaru(profileIds: readonly string[]): void {
  for (const id of profileIds) {
    psql(`insert into public.follows (fan_id, creator_id) values ('${id}', '${HARU_CREATOR_ID}') on conflict do nothing`);
  }
}

export function unfollowHaru(profileIds: readonly string[]): void {
  const ids = profileIds.map((id) => `'${id}'`).join(", ");
  psql(`delete from public.follows where creator_id = '${HARU_CREATOR_ID}' and fan_id in (${ids})`);
}

/** 시험 보내기 인자. 금액 칸은 서버가 계산하는 값과 같게 맞춘다(INV-R3). */
export function revgiftArgs(shares: readonly { fanId: string; tier: Tier }[], sender: string = PROFILE.haru) {
  const tag = randomCode(6);
  const rows = shares.map((s, i) => ({
    fan_id: s.fanId,
    tier: s.tier,
    order_no: `RG-T${tag}${i}`,
    amount_krw: TIER_KRW[s.tier].total,
    shipping_fee_krw: TIER_KRW[s.tier].shipping,
  }));
  const sum = (k: "total" | "service" | "shipping") => shares.reduce((a, s) => a + TIER_KRW[s.tier][k], 0);
  return {
    p_sender: sender,
    p_shares: rows,
    p_toss_order_id: `pay_test_rg_${tag.toLowerCase()}`,
    p_goods_krw: 0,
    p_service_fee_krw: sum("service"),
    p_inspection_fee_krw: 0,
    p_shipping_fee_krw: sum("shipping"),
    p_amount_krw: sum("total"),
  };
}

export type TestSend = { sendId: string; tossOrderId: string; orderNos: string[] };

/** 보내기를 등록한다(결제 대기). 실패하면 예외. */
export async function registerTestRevgift(shares: readonly { fanId: string; tier: Tier }[]): Promise<TestSend> {
  const args = revgiftArgs(shares);
  const { data, error } = await adminClient().rpc("register_revgift", args);
  if (error) throw new Error(`register_revgift 실패: ${error.code} ${error.message}`);
  return { sendId: data as string, tossOrderId: args.p_toss_order_id, orderNos: args.p_shares.map((s) => s.order_no) };
}

/** 결제를 끝낸다 — 받기 기한(168시간)이 여기서 시작한다. */
export async function payTestRevgift(send: TestSend): Promise<void> {
  const { data, error } = await adminClient().rpc("settle_revgift_payment", {
    p_toss_order_id: send.tossOrderId,
    p_status: "done",
    p_payment_key: `pk_${send.tossOrderId}`,
  });
  if (error || data !== true) throw new Error(`settle_revgift_payment 실패: ${error?.message ?? data}`);
}

/** 하루가 그 팬에게 보낸 소형 몫 하나를 결제까지 — 받기 대기. 받는 팬은 하루를 팔로우하고 있어야 한다(INV-R2). */
export async function paidShareFor(fanId: string): Promise<{ send: TestSend; shareId: string; orderNo: string }> {
  const send = await registerTestRevgift([{ fanId, tier: "small" }]);
  await payTestRevgift(send);
  const shareId = psql(`select id from public.revgift_shares where send_id = '${send.sendId}'`);
  return { send, shareId, orderNo: send.orderNos[0]! };
}

/** 결제 완료 시각을 과거로 옮긴다 — 기한 시험용. */
export function backdateSettlement(send: TestSend, hours: number, minutes = 0): void {
  psql(
    `update public.revgift_sends set settled_at = now() - interval '${hours} hours ${minutes} minutes' where id = '${send.sendId}'`,
  );
}

export function shareReply(orderNo: string): string {
  return psql(`select reply from public.revgift_shares where order_no = '${orderNo}'`);
}

export function deleteTestRevgifts(): void {
  const shares = "select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like 'pay_test_rg_%'";
  // 몫 전용 열람 기록·돌려줌 줄(INV-R7·R13)은 고칠 수도 지울 수도 없게 막혀 있다 — 시험 몫의 줄만 replica 안에서 지운다
  const printRows = [
    `delete from public.revgift_decrypt_releases where share_id in (${shares});`,
    `delete from public.revgift_decrypt_log where share_id in (${shares});`,
  ];
  const printTables = psql("select to_regclass('public.revgift_decrypt_log') is not null") === "t" ? printRows : [];
  psql(["begin;", "set local session_replication_role = replica;", ...printTables, ...officeRowsDelete(shares, "share_id"), "commit;"].join(" "));
  psql(
    "delete from public.refunds where share_id in (select s.id from public.revgift_shares s join public.revgift_sends d on d.id = s.send_id where d.toss_order_id like 'pay_test_rg_%'); " +
      "delete from public.revgift_sends where toss_order_id like 'pay_test_rg_%'",
  );
}

/** 형식만 맞춘 봉인 주소(복호화는 이 시험의 대상이 아니다). 감싼 키 256바이트 · IV 12바이트 · 암호문 17바이트. */
export function sampleEnvelope(): Record<string, unknown> {
  const b64 = (n: number) => Buffer.from(crypto.getRandomValues(new Uint8Array(n))).toString("base64");
  return { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: b64(256), iv: b64(12), ciphertext: b64(40) };
}

/**
 * 로그인한 팬의 받을 주소를 등록한다(address-protection INV-P17, manual/0019). 받기는 이 주소의 암호문을 몫에 복사한다(reverse-gift INV-R4).
 * 이미 있으면 덮어쓴다. 실패하면 예외.
 */
export async function registerFanAddress(fan: SupabaseClient, envelope: unknown = sampleEnvelope(), label = "home"): Promise<void> {
  const { data, error } = await fan.rpc("set_my_fan_address", { p_envelope: envelope, p_label: label });
  if (error || data !== "saved") throw new Error(`set_my_fan_address 실패: ${error?.code ?? String(data)}`);
}

/** 받을 주소를 등록한 뒤 받기를 한다 — 받기 함수의 답을 그대로 돌려준다. */
export async function acceptWithAddress(fan: SupabaseClient, orderNo: string, envelope: unknown = sampleEnvelope()) {
  await registerFanAddress(fan, envelope);
  return fan.rpc("accept_revgift", { p_order_no: orderNo });
}

/** 시험 팬들의 받을 주소를 비운다(기록은 추가만 되므로 남는다). */
export function clearFanAddresses(profileIds: readonly string[]): void {
  psql(`delete from pii.fan_addresses where account_id in (${profileIds.map((id) => `'${id}'`).join(", ")})`);
}

/** 받지 않음·기한 지남으로 살려 둔 몫의 6자리를 hours 시간 전에 살려 둔 것처럼 옮긴다(reverse-gift INV-R11 — 168시간 뒤 자동 처리가 닫는다). */
export function keptSince(orderNo: string, hours: number): void {
  psql(
    `begin; set local session_replication_role = replica; update public.inbound_codes c set kept_at = now() - interval '${hours} hours' from public.revgift_shares s where s.id = c.share_id and s.order_no = '${orderNo}' and c.kept_at is not null; commit;`,
  );
}

/**
 * 받지 않음·기한 지남으로 살려 둔 몫의 6자리를 168시간이 지나 자동 처리가 닫은 상태로 만든다(reverse-gift INV-R11) — 그 뒤에야 환불 대상이 된다.
 * 닫는 경로 자체는 revgift-close-db 가 본다. 여기서는 환불 시험의 준비만. where 는 revgift_shares 별칭 s 에 거는 조건.
 */
export function closeKeptShares(where: string): void {
  psql(
    `update public.inbound_codes c set state = 'void', voided_at = now() from public.revgift_shares s where s.id = c.share_id and (${where}) and c.kept_at is not null and c.state = 'valid'`,
  );
}
