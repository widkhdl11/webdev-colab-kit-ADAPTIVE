import { describe, expect, it } from "vitest";
import { adminClient, anonClient, psql, psqlError, registerTestOrder, SEED, signedInClient } from "./helpers";

// 주소 보호 스펙(docs/specs/address-protection.md) 중 지금 DB 로 지킬 수 있는 것.

/** 열람 기록 한 줄을 복호화 전용 역할로 넣고 id 를 돌려준다. */
async function decryptLogRow(): Promise<string> {
  const o = await registerTestOrder();
  return psql(
    `set role address_decryptor; insert into public.decrypt_log (order_id, requester_id, result, deny_reason) values ('${o.orderId}', '${SEED.fanId}', 'denied', 'no_valid_approval') returning id;`,
  )
    .split(/\r?\n/)
    .filter((line) => /^[0-9]+$/.test(line))[0]!;
}

describe("INV-P7: 열람 기록은 복호화 쪽만 쓰고 아무도 고치거나 지울 수 없다", () => {
  it("INV-P7: 복호화 전용 역할은 기록을 남길 수 있다", async () => {
    const id = await decryptLogRow();
    expect(psql(`select result from public.decrypt_log where id = ${id};`)).toBe("denied");
  });

  it("INV-P7 S7b: 앱 서버 키로 기록을 고치면 거부된다", async () => {
    const id = await decryptLogRow();
    const { error } = await adminClient().from("decrypt_log").update({ result: "opened", print_no: 1, deny_reason: null }).eq("id", id);
    expect(error).not.toBeNull();
    expect(psql(`select result from public.decrypt_log where id = ${id};`)).toBe("denied");
  });

  it("INV-P7 S7b: 앱 서버 키로 기록을 지우면 거부된다", async () => {
    const id = await decryptLogRow();
    const { error } = await adminClient().from("decrypt_log").delete().eq("id", id);
    expect(error).not.toBeNull();
    expect(psql(`select count(*) from public.decrypt_log where id = ${id};`)).toBe("1");
  });

  it("INV-P7: 앱 서버 키로는 기록을 새로 쓸 수도 없다", async () => {
    const o = await registerTestOrder();
    const { error } = await adminClient()
      .from("decrypt_log")
      .insert({ order_id: o.orderId, requester_id: SEED.fanId, result: "denied", deny_reason: "not_owner" });
    expect(error).not.toBeNull();
  });

  it("INV-P7: 복호화 전용 역할도 기록을 고치거나 지울 수 없다", async () => {
    const id = await decryptLogRow();
    expect(psqlError(`set role address_decryptor; update public.decrypt_log set deny_reason = 'not_owner' where id = ${id};`)).toMatch(/INV-P7|permission denied/);
    expect(psqlError(`set role address_decryptor; delete from public.decrypt_log where id = ${id};`)).toMatch(/INV-P7|permission denied/);
    expect(psql(`select deny_reason from public.decrypt_log where id = ${id};`)).toBe("no_valid_approval");
  });
});

// 실명·주소·전화번호 꼴의 칸이나 값. 응답 하나를 통째로 훑는다.
const PII_KEY = /(real_?name|phone|mobile|address|addr|ciphertext|wrapped_key)/i;
const PII_VALUE = /(01[016789][- ]?\d{3,4}[- ]?\d{4})|([가-힣]+(시|도)\s[가-힣]+(구|군|시)\s)/;

function piiFindings(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => piiFindings(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [...(PII_KEY.test(k) ? [`${path}.${k}`] : []), ...piiFindings(v, `${path}.${k}`)]);
  }
  return typeof value === "string" && PII_VALUE.test(value) ? [`${path}=${value}`] : [];
}

describe("INV-P9: 주소·실명·전화번호는 공개 API 로 조회되지 않는다", () => {
  it("INV-P9: 검사기 자체가 심어 둔 위반을 잡는다", () => {
    expect(piiFindings([{ order_no: "FC-1", phone: "x" }])).toEqual(["$[0].phone"]);
    expect(piiFindings({ memo: "010-1234-5678" })).toHaveLength(1);
    expect(piiFindings({ memo: "서울시 마포구 어딘가" })).toHaveLength(1);
    expect(piiFindings({ order_no: "FC-7K3M9", item_kind: "손뜨개 인형과 편지" })).toEqual([]);
  });

  it("INV-P9 S9: 팬·크리에이터·익명으로 읽기 함수를 모두 불러도 개인정보 꼴이 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const creator = await signedInClient("haru_creator");
    const responses = [
      await fan.rpc("my_profile"),
      await fan.rpc("my_gifts"),
      await fan.rpc("my_gift", { p_order_no: "FC-7K3M9" }),
      await fan.rpc("my_follows"),
      await fan.rpc("list_creators"),
      await creator.rpc("my_profile"),
      await creator.rpc("my_approval_requests"),
      await creator.rpc("my_decided_requests"),
      await anonClient().rpc("list_creators"),
    ];
    // 크리에이터 목록은 계정(profile_id)을 돌려주지 않는다
    expect(Object.keys((responses[4]!.data as Record<string, unknown>[])[0]!)).not.toContain("profile_id");
    for (const r of responses) expect(r.error).toBeNull();
    expect(responses.every((r) => Array.isArray(r.data))).toBe(true);
    expect(piiFindings(responses.map((r) => r.data))).toEqual([]);
  });

  it("INV-P9 S9: pii 구역은 REST 로 열리지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const client of [fan, anonClient()]) {
      const r = await client.schema("pii").from("people").select("*");
      expect(r.error).not.toBeNull();
      expect(r.data).toBeNull();
    }
  });
});
