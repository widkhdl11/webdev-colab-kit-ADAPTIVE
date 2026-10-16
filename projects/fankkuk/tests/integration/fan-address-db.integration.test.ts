import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, anonClient, psql, psqlError, signedInClient } from "./helpers";
import { clearFanAddresses, PROFILE, sampleEnvelope } from "./revgift-helpers";

// 팬 받을 주소 (address-protection INV-P9·P16·P17). supabase/manual/0019_fan_address.sql 을 적용해야 돈다 — 적용 전에는 빨간불이 맞다.
// 등록·변경·지우기·상태 읽기는 로그인한 팬 본인 칸에만(로그인 토큰으로 판정), 주소 값은 본인에게도 돌려주지 않는다.
// 받기 때 몫에 복사하는 쪽은 revgift-address-db, 송장 출력 대조는 revgift-print-db 가 본다.
// 반송 상자 복사본(S17c 의 뒷부분, INV-P18)은 반송 주소 확인이 생길 때 그 시험이 본다.

const FANS = [PROFILE.byeolbit, PROFILE.daltokki];

function stored(profileId: string): string {
  return psql(`select coalesce(envelope::text, '') || '|' || label from pii.fan_addresses where account_id = '${profileId}'`);
}

function events(profileId: string): string[] {
  const out = psql(`select event from pii.fan_address_events where account_id = '${profileId}' order by at, id`);
  return out === "" ? [] : out.split("\n");
}

beforeAll(() => clearFanAddresses(FANS));
afterAll(() => clearFanAddresses(FANS));

describe("INV-P17: 팬 받을 주소는 로그인한 팬 본인 칸에만 쓴다", () => {
  it("INV-P17 S17: 주소가 없는 별빛이 이름표 「집」과 등록 → 상태는 「집」·바꾼 시각, 기록 한 줄. 다시 등록하면 덮어쓴다", async () => {
    clearFanAddresses([PROFILE.byeolbit]);
    const before = events(PROFILE.byeolbit).length;
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("my_fan_address_status")).data).toEqual([{ registered: false, label: null, updated_at: null }]);

    const first = sampleEnvelope();
    expect((await fan.rpc("set_my_fan_address", { p_envelope: first, p_label: "home" })).data).toBe("saved");
    const status = (await fan.rpc("my_fan_address_status")).data as { registered: boolean; label: string; updated_at: string }[];
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ registered: true, label: "home" });
    expect(Number.isNaN(Date.parse(status[0]!.updated_at))).toBe(false);
    expect(Object.keys(status[0]!).sort()).toEqual(["label", "registered", "updated_at"]);
    expect(events(PROFILE.byeolbit).slice(before)).toEqual(["registered"]);

    const second = sampleEnvelope();
    expect((await fan.rpc("set_my_fan_address", { p_envelope: second, p_label: "office" })).data).toBe("saved");
    expect(psql(`select count(*) from pii.fan_addresses where account_id = '${PROFILE.byeolbit}'`)).toBe("1");
    expect(stored(PROFILE.byeolbit)).toBe(`${psql(`select '${JSON.stringify(second)}'::jsonb::text`)}|office`);
    expect(events(PROFILE.byeolbit).slice(before)).toEqual(["registered", "changed"]);
  });

  it("INV-P17 S17b (실패경로): 평문·봉인 형식이 아닌 값·이름표 없음·목록 밖 이름표는 거부되고 아무것도 바뀌지 않는다", async () => {
    clearFanAddresses([PROFILE.byeolbit]);
    const before = events(PROFILE.byeolbit).length;
    const fan = await signedInClient("byeolbit_fan");
    for (const [envelope, label] of [
      ["서울시 마포구 어울마당로 1", "home"],
      [{ ...sampleEnvelope(), iv: "AAAA" }, "home"],
      [sampleEnvelope(), null],
      [sampleEnvelope(), "역삼동 집"],
    ] as const) {
      expect((await fan.rpc("set_my_fan_address", { p_envelope: envelope, p_label: label })).error?.code).toBe("22023");
    }
    expect(stored(PROFILE.byeolbit)).toBe("");
    expect(events(PROFILE.byeolbit)).toHaveLength(before);
  });

  it("INV-P17 S17b (실패경로): 달토끼의 칸에 쓰는 길이 없다 — 별빛의 등록은 별빛 칸에만, 계정 인자를 붙이면 함수가 없다", async () => {
    clearFanAddresses(FANS);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home" })).data).toBe("saved");
    expect(stored(PROFILE.daltokki)).toBe("");
    expect((await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home", p_account_id: PROFILE.daltokki })).error).not.toBeNull();
    expect(stored(PROFILE.daltokki)).toBe("");
  });

  it("INV-P17 S17b (실패경로): 크리에이터·운영자는 팬 주소를 등록하지 못하고, 로그인 안 함·앱 서버 키는 부를 수 없다", async () => {
    for (const login of ["haru_creator", "fankkuk_staff"]) {
      const c = await signedInClient(login);
      expect((await c.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home" })).data).toBe("not_fan");
      expect((await c.rpc("delete_my_fan_address")).data).toBe("not_fan");
    }
    expect(psql(`select count(*) from pii.fan_addresses where account_id = '${PROFILE.haru}'`)).toBe("0");
    for (const c of [anonClient(), adminClient()]) {
      expect((await c.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home" })).error).not.toBeNull();
      expect((await c.rpc("delete_my_fan_address")).error).not.toBeNull();
      expect((await c.rpc("my_fan_address_status")).error).not.toBeNull();
    }
  });

  it("INV-P17 S17b (실패경로): 별빛 주소 상태를 크리에이터·운영자·다른 팬이 읽으면 별빛의 이름표·시각이 오지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "studio" });
    for (const login of ["haru_creator", "fankkuk_staff"]) {
      expect((await (await signedInClient(login)).rpc("my_fan_address_status")).data).toEqual([]);
    }
    clearFanAddresses([PROFILE.daltokki]);
    expect((await (await signedInClient("daltokki_fan")).rpc("my_fan_address_status")).data).toEqual([{ registered: false, label: null, updated_at: null }]);
  });
});

describe("INV-P17: 지우면 설정의 칸만 빈다", () => {
  it("INV-P17 S17c: 별빛이 지우면 칸이 비고 기록에 지우기 한 줄 — 비어 있을 때 다시 지우면 none, 기록은 늘지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home" });
    const before = events(PROFILE.byeolbit).length;
    expect((await fan.rpc("delete_my_fan_address")).data).toBe("deleted");
    expect(stored(PROFILE.byeolbit)).toBe("");
    expect(events(PROFILE.byeolbit).slice(before)).toEqual(["deleted"]);
    expect((await fan.rpc("delete_my_fan_address")).data).toBe("none");
    expect(events(PROFILE.byeolbit)).toHaveLength(before + 1);
    expect((await fan.rpc("my_fan_address_status")).data).toEqual([{ registered: false, label: null, updated_at: null }]);
  });
});

