import { spawn } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OWNER_ID } from "./admin-pricing-helpers";
import { approve, createCvAccounts, CV, dropCvAccounts, requestOk, resetCv } from "./creator-verification-helpers";
import { adminClient, holdRowLock, psql, psqlError, SEED, signedInClient } from "./helpers";

// 선물함(팬에게 보내기) 1부 — 데이터 모델과 요금 (revgift-box INV-GB3·GB13~GB17, S3b·S13~S17).
// 명세서를 쓰는 함수는 앱 키·서비스 키로 부르지 못한다(3부의 명세서 생성 함수만 안에서 부른다) — 그래서 이 시험은 psql 로 부른다.
// 금액·한도는 DB 의 설정값과 규칙 함수(revgift_box_rules)에서 읽는다 — 기대값에 숫자를 따로 박지 않는다.
// 선물함 주인은 시험 크리에이터 「새벽시험」(CV.dawn), 신청한 팬은 시드 팬 둘 + 시험 계정 셋(신청 표는 계정만 본다).

type Tier = "xsmall" | "small" | "medium" | "large";
type Region = "none" | "jeju" | "island";
type Line = { application_id: string; tier: Tier | "oversize"; personal_krw?: number | null; region: Region };
type Rules = {
  capacity_max: number;
  name_max: number;
  early_max_rank: number;
  early_monthly_lines: number;
  personal_max_krw: number;
  cod_max_krw: number;
};

const OWNER = CV.dawn;
const FANS = [SEED.fanId, SEED.otherFanId, CV.ggul.id, CV.summer.id, CV.haru.id];
const CV_CREATOR_IDS = Object.values(CV)
  .map((a) => `'${a.creatorId}'`)
  .join(", ");

let rules: Rules;
let sendFee: Record<Tier, number>;
let surcharge: Record<"jeju" | "island", number>;
let fee: { regular: number; early: number };
let counterBefore: string;

function readSettings(): void {
  rules = JSON.parse(psql("select public.revgift_box_rules()::text")) as Rules;
  sendFee = Object.fromEntries(
    psql("select tier || '=' || fee_krw from public.fan_send_fees")
      .split("\n")
      .map((l) => [l.split("=")[0], Number(l.split("=")[1])]),
  ) as Record<Tier, number>;
  surcharge = Object.fromEntries(
    psql("select region || '=' || fee_krw from public.surcharge_fees")
      .split("\n")
      .map((l) => [l.split("=")[0], Number(l.split("=")[1])]),
  ) as Record<"jeju" | "island", number>;
  const [regular, early] = psql("select box_service_fee_krw || '|' || box_early_service_fee_krw from public.pricing_settings").split("|").map(Number);
  fee = { regular, early };
}

/** 다른 연결에서 SQL 을 돌린다 — 끝날 때 결과(성공/오류 문자열)를 돌려준다. 동시 처리 시험용. */
function psqlAsync(sql: string): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql]);
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (out += d.toString()));
    child.on("exit", (code) => resolve({ ok: code === 0, out: out.trim() }));
  });
}

/** insert ... returning id 의 id — psql 은 그 뒤에 「INSERT 0 1」 줄을 붙인다. */
function insertId(sql: string): string {
  return psql(sql).split("\n")[0];
}

function deleteBoxes(): void {
  psql(`delete from public.revgift_boxes where creator_id in (${CV_CREATOR_IDS})`);
}

/** 선물함 하나와 실측된 신청 n 개(팬 순서대로)를 만든다. */
function makeBox(n: number): { boxId: string; apps: string[] } {
  const boxId = insertId(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public) values ('${OWNER.id}', '${OWNER.creatorId}', '시험 선물함', 10, true) returning id`,
  );
  const apps = FANS.slice(0, n).map((fan) =>
    insertId(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${boxId}', '${fan}', 'measured') returning id`),
  );
  return { boxId, apps };
}

function writeInvoiceSql(boxId: string, lines: Line[], at?: string): string {
  return `select public.revgift_box_write_invoice('${boxId}', '${JSON.stringify(lines)}'::jsonb${at ? `, '${at}'::timestamptz` : ""})`;
}
function writeInvoice(boxId: string, lines: Line[], at?: string): string {
  return psql(writeInvoiceSql(boxId, lines, at));
}

