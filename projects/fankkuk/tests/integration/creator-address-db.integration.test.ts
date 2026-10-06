import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, psql, psqlError, signedInClient } from "./helpers";
import { PROFILE, sampleEnvelope } from "./revgift-helpers";
import { createTestCreator, removeTestCreator, TEST_CREATOR } from "./test-creator";

// 크리에이터 주소 등록·변경 — 개인정보 구역(pii)에 저장되는 부분. supabase/manual/0007_creator_address.sql 을 적용해야 돈다.
// 스펙: docs/specs/address-protection.md (INV-P1·P9·P13)
//
// 시드 크리에이터(하루)의 주소 칸은 사람이 화면에서 등록해 둔 진짜 봉투라 건드리지 않는다.
// 시험은 시험 전용 크리에이터(test-creator.ts)의 칸만 쓰고, 끝나면 그 크리에이터를 주소·기록째 지운다.

const OPERATOR = "00000000-0000-4000-a000-000000000021";
const CREATOR_ID = TEST_CREATOR.creatorId;
const CREATOR_PROFILE = TEST_CREATOR.profileId;

const addressRows = () => Number(psql(`select count(*) from pii.creator_addresses where creator_id = '${CREATOR_ID}'`));
const storedEnvelope = () => psql(`select envelope::text from pii.creator_addresses where creator_id = '${CREATOR_ID}'`);
const allAddressRows = () => Number(psql(`select count(*) from pii.creator_addresses`));
function newEvents(): { event: string; method: string; actor: string }[] {
  const out = psql(
    `select event || '|' || method || '|' || actor_id from pii.creator_address_events where creator_id = '${CREATOR_ID}' order by at, id`,
  );
  return out
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("|"))
    .map(([event, method, actor]) => ({ event: event!, method: method!, actor: actor! }));
}

function setAddress(actorId: string, envelope: unknown, method = "fake") {
  return adminClient().rpc("set_creator_address", { p_actor_id: actorId, p_envelope: envelope, p_method: method });
}

function clearAddress(): void {
  psql(`delete from pii.creator_addresses where creator_id = '${CREATOR_ID}'`);
}

beforeAll(() => {
  removeTestCreator();
  createTestCreator();
});

afterAll(() => {
  removeTestCreator();
});