describe("INV-P9·P17: 팬 주소 칸은 개인정보 구역에만 있고, 기록은 추가만 된다", () => {
  it("INV-P9 (실패경로): 화면 쪽 키로 주소 칸·기록 표를 직접 읽거나 쓸 수 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [fan, anonClient()]) {
      expect((await c.schema("pii").from("fan_addresses").select("*")).data ?? []).toEqual([]);
      expect((await c.schema("pii").from("fan_address_events").select("*")).data ?? []).toEqual([]);
    }
    expect(psql(`select relrowsecurity::text from pg_class where oid = 'pii.fan_addresses'::regclass`)).toBe("true");
    expect(psql(`select relrowsecurity::text from pg_class where oid = 'pii.fan_address_events'::regclass`)).toBe("true");
  });

  it("INV-P17 (실패경로): 기록은 고치거나 지우거나 비울 수 없고, 주소·이름표 칸이 없다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    await fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home" });
    expect(psqlError(`update pii.fan_address_events set event = 'changed' where account_id = '${PROFILE.byeolbit}'`)).not.toBeNull();
    expect(psqlError(`delete from pii.fan_address_events where account_id = '${PROFILE.byeolbit}'`)).not.toBeNull();
    expect(psqlError(`truncate pii.fan_address_events`)).not.toBeNull();
    expect(psql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'pii' and table_name = 'fan_address_events'`)).toBe(
      "account_id,at,event,id",
    );
  });

  it("INV-P16 (실패경로): 이름표 칸은 목록 밖 값을 직접 넣어도 받지 않는다", () => {
    clearFanAddresses([PROFILE.byeolbit]);
    expect(
      psqlError(`insert into pii.fan_addresses (account_id, envelope, label) values ('${PROFILE.byeolbit}', '${JSON.stringify(sampleEnvelope())}'::jsonb, '역삼동 집')`),
    ).not.toBeNull();
  });
});
