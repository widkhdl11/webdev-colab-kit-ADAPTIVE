import { describe, expect, it } from "vitest";
import { psql, psqlError, signedInClient } from "./helpers";
import { PROFILE, sampleEnvelope } from "./revgift-helpers";

// 팬 등록 주소가 없다 (address-protection INV-P17, DECISIONS 2026-11-08 「팬 주소 등록을 없앤다」).
// supabase/manual/0032_fan_address_removal.sql 이 등록 주소 표와 세 함수(등록·지우기·상태 읽기)를 지운다 — 적용 전에는 빨간불이 맞다.
// 팬 주소가 들어가는 자리는 그때 입력한 사본뿐이다: 선물 결제 때 반송 주소(order-return-address-db), 역조공 받기(revgift-address-db),
// 선물함 신청(revgift-box-apply-db). 지난 등록·변경·지우기 기록(주소 값 없음)은 남는다 — 그 표는 추가만 된다.

const GONE_FUNCTIONS = ["public.set_my_fan_address(jsonb, text, text)", "public.delete_my_fan_address()", "public.my_fan_address_status()"] as const;

describe("INV-P17: 팬 등록 주소 표·함수가 없다 (manual/0032 뒤)", () => {
  it("INV-P17: 개인정보 구역에 팬 등록 주소 표가 없고, 등록·지우기·상태 읽기 함수 셋도 없다", () => {
    expect(psql("select to_regclass('pii.fan_addresses') is null")).toBe("t");
    for (const fn of GONE_FUNCTIONS) expect(psql(`select to_regprocedure('${fn}') is null`), fn).toBe("t");
    // 인자 수가 다른 같은 이름도 없다
    expect(psql("select count(*) from pg_proc where proname in ('set_my_fan_address', 'delete_my_fan_address', 'my_fan_address_status')")).toBe("0");
  });

  it("INV-P17 (실패경로): 팬으로 로그인해 등록·지우기·상태 읽기를 부르면 함수 없음 — 어디에도 저장되지 않는다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    const before = psql(`select count(*) from pii.fan_address_events where account_id = '${PROFILE.byeolbit}'`);
    const calls = [
      fan.rpc("set_my_fan_address", { p_envelope: sampleEnvelope(), p_label: "home", p_region: "none" }),
      fan.rpc("delete_my_fan_address"),
      fan.rpc("my_fan_address_status"),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r.data).toBeNull();
      // PostgREST 가 스키마에서 함수를 찾지 못했다는 답(PGRST202)
      expect(r.error?.code).toBe("PGRST202");
    }
    expect(psql(`select count(*) from pii.fan_address_events where account_id = '${PROFILE.byeolbit}'`)).toBe(before);
  });

  it("INV-P17: 지난 등록 기록 표는 남고 추가만 된다 — 주소·이름표 칸이 없고, 고치거나 지우거나 비울 수 없다", () => {
    expect(psql("select to_regclass('pii.fan_address_events') is not null")).toBe("t");
    expect(psql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'pii' and table_name = 'fan_address_events'`)).toBe(
      "account_id,at,event,id",
    );
    // 줄마다 막는 장치라 고칠 줄이 있어야 본다 — 시험 줄을 넣고 같은 처리에서 고치거나 지운 뒤 되돌린다(막히면 오류, 안 막혀도 되돌림)
    const withRow = (sql: string) =>
      `begin; insert into pii.fan_address_events (account_id, event) values ('${PROFILE.byeolbit}', 'registered'); ${sql}; rollback;`;
    expect(psqlError(withRow(`update pii.fan_address_events set event = 'changed' where account_id = '${PROFILE.byeolbit}'`))).not.toBeNull();
    expect(psqlError(withRow(`delete from pii.fan_address_events where account_id = '${PROFILE.byeolbit}'`))).not.toBeNull();
    // 시험 줄을 넣는 것 자체는 된다(위 두 오류가 넣기 때문이 아니다)
    expect(psqlError(withRow("select 1"))).toBeNull();
    expect(psqlError("begin; truncate pii.fan_address_events; rollback;")).not.toBeNull();
  });
});