type InvoiceRow = { amount_krw: number; shipping_fee_krw: number; service_fee_krw: number; inspection_fee_krw: number; goods_krw: number; carton_cod_krw: number };
type LineRow = { tier: string; shipping_fee_krw: number; surcharge_region: string; surcharge_krw: number; service_fee_krw: number; early_rate: boolean; amount_krw: number };

function invoiceOf(boxId: string): InvoiceRow {
  return JSON.parse(psql(`select row_to_json(i)::text from public.revgift_box_invoices i where box_id = '${boxId}'`)) as InvoiceRow;
}
function linesOf(boxId: string): LineRow[] {
  const raw = psql(
    `select coalesce(json_agg(row_to_json(l) order by l.line_no), '[]')::text from public.revgift_box_invoice_lines l join public.revgift_box_invoices i on i.id = l.invoice_id where i.box_id = '${boxId}'`,
  );
  return JSON.parse(raw) as LineRow[];
}

/** 시험 크리에이터의 순번·월 사용을 지운다. 카운터는 지금 순번의 최댓값으로 맞춘다(시험이 따로 정하지 않으면). */
function resetEarly(): void {
  psql(
    `begin; delete from public.early_creator_monthly_usage where creator_id in (${CV_CREATOR_IDS}); delete from public.early_creators where creator_id in (${CV_CREATOR_IDS}); update public.early_creator_counter set last_rank = (select coalesce(max(rank), 0) from public.early_creators); commit;`,
  );
}

/** 새벽시험을 초기 크리에이터로 만든다 — 남은 순번 중 하나, 승인 시각은 주어진 값. */
function makeEarly(grantedAt: string): void {
  psql(
    `insert into public.early_creators (creator_id, rank, granted_at) select '${OWNER.creatorId}', min(r), '${grantedAt}'::timestamptz from generate_series(1, ${rules.early_max_rank}) r where r not in (select rank from public.early_creators)`,
  );
}

function setUsage(month: string, used: number): void {
  psql(
    `insert into public.early_creator_monthly_usage (creator_id, month, used) values ('${OWNER.creatorId}', '${month}', ${used}) on conflict (creator_id, month) do update set used = excluded.used`,
  );
}
function usageOf(month: string): number {
  return Number(psql(`select coalesce((select used from public.early_creator_monthly_usage where creator_id = '${OWNER.creatorId}' and month = '${month}'), 0)`));
}
function rankOf(creatorId: string): string {
  return psql(`select coalesce((select rank::text from public.early_creators where creator_id = '${creatorId}'), 'none')`);
}

beforeAll(() => {
  createCvAccounts();
  resetCv();
  counterBefore = psql("select last_rank from public.early_creator_counter");
  readSettings();
});

beforeEach(() => {
  deleteBoxes();
  resetEarly();
});

afterAll(() => {
  deleteBoxes();
  resetEarly();
  psql(`update public.early_creator_counter set last_rank = ${counterBefore}`);
  dropCvAccounts();
});

describe("선물함 표의 꼴 (INV-GB3)", () => {
  const insertBox = (name: string, capacity: number, isPublic: boolean, token: string | null) =>
    psqlError(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, invite_token) values ('${OWNER.id}', '${OWNER.creatorId}', '${name}', ${capacity}, ${isPublic}, ${token ? `'${token}'` : "null"})`,
    );
  const TOKEN = "AbCdEfGhIjKlMnOpQrStUv";

  it("INV-GB3 S3b: 받을 인원 0·최대+1 은 DB 가 거부하고, 1·최대는 들어간다", () => {
    expect(insertBox("겨울 선물", 0, true, null)).toMatch(/check/i);
    expect(insertBox("겨울 선물", rules.capacity_max + 1, true, null)).toMatch(/check/i);
    expect(insertBox("겨울 선물", 1, true, null)).toBeNull();
    expect(insertBox("겨울 선물", rules.capacity_max, true, null)).toBeNull();
  });

  it("INV-GB3: 이름은 1~최대 글자 — 빈 이름·공백만·최대+1 은 거부", () => {
    expect(insertBox("", 30, true, null)).toMatch(/check/i);
    expect(insertBox("   ", 30, true, null)).toMatch(/check/i);
    expect(insertBox("가".repeat(rules.name_max + 1), 30, true, null)).toMatch(/check/i);
    expect(insertBox("가".repeat(rules.name_max), 30, true, null)).toBeNull();
  });

  it("INV-GB3 S3: 비공개는 초대 토큰이 있어야 하고, 공개는 토큰이 없다", () => {
    expect(insertBox("겨울 선물", 30, false, null)).toMatch(/check/i);
    expect(insertBox("겨울 선물", 30, true, TOKEN)).toMatch(/check/i);
    expect(insertBox("겨울 선물", 30, false, TOKEN)).toBeNull();
  });

  it("INV-GB2: 신청 상태는 정한 값만, 한 선물함에 같은 팬은 한 줄", () => {
    const { boxId } = makeBox(1);
    expect(psqlError(`insert into public.revgift_box_applications (box_id, fan_id) values ('${boxId}', '${FANS[0]}')`)).toMatch(/unique|duplicate/i);
    expect(psqlError(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${boxId}', '${FANS[1]}', 'won')`)).toMatch(/check/i);
  });
});

