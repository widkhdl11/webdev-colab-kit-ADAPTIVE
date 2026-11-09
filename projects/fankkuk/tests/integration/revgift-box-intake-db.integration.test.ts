import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TIER_RULE } from "@/entities/revgift-box/model/box-tiers";
import { adminClient, deleteTestFollows, followForTest, holdRowLock, psql, signedInClient } from "./helpers";
import { PROFILE, sampleEnvelope } from "./revgift-helpers";

// 선물함(팬에게 보내기) 3부 — 상자 고르기 · 6자리 · 번호 라벨 · 큰 상자 입고 · 실측 · 확인 필요 · 168시간 도착 안 함 · 명세서 · 취소한 선물함 상자
// (revgift-box INV-GB1 awaiting_box~invoiced · GB9 라벨 · GB10 · GB11 · GB12 · GB13 · GB16 · GB17 · GB23, S1·S1c·S2·S9·S10~S13c·S16~S17b·S23).
// 시험 데이터는 DB 에 바로 넣는다 — 선물함·신청(selected)·신청 주소 사본(pii, manual/0031 이 만든 표).
// 명세서는 신청 사본의 할증 구분을 pii 의 읽기 함수로 읽어야 만들어지고, 도착 안 함은 사본을 「missing」 까닭으로 지운다 —
// 둘 다 supabase/manual/0033_revgift_box_intake.sql 이 만든다. 그 시험은 이름에 「(manual/0033 뒤)」를 달았다.
// 규칙 값(구간 경계·기한·상한)은 revgift_box_rules() 에서, 요금은 설정 표에서 읽는다.

const HARU_CREATOR = "00000000-0000-4000-b000-000000000001";
const MOMO_CREATOR = "00000000-0000-4000-b000-000000000002";

type Limit = { tier: string; size_cm: number; weight_kg: number };
type Rules = {
  tier_limits: Limit[];
  carton_wait_hours: number;
  awaiting_box_hours: number;
  hold_hours: number;
  cancelled_arrival_hours: number;
  cod_max_krw: number;
  personal_max_krw: number;
  carton_count_max: number;
};
let rules: Rules;
let fee: Record<string, number>;
let surcharge: Record<string, number>;
let serviceFee: number;
let haru: SupabaseClient;
let momo: SupabaseClient;
let byeolbit: SupabaseClient;
let staff: SupabaseClient;

function deleteBoxes(): void {
  psql(`delete from public.office_unmatched where waybill_no like '7700%'`);
  psql(`delete from public.revgift_boxes where creator_id in ('${HARU_CREATOR}', '${MOMO_CREATOR}')`);
  psql(`delete from public.early_creator_monthly_usage where creator_id in ('${HARU_CREATOR}', '${MOMO_CREATOR}')`);
}
let waybillSeq = 0;
function waybill(): string {
  waybillSeq += 1;
  return `7700${String(Date.now() % 1_000_000).padStart(6, "0")}${String(waybillSeq).padStart(2, "0")}`;
}

/** 하루(또는 모모)의 선물함을 바로 만든다. */
function makeBox(o: { status?: string; owner?: "haru" | "momo" } = {}): string {
  const owner = o.owner ?? "haru";
  const [profile, creator] = owner === "haru" ? [PROFILE.haru, HARU_CREATOR] : [PROFILE.momo, MOMO_CREATOR];
  return psql(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${profile}', '${creator}', '시험 선물함', 10, true, '${o.status ?? "closed"}') returning id`,
  ).split("\n")[0]!;
}
/** 신청 하나(기본 selected) + 주소 사본(할증 구분 region). 사본을 빼려면 region null. */
function addApp(boxId: string, fanId: string, o: { status?: string; region?: string | null; tier?: string | null } = {}): string {
  const tier = o.tier === undefined ? "small" : o.tier;
  const id = psql(
    `insert into public.revgift_box_applications (box_id, fan_id, status, chosen_tier) values ('${boxId}', '${fanId}', '${o.status ?? "selected"}', ${tier ? `'${tier}'` : "null"}) returning id`,
  ).split("\n")[0]!;
  const region = o.region === undefined ? "none" : o.region;
  if (region) {
    psql(`insert into pii.revgift_box_addresses (application_id, envelope, surcharge_region) values ('${id}', '${JSON.stringify(sampleEnvelope())}'::jsonb, '${region}')`);
  }
  return id;
}
const boxStatus = (boxId: string) => psql(`select status from public.revgift_boxes where id = '${boxId}'`);
const appStatus = (appId: string) => psql(`select status from public.revgift_box_applications where id = '${appId}'`);
const codeOf = (boxId: string) => psql(`select coalesce(inbound_code, '') from public.revgift_boxes where id = '${boxId}'`);
const labelOf = (appId: string) => psql(`select public.revgift_box_label_text(label_no) from public.revgift_box_applications where id = '${appId}'`);
const hasCopy = (appId: string) => psql(`select count(*) from pii.revgift_box_addresses where application_id = '${appId}'`) === "1";
const invoiceOf = (boxId: string) =>
  psql(`select coalesce((select amount_krw || '|' || shipping_fee_krw || '|' || service_fee_krw || '|' || carton_cod_krw from public.revgift_box_invoices where box_id = '${boxId}'), '')`);
