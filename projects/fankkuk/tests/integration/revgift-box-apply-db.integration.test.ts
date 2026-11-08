import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BOX_CAPACITY_MAX, BOX_NAME_MAX } from "@/entities/revgift-box/model/box-rules";
import { adminClient, anonClient, deleteTestFollows, followForTest, holdRowLock, psql, signedInClient } from "./helpers";
import { clearFanAddresses, PROFILE, registerFanAddress, sampleEnvelope } from "./revgift-helpers";

// 선물함(팬에게 보내기) 2부 — 만들기 · 초대 링크 · 신청 · 신청 관리 · 마감 · 선물함 취소 (revgift-box INV-GB1~GB9, S1c·S2b·S3~S9c).
// 선물함 주인은 시드 크리에이터 하루, 다른 크리에이터는 모모. 팬: 별빛(시드에서 하루를 팔로우), 달토끼(팔로우 안 함), 구름빵·솜사탕(시험이 팔로우를 붙인다).
// 신청의 주소 사본은 pii 에 있어 supabase/manual/0031_revgift_box_address.sql 이 적용돼야 신청·신청 취소·마감·선물함 취소가 성공한다 —
// 그 시험은 이름에 「(manual/0031 뒤)」를 달았다. 그 전에 거부되는 경로(역할·팔로우·인원·상태·꼴)는 0031 없이 돈다.
// 받을 인원·이름 길이 경계는 규칙 함수(revgift_box_rules)에서 읽는다.

const HARU_CREATOR = "00000000-0000-4000-b000-000000000001";
const MOMO_CREATOR = "00000000-0000-4000-b000-000000000002";
const FANS = [PROFILE.byeolbit, PROFILE.daltokki, PROFILE.gureumppang, PROFILE.somsatang];

type Rules = { capacity_max: number; name_max: number };
let rules: Rules;
let haru: SupabaseClient;
let momo: SupabaseClient;
let byeolbit: SupabaseClient;
let daltokki: SupabaseClient;
let gureum: SupabaseClient;
let somsa: SupabaseClient;

function deleteBoxes(): void {
  psql(`delete from public.revgift_boxes where creator_id in ('${HARU_CREATOR}', '${MOMO_CREATOR}')`);
}

/** 하루의 선물함을 DB 에 바로 만든다(상태·인원을 시험이 정할 때). */
function makeBox(o: { capacity?: number; isPublic?: boolean; status?: string } = {}): string {
  const isPublic = o.isPublic ?? true;
  return psql(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, invite_token, status) values ('${PROFILE.haru}', '${HARU_CREATOR}', '시험 선물함', ${o.capacity ?? 10}, ${isPublic}, ${
      isPublic ? "null" : "public.revgift_box_new_token()"
    }, '${o.status ?? "open"}') returning id`,
  ).split("\n")[0];
}
/** 신청 줄을 DB 에 바로 넣는다(주소 사본 없이 — 인원·상태 시험용). */
function addApp(boxId: string, fanId: string, status = "applied"): string {
  return psql(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${boxId}', '${fanId}', '${status}') returning id`).split("\n")[0];
}
function boxStatus(boxId: string): string {
  return psql(`select status from public.revgift_boxes where id = '${boxId}'`);
}
function appStatus(appId: string): string {
  return psql(`select status from public.revgift_box_applications where id = '${appId}'`);
}
function tokenOf(boxId: string): string {
  return psql(`select invite_token from public.revgift_boxes where id = '${boxId}'`);
}
function appCount(boxId: string): number {
  return Number(psql(`select count(*) from public.revgift_box_applications where box_id = '${boxId}' and status <> 'withdrawn'`));
}
function copyOf(appId: string): string {
  return psql(`select coalesce((select envelope::text || '|' || surcharge_region from pii.revgift_box_addresses where application_id = '${appId}'), '')`);
}
function copyEvents(appId: string): string[] {
  const out = psql(`select event || coalesce(':' || reason, '') from public.revgift_box_address_events where application_id = '${appId}' order by at, id`);
  return out === "" ? [] : out.split("\n");
}
async function apply(fan: SupabaseClient, boxId: string, o: { token?: string | null; envelope?: unknown; region?: string | null } = {}) {
  return fan.rpc("revgift_box_apply", { p_box_id: boxId, p_token: o.token ?? null, p_envelope: o.envelope ?? null, p_region: o.region ?? null });
}