describe("명세서 금액 (INV-GB13)", () => {
  it("INV-GB13 S13: 극소형 둘·중형 하나, 정가 서비스료, 할증 없음, 착불 큰 상자 — 줄과 칸이 맞다", () => {
    const { boxId, apps } = makeBox(3);
    const cod = 6000;
    psql(`insert into public.revgift_box_cartons (box_id, cod_fee_krw) values ('${boxId}', ${cod})`);
    writeInvoice(boxId, [
      { application_id: apps[0], tier: "xsmall", region: "none" },
      { application_id: apps[1], tier: "xsmall", region: "none" },
      { application_id: apps[2], tier: "medium", region: "none" },
    ]);
    const ship = sendFee.xsmall * 2 + sendFee.medium;
    const inv = invoiceOf(boxId);
    expect(inv.shipping_fee_krw).toBe(ship + cod);
    expect(inv.service_fee_krw).toBe(fee.regular * 3);
    expect(inv.inspection_fee_krw).toBe(0);
    expect(inv.goods_krw).toBe(0);
    expect(inv.carton_cod_krw).toBe(cod);
    expect(inv.amount_krw).toBe(ship + cod + fee.regular * 3);
    expect(linesOf(boxId).map((l) => [l.tier, l.shipping_fee_krw, l.service_fee_krw, l.amount_krw])).toEqual([
      ["xsmall", sendFee.xsmall, fee.regular, sendFee.xsmall + fee.regular],
      ["xsmall", sendFee.xsmall, fee.regular, sendFee.xsmall + fee.regular],
      ["medium", sendFee.medium, fee.regular, sendFee.medium + fee.regular],
    ]);
  });

  it("INV-GB13 S13b: 명세서를 만든 뒤 택배비 설정을 바꿔도 저장된 금액은 그대로", () => {
    const { boxId, apps } = makeBox(1);
    writeInvoice(boxId, [{ application_id: apps[0], tier: "medium", region: "none" }]);
    const before = invoiceOf(boxId).amount_krw;
    try {
      psql(`update public.fan_send_fees set fee_krw = fee_krw + 1000 where tier = 'medium'`);
      expect(invoiceOf(boxId).amount_krw).toBe(before);
    } finally {
      psql(`update public.fan_send_fees set fee_krw = ${sendFee.medium} where tier = 'medium'`);
    }
  });

  it("INV-GB13 S13c: 착불 큰 상자 택배비는 0~상한 정수만 — −1·상한+1 거부", () => {
    const { boxId } = makeBox(0);
    expect(psqlError(`insert into public.revgift_box_cartons (box_id, cod_fee_krw) values ('${boxId}', -1)`)).toMatch(/check/i);
    expect(psqlError(`insert into public.revgift_box_cartons (box_id, cod_fee_krw) values ('${boxId}', ${rules.cod_max_krw + 1})`)).toMatch(/check/i);
    expect(psqlError(`insert into public.revgift_box_cartons (box_id, cod_fee_krw) values ('${boxId}', ${rules.cod_max_krw})`)).toBeNull();
  });

  it("INV-GB13: 줄 금액이나 명세서 칸을 나중에 고치면 칸 합이 어긋나 DB 가 거부한다", () => {
    const { boxId, apps } = makeBox(2);
    writeInvoice(boxId, [
      { application_id: apps[0], tier: "small", region: "none" },
      { application_id: apps[1], tier: "large", region: "none" },
    ]);
    // 줄 하나의 택배비와 금액을 함께 낮춤 — 줄 자체 합은 맞지만 명세서 칸과 어긋난다
    expect(
      psqlError(
        `update public.revgift_box_invoice_lines set shipping_fee_krw = shipping_fee_krw - 100, amount_krw = amount_krw - 100 where application_id = '${apps[0]}'`,
      ),
    ).toMatch(/명세서 칸/);
    // 명세서 결제 금액과 배송비 칸을 함께 올림 — 명세서 자체 합은 맞지만 줄 합과 어긋난다
    expect(
      psqlError(`update public.revgift_box_invoices set amount_krw = amount_krw + 100, shipping_fee_krw = shipping_fee_krw + 100 where box_id = '${boxId}'`),
    ).toMatch(/명세서 칸/);
    expect(psqlError(`update public.revgift_box_invoices set amount_krw = amount_krw + 100 where box_id = '${boxId}'`)).toMatch(/check/i);
  });

  it("INV-GB13: 한 선물함에 명세서는 하나, 다른 선물함의 신청·실측되지 않은 신청은 줄이 될 수 없다", () => {
    const a = makeBox(2);
    psql(`update public.revgift_box_applications set status = 'missing' where id = '${a.apps[1]}'`);
    expect(psqlError(writeInvoiceSql(a.boxId, [{ application_id: a.apps[1], tier: "small", region: "none" }]))).toMatch(/실측/);
    const b = insertId(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public) values ('${OWNER.id}', '${OWNER.creatorId}', '다른 선물함', 10, true) returning id`,
    );
    expect(psqlError(writeInvoiceSql(b, [{ application_id: a.apps[0], tier: "small", region: "none" }]))).toMatch(/실측/);
    writeInvoice(a.boxId, [{ application_id: a.apps[0], tier: "small", region: "none" }]);
    expect(psqlError(writeInvoiceSql(a.boxId, [{ application_id: a.apps[0], tier: "small", region: "none" }]))).toMatch(/unique|duplicate|이미/i);
  });

  it("INV-GB13: 명세서 쓰기·순번·월 사용 함수는 앱 키·서비스 키로 부르지 못한다", async () => {
    const { boxId, apps } = makeBox(1);
    const args = { p_box_id: boxId, p_lines: [{ application_id: apps[0], tier: "small", region: "none" }] };
    const creator = await signedInClient(OWNER.login);
    expect((await creator.rpc("revgift_box_write_invoice", args)).error).not.toBeNull();
    expect((await adminClient().rpc("revgift_box_write_invoice", args)).error).not.toBeNull();
    expect((await adminClient().rpc("early_creator_take_lines", { p_creator_id: OWNER.creatorId, p_count: 1, p_at: new Date().toISOString() })).error).not.toBeNull();
    expect((await creator.from("revgift_box_invoices").select("*")).data ?? []).toEqual([]);
    expect(psql(`select count(*) from public.revgift_box_invoices where box_id = '${boxId}'`)).toBe("0");
  });

  it("INV-GB13 (Q19): 서비스료 설정은 대표만 바꾸고 변경 기록이 남는다 — 직원·초기 요금 > 정가 거부", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const staff = await signedInClient("fankkuk_staff");
    try {
      expect((await staff.rpc("admin_save_box_service_fees", { p_regular_krw: fee.regular + 100, p_early_krw: fee.early })).error?.code).toBe("42501");
      expect((await owner.rpc("admin_save_box_service_fees", { p_regular_krw: fee.early - 1, p_early_krw: fee.early })).error?.code).toBe("22023");
      const before = Number(psql("select count(*) from public.pricing_setting_changes where item = 'box_service_fee'"));
      expect((await owner.rpc("admin_save_box_service_fees", { p_regular_krw: fee.regular + 100, p_early_krw: fee.early })).error).toBeNull();
      expect(psql("select box_service_fee_krw from public.pricing_settings")).toBe(String(fee.regular + 100));
      expect(Number(psql("select count(*) from public.pricing_setting_changes where item = 'box_service_fee'"))).toBe(before + 1);
      const read = await staff.rpc("admin_box_service_fees");
      expect(read.error).toBeNull();
      expect(read.data).toMatchObject({ regular_krw: fee.regular + 100, early_krw: fee.early });
    } finally {
      psql(`update public.pricing_settings set box_service_fee_krw = ${fee.regular}, box_early_service_fee_krw = ${fee.early}`);
    }
  });
});

describe("개인접수 (INV-GB16)", () => {
  it("INV-GB16 S16: 대형 초과는 운영자가 넣은 실비 + 서비스료", () => {
    const { boxId, apps } = makeBox(1);
    const personal = 13000;
    writeInvoice(boxId, [{ application_id: apps[0], tier: "oversize", personal_krw: personal, region: "none" }]);
    expect(linesOf(boxId)[0]).toMatchObject({ tier: "oversize", shipping_fee_krw: personal, service_fee_krw: fee.regular, amount_krw: personal + fee.regular });
  });

  it("INV-GB16 S16b: 실비 없음·대형 택배비 미만·상한 초과·구간과 실비를 함께 주면 거부", () => {
    const { boxId, apps } = makeBox(1);
    const bad = (personal: number | null, tier: Tier | "oversize" = "oversize") =>
      psqlError(writeInvoiceSql(boxId, [{ application_id: apps[0], tier, personal_krw: personal, region: "none" }]));
    expect(bad(null)).toMatch(/개인접수/);
    expect(bad(sendFee.large - 1)).toMatch(/개인접수/);
    expect(bad(rules.personal_max_krw + 1)).toMatch(/개인접수/);
    expect(bad(sendFee.large, "large")).toMatch(/개인접수/);
    expect(bad(sendFee.large)).toBeNull();
  });

  it("INV-GB16: 개인접수 범위는 함수 하나가 판정한다 — 경계 값", () => {
    expect(psql(`select public.revgift_box_ship_fee('oversize', ${sendFee.large})`)).toBe(String(sendFee.large));
    expect(psql(`select public.revgift_box_ship_fee('oversize', ${rules.personal_max_krw})`)).toBe(String(rules.personal_max_krw));
    expect(psql(`select public.revgift_box_ship_fee('small', null)`)).toBe(String(sendFee.small));
    expect(psqlError(`select public.revgift_box_ship_fee('huge', null)`)).toMatch(/구간/);
  });
});

describe("제주·도서 할증 (INV-GB17)", () => {
  it("INV-GB17 S17: 줄마다 따로 — 제주·도서는 설정값을 더하고, 할증 없음은 0", () => {
    const { boxId, apps } = makeBox(3);
    writeInvoice(boxId, [
      { application_id: apps[0], tier: "small", region: "jeju" },
      { application_id: apps[1], tier: "small", region: "island" },
      { application_id: apps[2], tier: "small", region: "none" },
    ]);
    const l = linesOf(boxId);
    expect(l.map((x) => [x.surcharge_region, x.surcharge_krw])).toEqual([
      ["jeju", surcharge.jeju],
      ["island", surcharge.island],
      ["none", 0],
    ]);
    expect(l[0].amount_krw).toBe(sendFee.small + surcharge.jeju + fee.regular);
    expect(invoiceOf(boxId).shipping_fee_krw).toBe(sendFee.small * 3 + surcharge.jeju + surcharge.island);
  });

  it("INV-GB17: 모르는 구분은 거부, 개인접수 줄에도 할증이 붙는다", () => {
    const { boxId, apps } = makeBox(1);
    expect(psqlError(writeInvoiceSql(boxId, [{ application_id: apps[0], tier: "small", region: "seoul" as Region }]))).toMatch(/할증/);
    writeInvoice(boxId, [{ application_id: apps[0], tier: "oversize", personal_krw: sendFee.large, region: "jeju" }]);
    expect(linesOf(boxId)[0].amount_krw).toBe(sendFee.large + surcharge.jeju + fee.regular);
  });
});

describe("초기 크리에이터 순번 (INV-GB14)", () => {
  const approveEventSql = (creatorId: string) =>
    `insert into public.creator_verification_events (creator_id, acted_by, action) values ('${creatorId}', '${OWNER_ID}', 'approve')`;

  it("INV-GB14: 운영자 승인 처리 안에서 다음 순번을 받는다", async () => {
    const next = Number(psql("select last_rank from public.early_creator_counter")) + 1;
    expect(next).toBeLessThanOrEqual(rules.early_max_rank);
    const a = await requestOk("ggul", "https://www.youtube.com/@ggulearly");
    expect((await approve(a.application_id)).error).toBeNull();
    expect(rankOf(CV.ggul.creatorId)).toBe(String(next));
    // 혜택 시작 = 그 승인 기록의 시각
    expect(
      psql(
        `select (select granted_at from public.early_creators where creator_id = '${CV.ggul.creatorId}') = (select min(at) from public.creator_verification_events where creator_id = '${CV.ggul.creatorId}' and action = 'approve')`,
      ),
    ).toBe("t");
  });

  it("INV-GB14 S14: 마지막 자리에 승인 둘이 동시에 와도 마지막 순번은 한 명, 다른 하나는 초기 크리에이터가 아니다", async () => {
    psql(`update public.early_creator_counter set last_rank = ${rules.early_max_rank - 1}`);
    const hold = await holdRowLock("select 1 from public.early_creator_counter for update", 2);
    const [x, y] = await Promise.all([psqlAsync(approveEventSql(CV.summer.creatorId)), psqlAsync(approveEventSql(CV.haru.creatorId))]);
    await hold.released;
    expect([x.ok, y.ok]).toEqual([true, true]);
    const ranks = [rankOf(CV.summer.creatorId), rankOf(CV.haru.creatorId)].sort();
    expect(ranks).toEqual([String(rules.early_max_rank), "none"]);
    expect(psql("select last_rank from public.early_creator_counter")).toBe(String(rules.early_max_rank));
    expect(psqlError(`insert into public.early_creators (creator_id, rank, granted_at) values ('${CV.ggul.creatorId}', ${rules.early_max_rank + 1}, now())`)).toMatch(/check/i);
  });

  it("INV-GB14 (Q14): 한 번 받은 순번은 다시 승인돼도 그대로, 빈 자리를 다시 채우지 않는다", () => {
    psql(`update public.early_creator_counter set last_rank = 20`);
    psql(approveEventSql(CV.summer.creatorId));
    expect(rankOf(CV.summer.creatorId)).toBe("21");
    psql(`insert into public.creator_verification_events (creator_id, acted_by, action) values ('${CV.summer.creatorId}', '${OWNER_ID}', 'revoke')`);
    psql(approveEventSql(CV.summer.creatorId));
    expect(rankOf(CV.summer.creatorId)).toBe("21");
    expect(psql("select last_rank from public.early_creator_counter")).toBe("21");
    expect(psqlError(`insert into public.early_creators (creator_id, rank, granted_at) values ('${CV.haru.creatorId}', 21, now())`)).toMatch(/unique|duplicate/i);
  });

  it("INV-GB14: 기능 전에 확인된 크리에이터는 승인 기록 시각 순으로 순번을 받는다(기록 없는 계정은 그 뒤 가입 순)", () => {
    const out = psql(
      [
        "begin;",
        "set local session_replication_role = replica;",
        "delete from public.early_creators;",
        "update public.early_creator_counter set last_rank = 0;",
        `update public.creators set identity_verified = true where id in ('${CV.ggul.creatorId}', '${CV.summer.creatorId}');`,
        `insert into public.creator_verification_events (at, creator_id, acted_by, action) values ('2026-10-02 10:00+09', '${CV.summer.creatorId}', '${OWNER_ID}', 'approve'), ('2026-10-03 10:00+09', '${CV.ggul.creatorId}', '${OWNER_ID}', 'approve'), ('2026-10-04 10:00+09', '${CV.summer.creatorId}', '${OWNER_ID}', 'approve');`,
        "select 'n=' || public.early_creators_backfill();",
        `select string_agg(e.rank::text || ':' || coalesce(case e.creator_id when '${CV.summer.creatorId}' then 'summer' when '${CV.ggul.creatorId}' then 'ggul' end, 'seed'), ',' order by e.rank) from public.early_creators e;`,
        `select (select granted_at from public.early_creators where creator_id = '${CV.summer.creatorId}') = '2026-10-02 10:00+09'::timestamptz;`,
        "select 'counter=' || last_rank from public.early_creator_counter;",
        "select 'again=' || public.early_creators_backfill();",
        "rollback;",
      ].join(" "),
    );
    const lines = out.split("\n");
    const n = Number(lines.find((l) => l.startsWith("n="))?.slice(2));
    expect(n).toBeGreaterThanOrEqual(2);
    expect(n).toBeLessThanOrEqual(rules.early_max_rank);
    const order = lines.find((l) => l.startsWith("1:")) ?? "";
    expect(order.startsWith("1:summer,2:ggul")).toBe(true);
    expect(order.split(",").length).toBe(n);
    expect(lines).toContain("t");
    expect(lines).toContain(`counter=${n}`);
    expect(lines).toContain("again=0");
  });
});

describe("초기 크리에이터 서비스료 (INV-GB14·GB15)", () => {
  const NOV = "2026-11-01";
  const AT_NOV = "2026-11-20 12:00+09";

  // 2026-11-09 개정 — 혜택 기간은 계정을 유지하는 동안(앞선 「승인일부터 달력 3개월」을 대체). 탈퇴하면 끝.
  const setWithdrawn = (at: string | null) =>
    psql(
      `begin; set local session_replication_role = replica; update public.creators set withdrawn_at = ${at === null ? "null" : `'${at}'::timestamptz`} where id = '${OWNER.creatorId}'; commit;`,
    );

  it("INV-GB14 S14b: 순번이 있고 계정을 유지하면 석 달·2년이 지나도 초기 요금", () => {
    makeEarly("2026-11-10 10:00+09");
    for (const at of ["2027-02-10 10:00+09", "2028-11-10 10:00+09"]) {
      const a = makeBox(1);
      writeInvoice(a.boxId, [{ application_id: a.apps[0], tier: "small", region: "none" }], at);
      expect(linesOf(a.boxId)[0]).toMatchObject({ service_fee_krw: fee.early, early_rate: true });
    }
  });

  it("INV-GB14 (실패경로): 승인 전 시각의 명세서는 정가 — 혜택은 순번을 받은 때부터", () => {
    makeEarly("2026-11-10 10:00+09");
    const a = makeBox(1);
    writeInvoice(a.boxId, [{ application_id: a.apps[0], tier: "small", region: "none" }], "2026-11-10 09:59+09");
    expect(linesOf(a.boxId)[0]).toMatchObject({ service_fee_krw: fee.regular, early_rate: false });
  });

  it("INV-GB14 S14d (실패경로): 탈퇴한 초기 크리에이터 — 탈퇴 뒤 명세서는 정가, 월 사용도 세지 않는다", () => {
    makeEarly("2026-11-02 10:00+09");
    try {
      setWithdrawn("2026-11-15 10:00+09");
      const before = makeBox(1);
      writeInvoice(before.boxId, [{ application_id: before.apps[0], tier: "small", region: "none" }], "2026-11-14 10:00+09");
      expect(linesOf(before.boxId)[0].early_rate).toBe(true);
      const after = makeBox(1);
      writeInvoice(after.boxId, [{ application_id: after.apps[0], tier: "small", region: "none" }], "2026-11-20 12:00+09");
      expect(linesOf(after.boxId)[0]).toMatchObject({ service_fee_krw: fee.regular, early_rate: false });
      expect(usageOf("2026-11-01")).toBe(1);
    } finally {
      setWithdrawn(null);
    }
  });

  it("INV-GB14 S14d (실패경로): 탈퇴한 계정의 순번은 비어도 다시 채우지 않는다 — 다음 승인은 카운터 다음 순번", () => {
    psql(`update public.early_creator_counter set last_rank = 20`);
    psql(`insert into public.creator_verification_events (creator_id, acted_by, action) values ('${CV.summer.creatorId}', '${OWNER_ID}', 'approve')`);
    expect(rankOf(CV.summer.creatorId)).toBe("21");
    psql(`delete from public.early_creators where creator_id = '${CV.summer.creatorId}'`); // 탈퇴·자동 삭제로 순번 줄이 없어진 경우
    psql(`insert into public.creator_verification_events (creator_id, acted_by, action) values ('${CV.haru.creatorId}', '${OWNER_ID}', 'approve')`);
    expect(rankOf(CV.haru.creatorId)).toBe("22");
  });

  it("INV-GB14 S14c: 순번이 없는 크리에이터는 정가, 월 사용도 세지 않는다", () => {
    const a = makeBox(2);
    writeInvoice(a.boxId, [
      { application_id: a.apps[0], tier: "small", region: "none" },
      { application_id: a.apps[1], tier: "small", region: "none" },
    ], AT_NOV);
    expect(linesOf(a.boxId).map((l) => l.service_fee_krw)).toEqual([fee.regular, fee.regular]);
    expect(usageOf(NOV)).toBe(0);
  });

  it("INV-GB15 S15: 그 달 남은 건수만큼 앞 줄부터 초기 요금, 나머지 정가, 사용이 한도에 닿는다", () => {
    makeEarly("2026-11-02 10:00+09");
    setUsage(NOV, rules.early_monthly_lines - 2);
    const a = makeBox(5);
    writeInvoice(a.boxId, a.apps.map((id) => ({ application_id: id, tier: "small" as const, region: "none" as const })), AT_NOV);
    expect(linesOf(a.boxId).map((l) => l.service_fee_krw)).toEqual([fee.early, fee.early, fee.regular, fee.regular, fee.regular]);
    expect(usageOf(NOV)).toBe(rules.early_monthly_lines);
    expect(invoiceOf(a.boxId).service_fee_krw).toBe(fee.early * 2 + fee.regular * 3);
  });

  it("INV-GB15: 달은 한국 시간 달력 달 — 11-30 23:59 는 11월, 12-01 00:00 은 새 달", () => {
    makeEarly("2026-11-02 10:00+09");
    setUsage(NOV, rules.early_monthly_lines);
    const a = makeBox(1);
    writeInvoice(a.boxId, [{ application_id: a.apps[0], tier: "small", region: "none" }], "2026-11-30 23:59+09");
    expect(linesOf(a.boxId)[0].early_rate).toBe(false);
    const b = makeBox(1);
    writeInvoice(b.boxId, [{ application_id: b.apps[0], tier: "small", region: "none" }], "2026-12-01 00:00+09");
    expect(linesOf(b.boxId)[0].early_rate).toBe(true);
    expect(usageOf("2026-12-01")).toBe(1);
  });

  it("INV-GB15 S15b: 명세서 둘이 동시에 만들어져도 그 달 초기 요금 줄의 합은 남은 건수를 넘지 않는다", async () => {
    makeEarly("2026-11-02 10:00+09");
    setUsage(NOV, rules.early_monthly_lines - 2);
    const a = makeBox(2);
    const b = insertId(
      `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public) values ('${OWNER.id}', '${OWNER.creatorId}', '둘째 선물함', 10, true) returning id`,
    );
    const bApps = FANS.slice(2, 4).map((fan) =>
      insertId(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${b}', '${fan}', 'measured') returning id`),
    );
    const hold = await holdRowLock(`select 1 from public.early_creator_monthly_usage where creator_id = '${OWNER.creatorId}' and month = '${NOV}' for update`, 2);
    const [x, y] = await Promise.all([
      psqlAsync(writeInvoiceSql(a.boxId, a.apps.map((id) => ({ application_id: id, tier: "small", region: "none" })), AT_NOV)),
      psqlAsync(writeInvoiceSql(b, bApps.map((id) => ({ application_id: id, tier: "small", region: "none" })), AT_NOV)),
    ]);
    await hold.released;
    expect([x.ok, y.ok]).toEqual([true, true]);
    const earlyLines = [...linesOf(a.boxId), ...linesOf(b)].filter((l) => l.early_rate).length;
    expect(earlyLines).toBe(2);
    expect(usageOf(NOV)).toBe(rules.early_monthly_lines);
  });

  it("INV-GB15: 월 사용은 DB 가 한도를 넘지 못하게 막는다", () => {
    expect(psqlError(`insert into public.early_creator_monthly_usage (creator_id, month, used) values ('${OWNER.creatorId}', '${NOV}', ${rules.early_monthly_lines + 1})`)).toMatch(/check/i);
    expect(psqlError(`insert into public.early_creator_monthly_usage (creator_id, month, used) values ('${OWNER.creatorId}', '2026-11-15', 1)`)).toMatch(/check/i);
  });
});