const lineOf = (appId: string) =>
  psql(
    `select coalesce((select tier || '|' || shipping_fee_krw || '|' || surcharge_region || '|' || surcharge_krw || '|' || service_fee_krw || '|' || amount_krw from public.revgift_box_invoice_lines where application_id = '${appId}'), '')`,
  );
/** 「다음」까지 마친 선물함(awaiting_box, 6자리 있음) — 신청 fanIds 마다 소형. 신청 id 목록을 돌려준다. */
async function awaitingBox(fanIds: string[], o: { regions?: (string | null)[]; cartons?: number } = {}): Promise<{ boxId: string; apps: string[]; code: string }> {
  const boxId = makeBox();
  const apps = fanIds.map((f, i) => addApp(boxId, f, { region: o.regions?.[i] === undefined ? "none" : o.regions[i] }));
  const tiers = Object.fromEntries(apps.map((a) => [a, "small"]));
  const r = await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: tiers });
  if (r.error) throw new Error(`submit_tiers: ${r.error.message}`);
  if (o.cartons) {
    const c = await haru.rpc("revgift_box_set_carton_count", { p_box_id: boxId, p_count: o.cartons });
    if (c.error) throw new Error(`set_carton_count: ${c.error.message}`);
  }
  return { boxId, apps, code: codeOf(boxId) };
}
async function receive(code: string, cod = 0, client: SupabaseClient = staff) {
  return client.rpc("office_gift_box_receive", { p_code: code, p_waybill_no: waybill(), p_cod_fee_krw: cod, p_shelf: "A-1" });
}
type MeasureArgs = { label?: string; nickname?: string; size: number; weight: number; personal?: number | null };
async function measure(code: string, m: MeasureArgs, client: SupabaseClient = staff) {
  return client.rpc("office_gift_box_measure", {
    p_code: code,
    p_label: m.label ?? null,
    p_nickname: m.nickname ?? null,
    p_size_cm: m.size,
    p_weight_kg: m.weight,
    p_personal_krw: m.personal ?? null,
  });
}
/** 그 구간 안에 드는 실측(세 변 합·무게) — 구간 경계에서 1 뺀 값 */
function inside(tier: string): { size: number; weight: number } {
  const l = rules.tier_limits.find((x) => x.tier === tier)!;
  return { size: l.size_cm - 1, weight: l.weight_kg / 2 };
}
const large = () => rules.tier_limits.find((x) => x.tier === "large")!;
function tick(): void {
  psql("select public.revgift_box_tick()");
}

beforeAll(async () => {
  rules = JSON.parse(psql("select public.revgift_box_rules()::text")) as Rules;
  fee = Object.fromEntries(psql("select tier || '=' || fee_krw from public.fan_send_fees").split("\n").map((l) => [l.split("=")[0]!, Number(l.split("=")[1])]));
  surcharge = Object.fromEntries(psql("select region || '=' || fee_krw from public.surcharge_fees").split("\n").map((l) => [l.split("=")[0]!, Number(l.split("=")[1])]));
  serviceFee = Number(psql("select box_service_fee_krw from public.pricing_settings"));
  [haru, momo, byeolbit, staff] = await Promise.all(["haru_creator", "momo_creator", "byeolbit_fan", "fankkuk_staff"].map((l) => signedInClient(l)));
  deleteBoxes();
  followForTest(PROFILE.gureumppang, HARU_CREATOR);
  followForTest(PROFILE.somsatang, HARU_CREATOR);
});
beforeEach(() => deleteBoxes());
afterAll(() => {
  deleteBoxes();
  deleteTestFollows();
});

/** 하루가 지금 초기 크리에이터 서비스료를 받는가 — 받으면 정가 대신 그 값 */
function haruServiceFee(): number {
  const early = psql(`select public.early_creator_active('${HARU_CREATOR}', now())`) === "t";
  return early ? Number(psql("select box_early_service_fee_krw from public.pricing_settings")) : serviceFee;
}

