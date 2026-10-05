import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, psql, psqlError, signedInClient } from "./helpers";
import { HARU_CREATOR_ID, PROFILE, sampleEnvelope } from "./revgift-helpers";

// 크리에이터 주소 등록·변경 — 개인정보 구역(pii)에 저장되는 부분. supabase/manual/0007_creator_address.sql 을 적용해야 돈다.
// 스펙: docs/specs/address-protection.md (INV-P1·P9·P13)
//
// 하루의 주소 칸은 사람이 로컬에서 등록해 둔 값일 수 있다 — 시험 전 상태를 적어 두고 끝나면 그대로 되돌린다.
// 기록 표는 추가만 되므로 시험이 남긴 줄만 트리거를 끄고 지운다(로컬 컨테이너에만 붙는 psql).

const OPERATOR = "00000000-0000-4000-a000-000000000021";

let savedEnvelope: string | null = null;
let eventIdsBefore: string[] = [];

const addressRows = () => Number(psql(`select count(*) from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}'`));
const storedEnvelope = () => psql(`select envelope::text from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}'`);
const allAddressRows = () => Number(psql(`select count(*) from pii.creator_addresses`));
function newEvents(): { event: string; method: string; actor: string }[] {
  const out = psql(
    `select event || '|' || method || '|' || actor_id from pii.creator_address_events where creator_id = '${HARU_CREATOR_ID}' order by at, id`,
  );
  return out
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("|"))
    .slice(eventIdsBefore.length)
    .map(([event, method, actor]) => ({ event: event!, method: method!, actor: actor! }));
}

function setAddress(actorId: string, envelope: unknown, method = "fake") {
  return adminClient().rpc("set_creator_address", { p_actor_id: actorId, p_envelope: envelope, p_method: method });
}

function clearHaruAddress(): void {
  psql(`delete from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}'`);
}

beforeAll(() => {
  const env = psql(`select envelope::text from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}'`);
  savedEnvelope = env === "" ? null : env;
  eventIdsBefore = psql(`select id from pii.creator_address_events where creator_id = '${HARU_CREATOR_ID}'`)
    .split("\n")
    .filter((x) => x !== "");
});

afterAll(() => {
  const keep = eventIdsBefore.length > 0 ? `and id not in (${eventIdsBefore.map((id) => `'${id}'`).join(", ")})` : "";
  const restore =
    savedEnvelope === null
      ? `delete from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}';`
      : `insert into pii.creator_addresses (creator_id, envelope) values ('${HARU_CREATOR_ID}', '${savedEnvelope.replace(/'/g, "''")}'::jsonb)
         on conflict (creator_id) do update set envelope = excluded.envelope;`;
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `delete from pii.creator_address_events where creator_id = '${HARU_CREATOR_ID}' ${keep};`,
      "set local session_replication_role = origin;",
      restore,
      "commit;",
    ].join(" "),
  );
});