beforeAll(async () => {
  rules = JSON.parse(psql("select public.revgift_box_rules()::text")) as Rules;
  [haru, momo, byeolbit, daltokki, gureum, somsa] = await Promise.all(
    ["haru_creator", "momo_creator", "byeolbit_fan", "daltokki_fan", "gureumppang_fan", "somsatang_fan"].map((l) => signedInClient(l)),
  );
  deleteBoxes();
  followForTest(PROFILE.gureumppang, HARU_CREATOR);
  followForTest(PROFILE.somsatang, HARU_CREATOR);
});
beforeEach(() => deleteBoxes());
afterAll(() => {
  deleteBoxes();
  deleteTestFollows();
  if (psql("select to_regclass('pii.revgift_box_addresses') is not null") === "t") clearFanAddresses(FANS);
});

describe("INV-GB3: 선물함은 크리에이터만 자기 이름으로 — 이름·받을 인원·공개 여부 셋만", () => {
  it("INV-GB3 S3: 하루가 「겨울 선물」·30명·비공개 → open, 추측할 수 없는 초대 토큰. 공개면 토큰 없음", async () => {
    const priv = await haru.rpc("create_revgift_box", { p_name: "겨울 선물", p_capacity: 30, p_is_public: false });
    expect(priv.error).toBeNull();
    const { id, invite_token } = priv.data as { id: string; invite_token: string };
    expect(invite_token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(psql(`select status || '|' || capacity || '|' || is_public || '|' || owner_id || '|' || creator_id from public.revgift_boxes where id = '${id}'`)).toBe(
      `open|30|false|${PROFILE.haru}|${HARU_CREATOR}`,
    );
    const pub = await haru.rpc("create_revgift_box", { p_name: "봄 선물", p_capacity: 1, p_is_public: true });
    expect((pub.data as { invite_token: string | null }).invite_token).toBeNull();
    // 토큰은 만들 때마다 다르다
    const again = await haru.rpc("create_revgift_box", { p_name: "겨울 선물", p_capacity: 30, p_is_public: false });
    expect((again.data as { invite_token: string }).invite_token).not.toBe(invite_token);
  });

  it("INV-GB3 S3b: 받을 인원 0·최대+1·이름 빈칸·최대+1자 → 22023, 아무것도 생기지 않는다", async () => {
    for (const [name, capacity] of [
      ["겨울", 0],
      ["겨울", rules.capacity_max + 1],
      ["   ", 10],
      ["가".repeat(rules.name_max + 1), 10],
    ] as const) {
      expect((await haru.rpc("create_revgift_box", { p_name: name, p_capacity: capacity, p_is_public: true })).error?.code).toBe("22023");
    }
    expect((await haru.rpc("create_revgift_box", { p_name: "가".repeat(rules.name_max), p_capacity: rules.capacity_max, p_is_public: true })).error).toBeNull();
    expect(Number(psql(`select count(*) from public.revgift_boxes where creator_id = '${HARU_CREATOR}'`))).toBe(1);
    // 화면 입력 칸의 한도는 DB 규칙 함수와 같다
    expect([BOX_NAME_MAX, BOX_CAPACITY_MAX]).toEqual([rules.name_max, rules.capacity_max]);
  });

  it("INV-GB3 S3b: 팬 별빛·로그인 안 함·앱 서버 키 → 만들 수 없다", async () => {
    expect((await byeolbit.rpc("create_revgift_box", { p_name: "가짜", p_capacity: 5, p_is_public: true })).error?.code).toBe("42501");
    expect((await anonClient().rpc("create_revgift_box", { p_name: "가짜", p_capacity: 5, p_is_public: true })).error).not.toBeNull();
    expect((await adminClient().rpc("create_revgift_box", { p_name: "가짜", p_capacity: 5, p_is_public: true })).error).not.toBeNull();
    expect(Number(psql(`select count(*) from public.revgift_boxes where name = '가짜'`))).toBe(0);
  });

  it("INV-GB3 Q3: 「링크 다시 만들기」— 주인만, 비공개·open 에서만. 옛 토큰은 그 순간 무효", async () => {
    const boxId = makeBox({ isPublic: false });
    const old = tokenOf(boxId);
    expect((await momo.rpc("revgift_box_renew_invite", { p_box_id: boxId })).error?.code).toBe("P0002");
    const renewed = await haru.rpc("revgift_box_renew_invite", { p_box_id: boxId });
    expect(renewed.data).not.toBe(old);
    expect(tokenOf(boxId)).toBe(renewed.data);
    expect((await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: old })).data).toBeNull();
    const pub = makeBox();
    expect((await haru.rpc("revgift_box_renew_invite", { p_box_id: pub })).error?.code).toBe("P0022");
  });
});