describe("INV-GB1 · INV-GB10: 구간을 모두 고르고 「다음」 → 상자 보내 주세요, 6자리는 선물함마다 하나", () => {
  it("INV-GB1 S1c: 구간 없는 신청이 있으면 「다음」 거부 — 그대로 closed, 6자리 없음", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit);
    const b = addApp(boxId, PROFILE.gureumppang);
    const r = await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: { [a]: "small" } });
    expect(r.error?.code).toBe("P0022");
    expect([boxStatus(boxId), codeOf(boxId)]).toEqual(["closed", ""]);
    // 모르는 구간 · 다른 선물함의 신청 · 제외된 신청을 넣으면 꼴 오류
    expect((await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: { [a]: "huge", [b]: "small" } })).error?.code).toBe("22023");
    const other = makeBox();
    const c = addApp(other, PROFILE.somsatang);
    expect((await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: { [a]: "small", [b]: "small", [c]: "small" } })).error?.code).toBe("22023");
    expect(boxStatus(boxId)).toBe("closed");
  });

  it("INV-GB10 S10: 모두 고르고 다음 → awaiting_box, 고른 구간 저장, 6자리 하나(꼴·확인 문자 맞음). 주인 읽기에만 6자리", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit);
    const b = addApp(boxId, PROFILE.gureumppang);
    const excluded = addApp(boxId, PROFILE.somsatang, { status: "excluded", region: null, tier: null });
    const r = await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: { [a]: "xsmall", [b]: "medium" } });
    expect(r.error).toBeNull();
    expect(boxStatus(boxId)).toBe("awaiting_box");
    const code = codeOf(boxId);
    expect(psql(`select public.inbound_code_wellformed('${code}')`)).toBe("t");
    expect(psql(`select string_agg(coalesce(chosen_tier, '-'), ',' order by fan_id) from public.revgift_box_applications where box_id = '${boxId}'`)).toBe("xsmall,medium,-");
    expect(appStatus(excluded)).toBe("excluded");
    const mine = (await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { inbound_code: string; carton_count: number };
    expect([mine.inbound_code, mine.carton_count]).toEqual([code, 1]);
    // 두 번째 「다음」은 상태 밖
    expect((await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: { [a]: "small", [b]: "small" } })).error?.code).toBe("P0022");
  });

  it("INV-GB10 S10b: 모모·별빛은 하루 선물함의 6자리·라벨을 읽지 못한다. 앱 서버 키도 「다음」을 부르지 못한다", async () => {
    const { boxId, apps } = await awaitingBox([PROFILE.byeolbit]);
    expect((await momo.rpc("my_revgift_box", { p_box_id: boxId })).data).toBeNull();
    expect((await momo.rpc("my_revgift_box_labels", { p_box_id: boxId })).error?.code).toBe("P0002");
    const fanView = JSON.stringify((await byeolbit.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data);
    expect(fanView).not.toContain(codeOf(boxId));
    const other = makeBox();
    addApp(other, PROFILE.byeolbit);
    expect((await momo.rpc("revgift_box_submit_tiers", { p_box_id: other, p_tiers: {} })).error?.code).toBe("P0002");
    expect((await adminClient().rpc("revgift_box_submit_tiers", { p_box_id: other, p_tiers: {} })).error).not.toBeNull();
    expect(apps).toHaveLength(1);
  });

  it("INV-GB9 · INV-GB10 S9: 번호 라벨 — 주인만, awaiting_box 부터, 선택된 신청마다 닉네임 + 바코드(신청 번호)뿐", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.somsatang, { status: "excluded", region: null, tier: null });
    expect((await haru.rpc("my_revgift_box_labels", { p_box_id: boxId })).error?.code).toBe("P0022");
    await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: { [a]: "small" } });
    const labels = (await haru.rpc("my_revgift_box_labels", { p_box_id: boxId })).data as Record<string, unknown>[];
    expect(labels).toEqual([{ nickname: "별빛", barcode: labelOf(a) }]);
    expect(labelOf(a)).toMatch(/^GB\d{8}$/);
  });
});

describe("INV-GB11 Q8: 보낸 상자 수 — 첫 상자 입고 전까지만 고친다", () => {
  it("INV-GB11 Q8: 1 이상 상한 이하 정수, 입고 뒤에는 P0022, 남의 선물함은 P0002", async () => {
    const { boxId, code } = await awaitingBox([PROFILE.byeolbit]);
    for (const n of [0, rules.carton_count_max + 1]) {
      expect((await haru.rpc("revgift_box_set_carton_count", { p_box_id: boxId, p_count: n })).error?.code).toBe("22023");
    }
    expect((await haru.rpc("revgift_box_set_carton_count", { p_box_id: boxId, p_count: 2 })).error).toBeNull();
    expect((await momo.rpc("revgift_box_set_carton_count", { p_box_id: boxId, p_count: 3 })).error?.code).toBe("P0002");
    expect((await receive(code)).error).toBeNull();
    expect((await haru.rpc("revgift_box_set_carton_count", { p_box_id: boxId, p_count: 3 })).error?.code).toBe("P0022");
    expect(psql(`select carton_count from public.revgift_boxes where id = '${boxId}'`)).toBe("2");
  });
});