describe("INV-P13: 크리에이터 주소는 로그인한 크리에이터 본인의 칸에만 쓴다", () => {
  it("INV-P13 S13: 하루가 봉인 주소를 등록하면 하루의 칸에 봉인 주소, 기록 한 줄(방식 fake), 읽기 함수가 「등록됨」", async () => {
    clearHaruAddress();
    const envelope = sampleEnvelope();
    const before = newEvents().length;

    const { data, error } = await setAddress(PROFILE.haru, envelope);

    expect(error).toBeNull();
    expect(data).toBe("saved");
    expect(addressRows()).toBe(1);
    expect(JSON.parse(storedEnvelope())).toEqual(envelope);
    expect(newEvents().slice(before)).toEqual([{ event: "registered", method: "fake", actor: PROFILE.haru }]);

    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("my_creator_address_status")).data).toEqual([{ creator_id: HARU_CREATOR_ID, registered: true }]);
  });

  it("INV-P13 S13: 주소가 없으면 읽기 함수는 「등록 전」이다", async () => {
    clearHaruAddress();
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("my_creator_address_status")).data).toEqual([{ creator_id: HARU_CREATOR_ID, registered: false }]);
  });

  it("INV-P13 S13b (실패경로): 평문 주소·봉인 형식이 아닌 값은 22023 으로 거부되고 아무것도 바뀌지 않는다", async () => {
    clearHaruAddress();
    const before = newEvents().length;
    for (const bad of [
      "서울시 강남구 테헤란로 123",
      { address1: "서울시 강남구 테헤란로 123" },
      { ...sampleEnvelope(), wrappedKey: "AAAA" },
      { ...sampleEnvelope(), extra: 1 },
    ]) {
      expect((await setAddress(PROFILE.haru, bad)).error?.code).toBe("22023");
    }
    expect(addressRows()).toBe(0);
    expect(newEvents().length).toBe(before);
  });

  it("INV-P13 S13c (실패경로): 팬·운영자 ID 로는 쓰지 않는다 — 어느 칸도 늘지 않고 기록도 없다", async () => {
    clearHaruAddress();
    const rows = allAddressRows();
    for (const actor of [PROFILE.byeolbit, OPERATOR]) {
      expect((await setAddress(actor, sampleEnvelope())).data).toBe("not_creator");
    }
    expect(allAddressRows()).toBe(rows);
    expect(psql(`select count(*) from pii.creator_address_events where actor_id in ('${PROFILE.byeolbit}', '${OPERATOR}')`)).toBe("0");
  });

  it("INV-P13 S13c (실패경로): 로그인 키·익명 키로는 저장 함수를 부를 수 없다", async () => {
    clearHaruAddress();
    const haru = await signedInClient("haru_creator");
    expect((await haru.rpc("set_creator_address", { p_actor_id: PROFILE.haru, p_envelope: sampleEnvelope(), p_method: "fake" })).error).not.toBeNull();
    expect((await anonClient().rpc("set_creator_address", { p_actor_id: PROFILE.haru, p_envelope: sampleEnvelope(), p_method: "fake" })).error).not.toBeNull();
    expect(addressRows()).toBe(0);
  });

  it("INV-P13 S13c (실패경로): 하루가 쓰면 하루의 칸만 바뀐다 — 다른 크리에이터 칸은 그대로", async () => {
    clearHaruAddress();
    const others = Number(psql(`select count(*) from pii.creator_addresses where creator_id <> '${HARU_CREATOR_ID}'`));
    await setAddress(PROFILE.haru, sampleEnvelope());
    expect(Number(psql(`select count(*) from pii.creator_addresses where creator_id <> '${HARU_CREATOR_ID}'`))).toBe(others);
    expect(addressRows()).toBe(1);
  });

  it("INV-P13 S13c (실패경로): 하루의 읽기 함수는 하루 줄 하나만, 팬·익명은 빈 답", async () => {
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_creator_address_status")).data).toEqual([]);
    expect((await anonClient().rpc("my_creator_address_status")).error).not.toBeNull();
  });

  it("INV-P13 S13d (실패경로): 가짜 서명 허용 줄이 없는 DB(운영)에서는 방식 fake 를 거부한다", () => {
    clearHaruAddress();
    const out = psql(
      `begin; delete from public.local_dev_flags; select public.set_creator_address('${PROFILE.haru}'::uuid, '${JSON.stringify(sampleEnvelope())}'::jsonb, 'fake'); rollback;`,
    );
    expect(out.split("\n")).toContain("method_refused");
    expect(addressRows()).toBe(0);
  });

  it("INV-P13 (실패경로): 모르는 서명 방식은 거부한다", async () => {
    clearHaruAddress();
    expect((await setAddress(PROFILE.haru, sampleEnvelope(), "password")).data).toBe("method_refused");
    expect(addressRows()).toBe(0);
  });
});

describe("INV-P13: 크리에이터 한 명에 주소 하나 — 바꾸면 덮어쓰고, 기록은 추가만", () => {
  it("INV-P13 S13e: 다시 등록하면 칸은 하나(새 값), 기록은 두 줄(registered → changed)", async () => {
    clearHaruAddress();
    const before = newEvents().length;
    const first = sampleEnvelope();
    const second = sampleEnvelope();
    await setAddress(PROFILE.haru, first);
    await setAddress(PROFILE.haru, second);
    expect(addressRows()).toBe(1);
    expect(JSON.parse(storedEnvelope())).toEqual(second);
    expect(newEvents().slice(before).map((e) => e.event)).toEqual(["registered", "changed"]);
  });

  it("INV-P13 S13e (실패경로): 기록 고치기·지우기·통째로 비우기는 DB 가 거부한다", () => {
    expect(psqlError(`update pii.creator_address_events set method = 'kakao' where creator_id = '${HARU_CREATOR_ID}'`)).toMatch(/추가만/);
    expect(psqlError(`delete from pii.creator_address_events where creator_id = '${HARU_CREATOR_ID}'`)).toMatch(/추가만/);
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
    const haru = await signedInClient("haru_creator");
    for (const client of [adminClient(), haru, anonClient()]) {
      expect((await client.schema("pii").from("creator_addresses").select("*")).data ?? []).toEqual([]);
      expect((await client.schema("pii").from("creator_address_events").select("*")).data ?? []).toEqual([]);
    }
  });
});