describe("INV-GB4: 신청은 신청하는 순간 팔로우한 팬만 — 비공개는 맞는 토큰으로만", () => {
  it("INV-GB4 S4b: 팔로우하지 않은 달토끼가 신청 API 를 직접 부름 → P0025, 신청 없음. 화면 읽기는 not_follower", async () => {
    const boxId = makeBox();
    expect((await apply(daltokki, boxId, { envelope: sampleEnvelope(), region: "none" })).error?.code).toBe("P0025");
    expect(appCount(boxId)).toBe(0);
    expect((await daltokki.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data).toMatchObject({ viewer: "not_follower", my_state: "none" });
  });

  it("INV-GB4 S4c: 비공개 선물함을 토큰 없이·틀린 토큰으로 → 읽기 null, 신청 P0002(없는 선물함과 같은 답). 맞는 토큰이면 보인다", async () => {
    const boxId = makeBox({ isPublic: false });
    for (const token of [null, "x".repeat(32), tokenOf(boxId).slice(0, -1)]) {
      expect((await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: token })).data).toBeNull();
      expect((await apply(byeolbit, boxId, { token })).error?.code).toBe("P0002");
    }
    expect((await apply(byeolbit, "00000000-0000-4000-9000-000000000000")).error?.code).toBe("P0002");
    expect((await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: tokenOf(boxId) })).data).toMatchObject({ viewer: "follower", open: true });
    expect(appCount(boxId)).toBe(0);
  });

  it("INV-GB4 S4d: 이미 신청한 별빛이 다시 → P0027. 주인 하루·크리에이터 모모 → 42501", async () => {
    const boxId = makeBox();
    addApp(boxId, PROFILE.byeolbit);
    expect((await apply(byeolbit, boxId)).error?.code).toBe("P0027");
    expect((await apply(haru, boxId)).error?.code).toBe("42501");
    expect((await apply(momo, boxId)).error?.code).toBe("42501");
    expect((await apply(anonClient(), boxId)).error).not.toBeNull();
    expect(appCount(boxId)).toBe(1);
  });

  it("INV-GB4 S4e: 달토끼의 팔로우 끊기가 진행 중일 때 신청 → 끊기가 끝날 때까지 기다렸다가 P0025", async () => {
    const boxId = makeBox();
    psql(`insert into public.follows (fan_id, creator_id) values ('${PROFILE.daltokki}', '${HARU_CREATOR}') on conflict do nothing`);
    const hold = await holdRowLock(`delete from public.follows where fan_id = '${PROFILE.daltokki}' and creator_id = '${HARU_CREATOR}'`, 1.5);
    const started = Date.now();
    const res = await apply(daltokki, boxId, { envelope: sampleEnvelope(), region: "none" });
    await hold.released;
    expect(Date.now() - started).toBeGreaterThan(1000);
    expect(res.error?.code).toBe("P0025");
    expect(appCount(boxId)).toBe(0);
  });
});