describe("INV-GB10 · INV-GB13: 큰 상자 입고 — 사무실이 6자리로, 착불 금액 0~상한 정수", () => {
  it("INV-GB1 · INV-GB10 S1: 첫 큰 상자 입고 → arrived, 큰 상자 줄(착불 금액·송장번호)·첫 입고 시각", async () => {
    const { boxId, code } = await awaitingBox([PROFILE.byeolbit]);
    const r = await receive(code, 6000);
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ result: "received", box_name: "시험 선물함" });
    expect(boxStatus(boxId)).toBe("arrived");
    expect(psql(`select count(*) || '|' || sum(cod_fee_krw) from public.revgift_box_cartons where box_id = '${boxId}'`)).toBe("1|6000");
    expect(psql(`select first_received_at is not null from public.revgift_boxes where id = '${boxId}'`)).toBe("t");
    // 상자가 더 올 수 있으니 도착 뒤에도 주인에게 6자리가 보인다
    expect(((await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { inbound_code: string | null }).inbound_code).toBe(code);
  });

  it("INV-GB13 S13c: 착불 −1·상한+1 → 22023, 큰 상자 줄 없음. 크리에이터·팬은 입고를 부르지 못한다(42501)", async () => {
    const { boxId, code } = await awaitingBox([PROFILE.byeolbit]);
    expect((await receive(code, -1)).error?.code).toBe("22023");
    expect((await receive(code, rules.cod_max_krw + 1)).error?.code).toBe("22023");
    expect((await receive(code, 0, haru)).error?.code).toBe("42501");
    expect((await receive(code, 0, byeolbit)).error?.code).toBe("42501");
    expect(psql(`select count(*) from public.revgift_box_cartons where box_id = '${boxId}'`)).toBe("0");
    expect(boxStatus(boxId)).toBe("awaiting_box");
  });

  it("INV-GB10: 모르는 6자리 → unknown(아무것도 생기지 않음) — 일반 입고로 받는다", async () => {
    const r = await receive("AAAAAA");
    expect(r.data).toMatchObject({ result: "unknown" });
  });

  it("INV-GB10: 선물함 6자리는 일반 상자 6자리 발급에서도 「이미 쓰인 값」이다", async () => {
    const { code } = await awaitingBox([PROFILE.byeolbit]);
    expect(psql(`select public.inbound_code_taken('${code}')`)).toBe("t");
  });
});

describe("INV-GB12 · INV-GB16: 실측은 선물마다 — 세 변 합·무게 중 큰 쪽, 대형 초과는 개인접수 실비", () => {
  it("INV-GB12 S12·S12b: 구간 판정 — 경계 안·경계 바로 위·무게가 큰 쪽", async () => {
    for (const l of rules.tier_limits) {
      expect(psql(`select public.revgift_box_tier_of(${l.size_cm}, ${l.weight_kg})`)).toBe(l.tier);
    }
    const [xs, s, m] = rules.tier_limits;
    expect(psql(`select public.revgift_box_tier_of(${s!.size_cm + 1}, ${xs!.weight_kg})`)).toBe(m!.tier); // S12: 110cm·3kg → 중형
    expect(psql(`select public.revgift_box_tier_of(${xs!.size_cm - 10}, ${xs!.weight_kg / 2})`)).toBe(xs!.tier); // S12b: 70cm·1kg → 극소형
    expect(psql(`select public.revgift_box_tier_of(${xs!.size_cm}, ${s!.weight_kg + 0.1})`)).toBe(m!.tier); // 크기는 극소형, 무게가 중형
    expect(psql(`select public.revgift_box_tier_of(${large().size_cm + 1}, 1)`)).toBe("oversize");
    expect(psql(`select public.revgift_box_tier_of(1, ${large().weight_kg + 0.1})`)).toBe("oversize");
    // 화면 요금표의 경계는 DB 규칙과 같다
    expect(rules.tier_limits.map((l) => [l.tier, TIER_RULE[l.tier as keyof typeof TIER_RULE]])).toEqual(
      rules.tier_limits.map((l) => [l.tier, { sizeCm: l.size_cm, weightKg: l.weight_kg }]),
    );
  });

  it("INV-GB12 S12: 바코드로 실측 → measured, 실측 구간 저장(고른 구간 소형 · 실측 중형). 같은 신청 두 번째 실측은 55000", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    await receive(code);
    const r = await measure(code, { label: labelOf(apps[0]!), ...inside("medium") });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ result: "measured", nickname: "별빛", tier: "medium" });
    expect(appStatus(apps[0]!)).toBe("measured");
    expect(psql(`select measured_tier || '|' || chosen_tier from public.revgift_box_applications where id = '${apps[0]}'`)).toBe("medium|small");
    expect((await measure(code, { label: labelOf(apps[0]!), ...inside("small") })).error?.code).toBe("55000");
    expect(boxStatus(boxId)).toBe("arrived");
  });

  it("INV-GB12: 손글씨 닉네임 — 선택된 신청 닉네임과 같으면 그 신청으로 실측", async () => {
    const { apps, code } = await awaitingBox([PROFILE.byeolbit]);
    await receive(code);
    expect((await measure(code, { nickname: "별빛", ...inside("xsmall") })).data).toMatchObject({ result: "measured", tier: "xsmall" });
    expect(appStatus(apps[0]!)).toBe("measured");
  });

  it("INV-GB12: 입고 전(awaiting_box)·직원이 아닌 계정은 실측하지 못한다", async () => {
    const { apps, code } = await awaitingBox([PROFILE.byeolbit]);
    expect((await measure(code, { label: labelOf(apps[0]!), ...inside("small") })).error?.code).toBe("P0022");
    await receive(code);
    expect((await measure(code, { label: labelOf(apps[0]!), ...inside("small") }, haru)).error?.code).toBe("42501");
    expect(appStatus(apps[0]!)).toBe("selected");
  });

  it("INV-GB16 S16b: 대형 초과 — 실비 없음·대형 택배비 미만·상한+1 → 22023. 대형 이하에 실비 → 22023", async () => {
    const { apps, code } = await awaitingBox([PROFILE.byeolbit]);
    await receive(code);
    const over = { size: large().size_cm + 10, weight: large().weight_kg - 3 };
    for (const personal of [null, fee.large! - 1, rules.personal_max_krw + 1]) {
      expect((await measure(code, { label: labelOf(apps[0]!), ...over, personal })).error?.code).toBe("22023");
    }
    expect((await measure(code, { label: labelOf(apps[0]!), ...inside("small"), personal: fee.large! })).error?.code).toBe("22023");
    expect(appStatus(apps[0]!)).toBe("selected");
    const ok = await measure(code, { label: labelOf(apps[0]!), ...over, personal: 13000 });
    expect(ok.data).toMatchObject({ result: "measured", tier: "oversize" });
    expect(psql(`select personal_krw from public.revgift_box_applications where id = '${apps[0]}'`)).toBe("13000");
  });
});