describe("INV-P13: 크리에이터 주소는 로그인한 크리에이터 본인의 칸에만 쓴다", () => {
  it("INV-P13 S13: 크리에이터가 봉인 주소를 등록하면 본인 칸에 봉인 주소, 기록 한 줄(방식 fake), 읽기 함수가 「등록됨」", async () => {
    clearAddress();
    const envelope = sampleEnvelope();
    const before = newEvents().length;

    const { data, error } = await setAddress(CREATOR_PROFILE, envelope);

    expect(error).toBeNull();
    expect(data).toBe("saved");
    expect(addressRows()).toBe(1);
    expect(JSON.parse(storedEnvelope())).toEqual(envelope);
    expect(newEvents().slice(before)).toEqual([{ event: "registered", method: "fake", actor: CREATOR_PROFILE }]);

    const creator = await signedInClient(TEST_CREATOR.loginId);
    expect((await creator.rpc("my_creator_address_status")).data).toEqual([{ creator_id: CREATOR_ID, registered: true }]);
  });

  it("INV-P13 S13: 주소가 없으면 읽기 함수는 「등록 전」이다", async () => {
    clearAddress();
    const creator = await signedInClient(TEST_CREATOR.loginId);
    expect((await creator.rpc("my_creator_address_status")).data).toEqual([{ creator_id: CREATOR_ID, registered: false }]);
  });

  it("INV-P13 S13b (실패경로): 평문 주소·봉인 형식이 아닌 값은 22023 으로 거부되고 아무것도 바뀌지 않는다", async () => {
    clearAddress();
    const before = newEvents().length;
    for (const bad of [
      "서울시 강남구 테헤란로 123",
      { address1: "서울시 강남구 테헤란로 123" },
      { ...sampleEnvelope(), wrappedKey: "AAAA" },
      { ...sampleEnvelope(), extra: 1 },
    ]) {
      expect((await setAddress(CREATOR_PROFILE, bad)).error?.code).toBe("22023");
    }
    expect(addressRows()).toBe(0);
    expect(newEvents().length).toBe(before);
  });

  it("INV-P13 S13c (실패경로): 팬·운영자 ID 로는 쓰지 않는다 — 어느 칸도 늘지 않고 기록도 없다", async () => {
    clearAddress();
    const rows = allAddressRows();
    for (const actor of [PROFILE.byeolbit, OPERATOR]) {
      expect((await setAddress(actor, sampleEnvelope())).data).toBe("not_creator");
    }
    expect(allAddressRows()).toBe(rows);
    expect(psql(`select count(*) from pii.creator_address_events where actor_id in ('${PROFILE.byeolbit}', '${OPERATOR}')`)).toBe("0");
  });

  it("INV-P13 S13c (실패경로): 로그인 키·익명 키로는 저장 함수를 부를 수 없다", async () => {
    clearAddress();
    const creator = await signedInClient(TEST_CREATOR.loginId);
    expect((await creator.rpc("set_creator_address", { p_actor_id: CREATOR_PROFILE, p_envelope: sampleEnvelope(), p_method: "fake" })).error).not.toBeNull();
    expect((await anonClient().rpc("set_creator_address", { p_actor_id: CREATOR_PROFILE, p_envelope: sampleEnvelope(), p_method: "fake" })).error).not.toBeNull();
    expect(addressRows()).toBe(0);
  });

  it("INV-P13 S13c (실패경로): 크리에이터가 쓰면 본인 칸만 바뀐다 — 다른 크리에이터 칸은 그대로", async () => {
    clearAddress();
    const others = Number(psql(`select count(*) from pii.creator_addresses where creator_id <> '${CREATOR_ID}'`));
    await setAddress(CREATOR_PROFILE, sampleEnvelope());
    expect(Number(psql(`select count(*) from pii.creator_addresses where creator_id <> '${CREATOR_ID}'`))).toBe(others);
    expect(addressRows()).toBe(1);
  });

  it("INV-P13 S13c (실패경로): 크리에이터의 읽기 함수는 본인 줄 하나만, 팬·익명은 빈 답", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_creator_address_status")).data).toEqual([]);
    expect((await anonClient().rpc("my_creator_address_status")).error).not.toBeNull();
  });

  it("INV-P13 S13d (실패경로): 가짜 서명 허용 줄이 없는 DB(운영)에서는 방식 fake 를 거부한다", () => {
    clearAddress();
    const out = psql(
      `begin; delete from public.local_dev_flags; select public.set_creator_address('${CREATOR_PROFILE}'::uuid, '${JSON.stringify(sampleEnvelope())}'::jsonb, 'fake'); rollback;`,
    );
    expect(out.split("\n")).toContain("method_refused");
    expect(addressRows()).toBe(0);
  });

  it("INV-P13 (실패경로): 모르는 서명 방식은 거부한다", async () => {
    clearAddress();
    expect((await setAddress(CREATOR_PROFILE, sampleEnvelope(), "password")).data).toBe("method_refused");
    expect(addressRows()).toBe(0);
  });
});

describe("INV-P13: 크리에이터 한 명에 주소 하나 — 바꾸면 덮어쓰고, 기록은 추가만", () => {
  it("INV-P13 S13e: 다시 등록하면 칸은 하나(새 값), 기록은 두 줄(registered → changed)", async () => {
    clearAddress();
    const before = newEvents().length;
    const first = sampleEnvelope();
    const second = sampleEnvelope();
    await setAddress(CREATOR_PROFILE, first);
    await setAddress(CREATOR_PROFILE, second);
    expect(addressRows()).toBe(1);
    expect(JSON.parse(storedEnvelope())).toEqual(second);
    expect(newEvents().slice(before).map((e) => e.event)).toEqual(["registered", "changed"]);
  });

  it("INV-P13 S13e (실패경로): 기록 고치기·지우기·통째로 비우기는 DB 가 거부한다", () => {
    expect(psqlError(`update pii.creator_address_events set method = 'kakao' where creator_id = '${CREATOR_ID}'`)).toMatch(/추가만/);
    expect(psqlError(`delete from pii.creator_address_events where creator_id = '${CREATOR_ID}'`)).toMatch(/추가만/);
    expect(psqlError(`truncate pii.creator_address_events`)).toMatch(/추가만/);
  });

  it("INV-P13 (실패경로): 기록 표에는 주소 칸이 없다", () => {
    const cols = psql(
      `select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'pii' and table_name = 'creator_address_events'`,
    );
    expect(cols).toBe("actor_id,at,creator_id,event,id,method");
  });
});

describe("INV-P9: 크리에이터 주소는 노출되지 않는 구역에만 있다", () => {
  it("INV-P9 (실패경로): 서비스 키·로그인 키로 주소 칸과 기록 표를 직접 읽을 수 없다", async () => {
    const creator = await signedInClient(TEST_CREATOR.loginId);
    for (const client of [adminClient(), creator, anonClient()]) {
      expect((await client.schema("pii").from("creator_addresses").select("*")).data ?? []).toEqual([]);
      expect((await client.schema("pii").from("creator_address_events").select("*")).data ?? []).toEqual([]);
    }
  });
});