describe("INV-GB6: 신청 주소는 봉인된 값만 — 평문·우편번호가 들어올 자리가 없다", () => {
  it("INV-GB6 S6b: 평문 주소·빈 꼴 봉인·목록 밖 구분·구분 없는 봉인 → 22023, 신청 없음", async () => {
    const boxId = makeBox();
    for (const [envelope, region] of [
      [{ address: "서울시 강남구 역삼동 1", phone: "01012345678" }, "none"],
      [{ ...sampleEnvelope(), extra: "x" }, "none"],
      [sampleEnvelope(), "06236"],
      [sampleEnvelope(), null],
      [null, "jeju"],
    ] as const) {
      expect((await apply(byeolbit, boxId, { envelope, region })).error?.code).toBe("22023");
    }
    expect(appCount(boxId)).toBe(0);
  });

  it("INV-GB6 S6b: 크리에이터·관리자에게는 신청의 주소를 넣거나 바꾸는 함수가 없다", () => {
    const fns = psql(
      "select string_agg(p.proname, ',' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like '%revgift_box%' and has_function_privilege('authenticated', p.oid, 'execute')",
    ).split(",");
    // 화면 키가 부를 수 있는 선물함 함수는 이것뿐이다 — 주소를 받는 것은 팬 본인의 신청 하나
    expect(fns).toEqual([
      "create_revgift_box",
      "creator_open_revgift_boxes",
      "my_revgift_box",
      "my_revgift_boxes",
      "revgift_box_apply",
      "revgift_box_cancel",
      "revgift_box_close",
      "revgift_box_for_fan",
      "revgift_box_renew_invite",
      "revgift_box_set_excluded",
      "revgift_box_withdraw",
    ]);
    expect(psql("select has_function_privilege('service_role', 'public.revgift_box_apply(uuid, text, jsonb, text)', 'execute')")).toBe("f");
  });

  it("INV-GB6 S6c: 마감된 선물함에는 신청(주소 넣기)이 없다 → P0022", async () => {
    const boxId = makeBox({ status: "closed" });
    expect((await apply(byeolbit, boxId, { envelope: sampleEnvelope(), region: "none" })).error?.code).toBe("P0022");
    expect(appCount(boxId)).toBe(0);
  });
});

describe("INV-GB5: 제외 안 된 신청 수는 받을 인원을 넘지 않는다", () => {
  it("INV-GB5 S5b: 인원 2·신청 2 → 새 신청 P0023. 하나 제외하면 자리가 난다, 다 차면 다시 넣기 P0023", async () => {
    const boxId = makeBox({ capacity: 2 });
    const a = addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.gureumppang);
    expect((await apply(somsa, boxId, { envelope: sampleEnvelope(), region: "none" })).error?.code).toBe("P0023");
    expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: true })).data).toBe("excluded");
    // 제외된 별빛 자리에 다른 신청이 들어온 것처럼 채운다
    addApp(boxId, PROFILE.somsatang);
    const back = await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: false });
    expect(back.error?.code).toBe("P0023");
    expect(appStatus(a)).toBe("excluded");
  });

  it("INV-GB5 S5(다시 넣기 동시): 남은 자리 1, 제외된 줄 둘을 동시에 다시 넣기 → 하나만 들어간다", async () => {
    const boxId = makeBox({ capacity: 2 });
    addApp(boxId, PROFILE.byeolbit);
    const x = addApp(boxId, PROFILE.gureumppang, "excluded");
    const y = addApp(boxId, PROFILE.somsatang, "excluded");
    // 두 신청 줄을 잡아 두면 두 요청 모두 선물함 줄 잠금 뒤에서(또는 잠금이 없으면 개수를 세기 전에) 멈춘다 — 풀리는 순간 확실히 겹친다
    const hold = await holdRowLock(`select 1 from public.revgift_box_applications where id in ('${x}', '${y}') for update`, 1);
    const results = await Promise.all(
      [x, y].map((app) => haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: app, p_excluded: false })),
    );
    await hold.released;
    expect(results.map((r) => r.data ?? r.error?.code).sort()).toEqual(["P0023", "applied"]);
    expect(Number(psql(`select count(*) from public.revgift_box_applications where box_id = '${boxId}' and status = 'applied'`))).toBe(2);
  });
});