describe("INV-GB12 · Q11: 맞지 않는 선물은 「확인 필요」 — 크리에이터가 그 선물함의 선택된 신청에서만 고른다", () => {
  it("INV-GB12 S12c: 닉네임 「별빛s」 → 확인 필요 하나, 선물함 held. 카드는 하루에게만(선물함 이름·작성한 닉네임·고를 팬)", async () => {
    const { boxId, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    await receive(code);
    const r = await measure(code, { nickname: "별빛s", ...inside("small") });
    expect(r.data).toMatchObject({ result: "held" });
    expect(boxStatus(boxId)).toBe("held");
    const cards = (await haru.rpc("my_revgift_box_cards")).data as { kind: string; box_name: string; written_nickname: string; candidates: { nickname: string }[] }[];
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: "hold", box_name: "시험 선물함", written_nickname: "별빛s" });
    expect(cards[0]!.candidates.map((c) => c.nickname).sort()).toEqual(["구름빵", "별빛"]);
    expect((await momo.rpc("my_revgift_box_cards")).data).toEqual([]);
  });

  it("INV-GB10 S10c: 선물함 A 의 바코드 라벨이 B 의 큰 상자에 → B 의 신청으로 잇지 않고 확인 필요", async () => {
    const a = await awaitingBox([PROFILE.byeolbit]);
    const b = await awaitingBox([PROFILE.gureumppang]);
    await receive(b.code);
    const r = await measure(b.code, { label: labelOf(a.apps[0]!), ...inside("small") });
    expect(r.data).toMatchObject({ result: "held" });
    expect([appStatus(a.apps[0]!), appStatus(b.apps[0]!), boxStatus(b.boxId)]).toEqual(["selected", "selected", "held"]);
  });

  it("INV-GB12 S12c: 하루가 다른 선물함의 팬·제외된 팬을 고르면 거부(22023), 모모가 고르면 P0002 — 맞는 팬을 고르면 그 신청이 실측된다", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit]);
    const excluded = addApp(boxId, PROFILE.somsatang, { status: "excluded", region: null, tier: null });
    const other = await awaitingBox([PROFILE.gureumppang]);
    await receive(code);
    await measure(code, { nickname: "별빛s", ...inside("medium") });
    const holdId = psql(`select id from public.revgift_box_holds where box_id = '${boxId}'`);
    expect((await haru.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: other.apps[0] })).error?.code).toBe("22023");
    expect((await haru.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: excluded })).error?.code).toBe("22023");
    expect((await momo.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: apps[0] })).error?.code).toBe("P0002");
    expect(boxStatus(boxId)).toBe("held");
    expect((await haru.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: apps[0] })).error).toBeNull();
    expect(psql(`select status || '|' || measured_tier from public.revgift_box_applications where id = '${apps[0]}'`)).toBe("measured|medium");
    // 두 번 고를 수 없다
    expect((await haru.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: apps[0] })).error?.code).toBe("P0022");
  });

  it("INV-GB12 Q11: 이미 실측된 팬을 고르면 한 송장으로 묶는다 — 그 신청은 다시 실측할 차례(selected), 합친 상자로 다시 잰다", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    await receive(code);
    await measure(code, { label: labelOf(apps[0]!), ...inside("xsmall") });
    await measure(code, { nickname: "별빛s", ...inside("xsmall") });
    const holdId = psql(`select id from public.revgift_box_holds where box_id = '${boxId}'`);
    expect((await haru.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: apps[0] })).error).toBeNull();
    expect(psql(`select status || '|' || coalesce(measured_tier, '-') from public.revgift_box_applications where id = '${apps[0]}'`)).toBe("selected|-");
    expect(boxStatus(boxId)).toBe("arrived");
    expect(invoiceOf(boxId)).toBe("");
  });

  it("INV-GB12 Q11: 확인 필요 7일 무응답 → 신청 없는 선물로 닫힘, 확인 필요가 없으면 선물함은 다시 arrived. 하루 빠지면 그대로", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    await receive(code);
    await measure(code, { label: labelOf(apps[0]!), ...inside("small") });
    await measure(code, { nickname: "모르는팬", ...inside("small") });
    psql(`update public.revgift_box_holds set created_at = now() - interval '${rules.hold_hours} hours' + interval '1 minute' where box_id = '${boxId}'`);
    tick();
    expect(boxStatus(boxId)).toBe("held");
    psql(`update public.revgift_box_holds set created_at = now() - interval '${rules.hold_hours} hours' where box_id = '${boxId}'`);
    tick();
    expect(psql(`select expired_at is not null from public.revgift_box_holds where box_id = '${boxId}'`)).toBe("t");
    expect(boxStatus(boxId)).toBe("arrived");
    expect(((await haru.rpc("my_revgift_box_cards")).data as unknown[]).length).toBe(0);
  });
});