describe("INV-GB7: 신청 관리 — 주인 본인만, open 일 때만 제외·다시 넣기", () => {
  it("INV-GB7 S7: 하루가 별빛 신청을 제외 → 다시 누름 → 다시 들어감, 제외된 줄은 목록에 남는다", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit);
    await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: true });
    const listed = (await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { applications: { id: string; status: string }[] };
    expect(listed.applications).toEqual([expect.objectContaining({ id: a, status: "excluded" })]);
    expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: false })).data).toBe("applied");
    expect(appStatus(a)).toBe("applied");
  });

  it("INV-GB7 S7b: 모모가 하루 선물함의 제외·마감·취소·읽기를 부름 → P0002 / null, 변화 없음", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit);
    expect((await momo.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: true })).error?.code).toBe("P0002");
    expect((await momo.rpc("revgift_box_close", { p_box_id: boxId })).error?.code).toBe("P0002");
    expect((await momo.rpc("revgift_box_cancel", { p_box_id: boxId })).error?.code).toBe("P0002");
    expect((await byeolbit.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: true })).error?.code).toBe("P0002");
    expect((await momo.rpc("my_revgift_box", { p_box_id: boxId })).data).toBeNull();
    expect(((await momo.rpc("my_revgift_boxes")).data as unknown[]).length).toBe(0);
    expect(appStatus(a)).toBe("applied");
    expect(boxStatus(boxId)).toBe("open");
    // 하루가 자기 선물함 번호에 모모 선물함의 신청 번호를 붙여 부름 → 그 신청은 하루 선물함에 없다
    const momoBox = psql(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public) values ('${PROFILE.momo}', '${MOMO_CREATOR}', '모모 선물함', 5, true) returning id`,
    ).split(String.fromCharCode(10))[0];
    const m = addApp(momoBox, PROFILE.gureumppang);
    expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: m, p_excluded: true })).error?.code).toBe("P0002");
    expect(appStatus(m)).toBe("applied");
  });

  it("INV-GB7 · INV-GB2 S2b: 마감된 선물함의 제외된 달토끼 다시 넣기 → P0022", async () => {
    const boxId = makeBox({ status: "closed" });
    const a = addApp(boxId, PROFILE.daltokki, "excluded");
    expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: false })).error?.code).toBe("P0022");
    expect(appStatus(a)).toBe("excluded");
  });
});

describe("INV-GB9: 크리에이터에게 보이는 팬 정보는 닉네임·신청 시각·상태뿐, 팬에게는 다른 신청자가 보이지 않는다", () => {
  it("INV-GB9 S9·S9b: 신청 관리 창의 신청 줄 칸은 id·nickname·applied_at·status 넷, 신청을 거둔 팬은 없다", async () => {
    const boxId = makeBox();
    addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.gureumppang, "excluded");
    addApp(boxId, PROFILE.somsatang, "withdrawn");
    const box = (await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as Record<string, unknown> & { applications: Record<string, unknown>[] };
    expect(Object.keys(box).sort()).toEqual(["applications", "capacity", "created_at", "id", "invite_token", "is_public", "name", "status"]);
    expect(box.applications.map((a) => Object.keys(a).sort())).toEqual([
      ["applied_at", "id", "nickname", "status"],
      ["applied_at", "id", "nickname", "status"],
    ]);
    expect(box.applications.map((a) => a.nickname)).toEqual(["별빛", "구름빵"]);
    const list = (await haru.rpc("my_revgift_boxes")).data as Record<string, unknown>[];
    expect(list).toEqual([expect.objectContaining({ id: boxId, active_count: 1 })]);
  });

  it("INV-GB9 S9c: 별빛이 보는 선물함에는 다른 신청자 수·닉네임·받을 인원이 없다. 제외돼도 「신청함」", async () => {
    const boxId = makeBox();
    addApp(boxId, PROFILE.byeolbit, "excluded");
    addApp(boxId, PROFILE.gureumppang);
    const seen = (await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data as Record<string, unknown>;
    expect(Object.keys(seen).sort()).toEqual(["creator", "id", "my_state", "name", "open", "viewer"]);
    expect(seen.my_state).toBe("applied");
    expect(JSON.stringify(seen)).not.toContain("구름빵");
    // 크리에이터 상세의 입구 — 공개·open 선물함 이름뿐, 로그인 없이도
    const entry = (await anonClient().rpc("creator_open_revgift_boxes", { p_creator_id: HARU_CREATOR })).data as Record<string, unknown>[];
    expect(entry).toEqual([{ id: boxId, name: "시험 선물함" }]);
    makeBox({ isPublic: false });
    makeBox({ status: "closed" });
    expect(((await anonClient().rpc("creator_open_revgift_boxes", { p_creator_id: HARU_CREATOR })).data as unknown[]).length).toBe(1);
  });
});

describe("INV-GB8 · INV-GB1: 마감·선물함 취소 — 전환표 밖은 거부", () => {
  it("INV-GB8 S8b: 신청이 모두 제외된 선물함 마감 → P0024, 그대로 open", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit, "excluded");
    expect((await haru.rpc("revgift_box_close", { p_box_id: boxId })).error?.code).toBe("P0024");
    expect(boxStatus(boxId)).toBe("open");
    expect(appStatus(a)).toBe("excluded");
    const empty = makeBox();
    expect((await haru.rpc("revgift_box_close", { p_box_id: empty })).error?.code).toBe("P0024");
  });

  it("INV-GB1: 마감된 선물함 다시 마감 → P0022. 큰 상자가 입고된 선물함·끝난 선물함 취소 → P0022", async () => {
    const closed = makeBox({ status: "closed" });
    expect((await haru.rpc("revgift_box_close", { p_box_id: closed })).error?.code).toBe("P0022");
    const waiting = makeBox({ status: "awaiting_box" });
    psql(`insert into public.revgift_box_cartons (box_id) values ('${waiting}')`);
    expect((await haru.rpc("revgift_box_cancel", { p_box_id: waiting })).error?.code).toBe("P0022");
    expect(boxStatus(waiting)).toBe("awaiting_box");
    for (const status of ["arrived", "invoiced", "cancelled"]) {
      const b = makeBox({ status });
      expect((await haru.rpc("revgift_box_cancel", { p_box_id: b })).error?.code).toBe("P0022");
      expect(boxStatus(b)).toBe(status);
    }
  });

  it("INV-GB1 S1b: 상태를 직접 고르는 길이 없다 — 화면 키로 선물함 표를 고치지 못한다", async () => {
    const boxId = makeBox();
    await haru.from("revgift_boxes").update({ status: "paid" }).eq("id", boxId);
    expect(boxStatus(boxId)).toBe("open");
  });
});

// ── 여기부터 manual/0031(신청 주소 사본) 이 적용돼야 성공한다 ──

describe("INV-GB6: 신청 = 주소 사본 저장까지 한 처리 (manual/0031 뒤)", () => {
  it("INV-GB6 S6 · INV-GB4 S4: 별빛이 등록 주소로 신청 → 사본은 등록 주소 암호문·구분 그대로, 설정을 바꿔도 사본은 그대로", async () => {
    const boxId = makeBox();
    const envelope = sampleEnvelope();
    await registerFanAddress(byeolbit, envelope);
    const res = await apply(byeolbit, boxId);
    expect(res.error).toBeNull();
    const appId = res.data as string;
    expect(JSON.parse(copyOf(appId).split("|")[0])).toEqual(envelope);
    expect(copyOf(appId).split("|")[1]).toBe("none");
    expect(copyEvents(appId)).toEqual(["copied"]);
    await registerFanAddress(byeolbit, sampleEnvelope(), "office");
    expect(JSON.parse(copyOf(appId).split("|")[0])).toEqual(envelope);
    expect((await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data).toMatchObject({ my_state: "applied" });
  });

  it("INV-GB6: 새로 입력한 봉인 주소와 구분 「제주」로 신청 → 사본은 그 값, 등록 주소는 건드리지 않는다", async () => {
    const boxId = makeBox();
    clearFanAddresses([PROFILE.gureumppang]);
    const envelope = sampleEnvelope();
    const res = await apply(gureum, boxId, { envelope, region: "jeju" });
    expect(res.error).toBeNull();
    const [stored, region] = copyOf(res.data as string).split("|");
    expect(JSON.parse(stored)).toEqual(envelope);
    expect(region).toBe("jeju");
    expect(copyEvents(res.data as string)).toEqual(["entered"]);
    expect(psql(`select count(*) from pii.fan_addresses where account_id = '${PROFILE.gureumppang}'`)).toBe("0");
  });

  it("INV-GB6: 등록 주소가 없는데 봉인 없이 신청 → P0026, 신청 줄도 남지 않는다(한 처리)", async () => {
    const boxId = makeBox();
    clearFanAddresses([PROFILE.somsatang]);
    expect((await apply(somsa, boxId)).error?.code).toBe("P0026");
    expect(appCount(boxId)).toBe(0);
  });
});

describe("INV-GB5 · INV-GB8: 마지막 자리·마감과 신청이 겹쳐도 하나만 (manual/0031 뒤)", () => {
  it("INV-GB5 S5: 인원 2·신청 1, 구름빵·솜사탕이 동시에 신청 → 하나만, 다른 하나는 P0023", async () => {
    const boxId = makeBox({ capacity: 2 });
    addApp(boxId, PROFILE.byeolbit);
    // 두 팬의 팔로우 줄을 잡아 두면 두 신청 모두 선물함 줄 잠금 뒤에서(잠금이 없으면 개수를 세기 전에) 멈춘다
    const hold = await holdRowLock(
      `select 1 from public.follows where creator_id = '${HARU_CREATOR}' and fan_id in ('${PROFILE.gureumppang}', '${PROFILE.somsatang}') for update`,
      1,
    );
    const results = await Promise.all([gureum, somsa].map((f) => apply(f, boxId, { envelope: sampleEnvelope(), region: "none" })));
    await hold.released;
    expect(results.map((r) => (r.error ? r.error.code : "ok")).sort()).toEqual(["P0023", "ok"]);
    expect(appCount(boxId)).toBe(2);
  });

  it("INV-GB8 S8: 마감과 신청이 겹침 — 마감이 먼저면 신청은 P0022, 신청이 먼저면 담길 차례 목록에 있다", async () => {
    // 마감이 먼저: 잠금 뒤에 마감을 먼저 줄 세운다
    const first = makeBox();
    addApp(first, PROFILE.byeolbit);
    let hold = await holdRowLock(`select 1 from public.revgift_boxes where id = '${first}' for update`, 1);
    const closing = haru.rpc("revgift_box_close", { p_box_id: first });
    await new Promise((r) => setTimeout(r, 300));
    const late = apply(gureum, first, { envelope: sampleEnvelope(), region: "none" });
    await hold.released;
    expect((await closing).error).toBeNull();
    expect((await late).error?.code).toBe("P0022");
    expect(psql(`select string_agg(status, ',') from public.revgift_box_applications where box_id = '${first}'`)).toBe("selected");

    // 신청이 먼저
    const second = makeBox();
    addApp(second, PROFILE.byeolbit);
    hold = await holdRowLock(`select 1 from public.revgift_boxes where id = '${second}' for update`, 1);
    const early = apply(gureum, second, { envelope: sampleEnvelope(), region: "none" });
    await new Promise((r) => setTimeout(r, 300));
    const closing2 = haru.rpc("revgift_box_close", { p_box_id: second });
    await hold.released;
    expect((await early).error).toBeNull();
    expect((await closing2).data).toBe(2);
    expect(psql(`select string_agg(status, ',') from public.revgift_box_applications where box_id = '${second}'`)).toBe("selected,selected");
  });
});

describe("INV-GB7 · INV-GB1 · Q5: 마감·취소·신청 취소가 주소 사본을 같은 처리에서 지운다 (manual/0031 뒤)", () => {
  it("INV-GB7 S7c: 제외된 달토끼가 있는 선물함 마감 → 달토끼 사본 삭제·지운 기록 한 줄, 담긴 별빛 사본은 그대로", async () => {
    const boxId = makeBox();
    followForTest(PROFILE.daltokki, HARU_CREATOR);
    const a = (await apply(byeolbit, boxId, { envelope: sampleEnvelope(), region: "none" })).data as string;
    const d = (await apply(daltokki, boxId, { envelope: sampleEnvelope(), region: "island" })).data as string;
    await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: d, p_excluded: true });
    expect(copyOf(d)).not.toBe(""); // 제외만으로는 지우지 않는다(open 동안)
    expect((await haru.rpc("revgift_box_close", { p_box_id: boxId })).data).toBe(1);
    expect(boxStatus(boxId)).toBe("closed");
    expect([appStatus(a), appStatus(d)]).toEqual(["selected", "excluded"]);
    expect(copyOf(d)).toBe("");
    expect(copyEvents(d)).toEqual(["entered", "deleted:excluded_at_close"]);
    expect(copyOf(a)).not.toBe("");
    // 팬에게: 담긴 별빛은 준비 중, 제외된 달토끼는 마감(제외를 드러내지 않는다 — Q6)
    expect(((await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data as { my_state: string }).my_state).toBe("preparing");
    expect(((await daltokki.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data as { my_state: string }).my_state).toBe("closed");
  });

  it("INV-GB1 · INV-GB20: open 선물함 취소 → cancelled, 신청은 끝, 사본 모두 삭제", async () => {
    const boxId = makeBox();
    const a = (await apply(byeolbit, boxId, { envelope: sampleEnvelope(), region: "none" })).data as string;
    expect((await haru.rpc("revgift_box_cancel", { p_box_id: boxId })).error).toBeNull();
    expect(boxStatus(boxId)).toBe("cancelled");
    expect(appStatus(a)).toBe("ended");
    expect(copyOf(a)).toBe("");
    expect(copyEvents(a)).toEqual(["entered", "deleted:box_cancelled"]);
    expect((await apply(gureum, boxId, { envelope: sampleEnvelope(), region: "none" })).error?.code).toBe("P0022");
  });

  it("INV-GB7 Q5: 신청 받는 중 별빛이 신청 취소 → 사본 삭제, 다시 신청할 수 있다. 마감 뒤에는 취소 P0022", async () => {
    const boxId = makeBox();
    const a = (await apply(byeolbit, boxId, { envelope: sampleEnvelope(), region: "none" })).data as string;
    expect((await byeolbit.rpc("revgift_box_withdraw", { p_box_id: boxId })).error).toBeNull();
    expect(appStatus(a)).toBe("withdrawn");
    expect(copyOf(a)).toBe("");
    expect((await daltokki.rpc("revgift_box_withdraw", { p_box_id: boxId })).error?.code).toBe("P0002");
    const again = await apply(byeolbit, boxId, { envelope: sampleEnvelope(), region: "none" });
    expect(again.data).toBe(a);
    expect(appStatus(a)).toBe("applied");
    await haru.rpc("revgift_box_close", { p_box_id: boxId });
    expect((await byeolbit.rpc("revgift_box_withdraw", { p_box_id: boxId })).error?.code).toBe("P0022");
    expect(copyOf(a)).not.toBe("");
  });
});