describe("INV-GB11 · INV-GB13 · INV-GB17: 다 실측되면 명세서 (manual/0033 뒤)", () => {
  it("INV-GB13 S13 (manual/0033 뒤): 극소형 둘·중형 하나·착불 6,000 → 줄마다 실측 구간 택배비 + 서비스료, 칸 나눔, 선물함 invoiced·6자리 무효", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang, PROFILE.somsatang]);
    await receive(code, 6000);
    await measure(code, { label: labelOf(apps[0]!), ...inside("xsmall") });
    await measure(code, { label: labelOf(apps[1]!), ...inside("xsmall") });
    expect(boxStatus(boxId)).toBe("arrived");
    const last = await measure(code, { label: labelOf(apps[2]!), ...inside("medium") });
    expect(last.error).toBeNull();
    expect(boxStatus(boxId)).toBe("invoiced");
    const svc = haruServiceFee();
    const ship = fee.xsmall! * 2 + fee.medium!;
    expect(invoiceOf(boxId)).toBe(`${ship + 6000 + svc * 3}|${ship + 6000}|${svc * 3}|6000`);
    expect(lineOf(apps[2]!)).toBe(`medium|${fee.medium}|none|0|${svc}|${fee.medium! + svc}`);
    expect(psql(`select code_voided_at is not null from public.revgift_boxes where id = '${boxId}'`)).toBe("t");
    // S10b: 명세서 뒤 그 6자리로 온 상자는 보류
    expect((await receive(code)).data).toMatchObject({ result: "held" });
    expect(psql(`select count(*) from public.revgift_box_cartons where box_id = '${boxId}'`)).toBe("1");
  });

  it("INV-GB16 S16 (manual/0033 뒤): 실측 150cm·12kg, 실비 13,000 → 그 줄 「개인접수」 13,000 + 서비스료", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit]);
    await receive(code);
    await measure(code, { label: labelOf(apps[0]!), size: large().size_cm + 10, weight: large().weight_kg - 3, personal: 13000 });
    const svc = haruServiceFee();
    expect(lineOf(apps[0]!)).toBe(`oversize|13000|none|0|${svc}|${13000 + svc}`);
    const mine = (await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { invoice: { lines: { tier: string }[] } };
    expect(mine.invoice.lines[0]!.tier).toBe("oversize");
  });

  it("INV-GB17 S17 (manual/0033 뒤): 별빛 「제주」·구름빵 「도서」 → 줄마다 할증, 하루 화면에는 줄마다 구분만(주소·실명·전화 칸 없음)", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang], { regions: ["jeju", "island"] });
    await receive(code);
    await measure(code, { label: labelOf(apps[0]!), ...inside("small") });
    await measure(code, { label: labelOf(apps[1]!), ...inside("small") });
    const svc = haruServiceFee();
    expect(lineOf(apps[0]!)).toBe(`small|${fee.small}|jeju|${surcharge.jeju}|${svc}|${fee.small! + surcharge.jeju! + svc}`);
    expect(lineOf(apps[1]!)).toBe(`small|${fee.small}|island|${surcharge.island}|${svc}|${fee.small! + surcharge.island! + svc}`);
    const mine = (await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { invoice: { lines: Record<string, unknown>[] } };
    expect(mine.invoice.lines.map((l) => l.surcharge_region).sort()).toEqual(["island", "jeju"]);
    // S9b: 크리에이터 읽기 응답 전체에 봉인·전화번호 꼴이 없다
    const all = JSON.stringify(mine) + JSON.stringify((await haru.rpc("my_revgift_box_labels", { p_box_id: boxId })).data);
    expect(all).not.toMatch(/ciphertext|wrappedKey|01[016789]-?\d{3,4}-?\d{4}|fan_id/);
    // progress = 줄마다 진행(결제 전·출고 전·출고·환불 대상·환불 완료, 4부 INV-GB18~GB21) — 사람을 가리키는 칸이 아니다
    expect(Object.keys(mine.invoice.lines[0]!).sort()).toEqual(["amount_krw", "nickname", "printed", "progress", "received", "service_fee_krw", "shipped_on", "shipping_fee_krw", "surcharge_krw", "surcharge_region", "tier"]);
  });

  it("INV-GB17 S17b: 하루·서버 키는 할증 구분 읽기 함수를 부를 수 없다(명세서 줄로만)", async () => {
    const { apps } = await awaitingBox([PROFILE.byeolbit], { regions: ["jeju"] });
    expect((await haru.schema("pii").rpc("revgift_box_regions", { p_application_ids: apps })).error).not.toBeNull();
    expect((await adminClient().schema("pii").rpc("revgift_box_regions", { p_application_ids: apps })).error).not.toBeNull();
    expect((await haru.rpc("revgift_box_regions", { p_application_ids: apps })).error).not.toBeNull();
  });

  it("INV-GB11 S11 (manual/0033 뒤): 보낸 상자 수 2 — 첫 상자만 오고 모두 실측돼도 명세서 없음, 둘째 상자가 오면 명세서", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit], { cartons: 2 });
    await receive(code, 3000);
    await measure(code, { label: labelOf(apps[0]!), ...inside("small") });
    expect([boxStatus(boxId), invoiceOf(boxId)]).toEqual(["arrived", ""]);
    await receive(code, 2000);
    expect(boxStatus(boxId)).toBe("invoiced");
    expect(invoiceOf(boxId).split("|")[3]).toBe("5000");
  });

  it("INV-GB11 S11b · S2 (manual/0033 뒤): 첫 입고 + 168시간, 구름빵 선물 없음 → 구름빵 missing·사본 삭제(기록 missing), 나머지로 명세서. 1분 전이면 그대로", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    await receive(code);
    await measure(code, { label: labelOf(apps[0]!), ...inside("small") });
    psql(`update public.revgift_boxes set first_received_at = now() - interval '${rules.carton_wait_hours} hours' + interval '1 minute' where id = '${boxId}'`);
    tick();
    expect([appStatus(apps[1]!), boxStatus(boxId)]).toEqual(["selected", "arrived"]);
    psql(`update public.revgift_boxes set first_received_at = now() - interval '${rules.carton_wait_hours} hours' where id = '${boxId}'`);
    tick();
    expect(appStatus(apps[1]!)).toBe("missing");
    expect(hasCopy(apps[1]!)).toBe(false);
    expect(psql(`select string_agg(event || ':' || coalesce(reason, ''), ',') from public.revgift_box_address_events where application_id = '${apps[1]}'`)).toBe("deleted:missing");
    expect(boxStatus(boxId)).toBe("invoiced");
    expect(lineOf(apps[1]!)).toBe("");
    expect(lineOf(apps[0]!)).not.toBe("");
  });

  it("INV-GB11 (manual/0033 뒤): 모두 missing 이면 명세서를 만들지 않는다", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit]);
    await receive(code);
    psql(`update public.revgift_boxes set first_received_at = now() - interval '${rules.carton_wait_hours} hours' where id = '${boxId}'`);
    tick();
    expect(appStatus(apps[0]!)).toBe("missing");
    expect(invoiceOf(boxId)).toBe("");
  });

  it("INV-GB12 (manual/0033 뒤): 확인 필요가 남은 동안 명세서 없음 — 풀리면 명세서", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit]);
    await receive(code);
    await measure(code, { nickname: "별빛s", ...inside("small") });
    expect(boxStatus(boxId)).toBe("held");
    const holdId = psql(`select id from public.revgift_box_holds where box_id = '${boxId}'`);
    await haru.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: apps[0] });
    expect(boxStatus(boxId)).toBe("invoiced");
  });

  it("INV-GB11 (동시, manual/0033 뒤): 마지막 두 선물의 실측이 겹쳐도 둘 다 기록되고 명세서는 하나", async () => {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit, PROFILE.gureumppang]);
    await receive(code);
    const other = await signedInClient("fankkuk_admin");
    const hold = await holdRowLock(`select 1 from public.revgift_boxes where id = '${boxId}' for update`, 1);
    const first = measure(code, { label: labelOf(apps[0]!), ...inside("small") });
    for (let i = 0; i < 100; i++) {
      if (psql("select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%office_gift_box_measure%'") !== "0") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const second = measure(code, { label: labelOf(apps[1]!), ...inside("small") }, other);
    await hold.released;
    expect((await first).error).toBeNull();
    expect((await second).error).toBeNull();
    expect(psql(`select count(*) from public.revgift_box_invoices where box_id = '${boxId}'`)).toBe("1");
    expect(psql(`select count(*) from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id where i.box_id = '${boxId}'`)).toBe("2");
  });
});

describe("INV-GB1 Q10: 상자 보내 주세요 30일 동안 큰 상자가 없으면 자동 취소", () => {
  it("INV-GB1 Q10: 「다음」 + 720시간, 입고 없음 → cancelled·신청 끝·사본 삭제·6자리 무효. 1분 전이면 그대로. 입고가 있으면 취소 안 함", async () => {
    const { boxId, apps } = await awaitingBox([PROFILE.byeolbit]);
    const arrived = await awaitingBox([PROFILE.gureumppang]);
    await receive(arrived.code);
    psql(`update public.revgift_boxes set box_requested_at = now() - interval '${rules.awaiting_box_hours} hours' + interval '1 minute' where id = '${boxId}'`);
    tick();
    expect(boxStatus(boxId)).toBe("awaiting_box");
    psql(`update public.revgift_boxes set box_requested_at = now() - interval '${rules.awaiting_box_hours} hours' where id in ('${boxId}', '${arrived.boxId}')`);
    tick();
    expect([boxStatus(boxId), appStatus(apps[0]!), String(hasCopy(apps[0]!))]).toEqual(["cancelled", "ended", "false"]);
    expect(psql(`select code_voided_at is not null from public.revgift_boxes where id = '${boxId}'`)).toBe("t");
    // 무효가 된 6자리는 주인 화면에도 없다(Q7)
    expect(((await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { inbound_code: string | null }).inbound_code).toBeNull();
    expect(boxStatus(arrived.boxId)).toBe("arrived");
  });

  it("INV-GB1: 큰 상자가 입고된 뒤에는 크리에이터가 취소하지 못한다", async () => {
    const { boxId, code } = await awaitingBox([PROFILE.byeolbit]);
    await receive(code);
    expect((await haru.rpc("revgift_box_cancel", { p_box_id: boxId })).error?.code).toBe("P0022");
  });
});

describe("INV-GB23: 취소한 선물함의 6자리로 상자가 오면 보류 + 크리에이터 카드", () => {
  async function cancelledArrival(): Promise<{ boxId: string; apps: string[]; cardId: string }> {
    const { boxId, apps, code } = await awaitingBox([PROFILE.byeolbit]);
    expect((await haru.rpc("revgift_box_cancel", { p_box_id: boxId })).error).toBeNull();
    const r = await receive(code);
    expect(r.data).toMatchObject({ result: "held" });
    return { boxId, apps, cardId: psql(`select id from public.revgift_box_cancelled_arrivals where box_id = '${boxId}'`) };
  }

  it("INV-GB23 S23: 마감 뒤 취소한 선물함 6자리 상자 → 보류 줄(void_code) + 카드 1장, 선물함은 그대로 cancelled", async () => {
    const { boxId, cardId } = await cancelledArrival();
    expect(cardId).not.toBe("");
    expect(boxStatus(boxId)).toBe("cancelled");
    expect(psql(`select reason from public.office_unmatched where id = (select unmatched_id from public.revgift_box_cancelled_arrivals where id = '${cardId}')`)).toBe("void_code");
    const cards = (await haru.rpc("my_revgift_box_cards")).data as { kind: string }[];
    expect(cards.map((c) => c.kind)).toEqual(["cancelled_arrival"]);
  });

  it("INV-GB23 S23: 「돌려받기」 → 고른 것 return. 모모가 「다시 열기」 → P0002", async () => {
    const { cardId } = await cancelledArrival();
    expect((await momo.rpc("revgift_box_choose_cancelled_arrival", { p_card_id: cardId, p_choice: "reopen" })).error?.code).toBe("P0002");
    expect((await haru.rpc("revgift_box_choose_cancelled_arrival", { p_card_id: cardId, p_choice: "return" })).error).toBeNull();
    expect(psql(`select choice from public.revgift_box_cancelled_arrivals where id = '${cardId}'`)).toBe("return");
    // 30일 보관을 기다리지 않고 반송 대상이 된다
    expect(psql(`select expired_at is not null from public.office_unmatched where id = (select unmatched_id from public.revgift_box_cancelled_arrivals where id = '${cardId}')`)).toBe("t");
    expect((await haru.rpc("revgift_box_choose_cancelled_arrival", { p_card_id: cardId, p_choice: "reopen" })).error?.code).toBe("P0022");
  });

  it("INV-GB23 S23: 「다시 열기」 → 취소 전 상태(상자 보내 주세요)·같은 신청자(selected)로, 그 상자가 입고돼 arrived. 사본은 없다", async () => {
    const { boxId, apps, cardId } = await cancelledArrival();
    expect((await haru.rpc("revgift_box_choose_cancelled_arrival", { p_card_id: cardId, p_choice: "reopen" })).error).toBeNull();
    expect([boxStatus(boxId), appStatus(apps[0]!), String(hasCopy(apps[0]!))]).toEqual(["arrived", "selected", "false"]);
    expect(psql(`select count(*) from public.revgift_box_cartons where box_id = '${boxId}'`)).toBe("1");
    // 보류 줄은 큰 상자 줄로 옮겨 갔다 — 보류 목록에 남지 않는다
    expect(psql(`select count(*) from public.office_unmatched where waybill_no = (select waybill_no from public.revgift_box_cancelled_arrivals where id = '${cardId}')`)).toBe("0");
  });

  it("INV-GB23 S23: 카드 168시간 무응답 → 「돌려받기」와 같다. 1분 전이면 그대로", async () => {
    const { cardId } = await cancelledArrival();
    psql(`update public.revgift_box_cancelled_arrivals set created_at = now() - interval '${rules.cancelled_arrival_hours} hours' + interval '1 minute' where id = '${cardId}'`);
    tick();
    expect(psql(`select coalesce(choice, '-') from public.revgift_box_cancelled_arrivals where id = '${cardId}'`)).toBe("-");
    psql(`update public.revgift_box_cancelled_arrivals set created_at = now() - interval '${rules.cancelled_arrival_hours} hours' where id = '${cardId}'`);
    tick();
    expect(psql(`select choice || '|' || auto from public.revgift_box_cancelled_arrivals where id = '${cardId}'`)).toBe("return|true");
  });
});
