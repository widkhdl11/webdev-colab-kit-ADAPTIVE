import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteTestFollows, followForTest, holdRowLock, psql, signedInClient } from "./helpers";
import { PROFILE, sampleEnvelope } from "./revgift-helpers";

// 선물함 2026-11-09 개정 — 대기 신청 · 마감 때 대기 고르기(정원 무관) · 0명 마감 (revgift-box INV-GB1·GB2·GB5·GB7·GB8·GB9·GB20, Q20·Q21,
// S5c·S5d·S5e·S5f·S7d·S8b·S8c·S8d·S8e·S8f·S9d).
// 선물함 주인은 시드 크리에이터 하루, 다른 크리에이터는 모모. 팬 다섯: 별빛(시드에서 하루를 팔로우)·달토끼·구름빵·솜사탕·하늘(시험이 팔로우를 붙인다).
// 신청 함수는 주소 사본(pii, manual/0031)까지 한 처리다 — 0031 은 이미 적용돼 있다.
// 고르지 않은 대기 신청의 사본을 지우는 까닭 「waitlist_at_close」는 pii 의 사본 삭제 함수가 받아야 해서 manual/0036 이 적용돼야 한다 —
// 그 시험은 이름에 「(manual/0036 뒤)」를 달았다. 0036 전에는 고르지 않은 대기 신청이 있는 마감이 통째로 실패한다(아무것도 바뀌지 않는다).

const HARU_CREATOR = "00000000-0000-4000-b000-000000000001";
const MOMO_CREATOR = "00000000-0000-4000-b000-000000000002";
const HANEUL = "00000000-0000-4000-a000-000000000005";

let haru: SupabaseClient;
let momo: SupabaseClient;
let byeolbit: SupabaseClient;
let daltokki: SupabaseClient;
let gureum: SupabaseClient;
let somsa: SupabaseClient;
let haneul: SupabaseClient;

function deleteBoxes(): void {
  psql(`delete from public.revgift_boxes where creator_id in ('${HARU_CREATOR}', '${MOMO_CREATOR}')`);
}
function makeBox(o: { capacity?: number; status?: string; owner?: "haru" | "momo" } = {}): string {
  const [owner, creator] = o.owner === "momo" ? [PROFILE.momo, MOMO_CREATOR] : [PROFILE.haru, HARU_CREATOR];
  return psql(
    `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${owner}', '${creator}', '시험 선물함', ${o.capacity ?? 10}, true, '${o.status ?? "open"}') returning id`,
  ).split("\n")[0]!;
}
/** 신청 줄을 DB 에 바로 넣는다(주소 사본 없이). 대기 순번은 신청 시각 순이라 seconds 로 시각을 벌린다. */
function addApp(boxId: string, fanId: string, status = "applied", seconds = 0): string {
  return psql(
    `insert into public.revgift_box_applications (box_id, fan_id, status, applied_at) values ('${boxId}', '${fanId}', '${status}', now() + interval '${seconds} seconds') returning id`,
  ).split("\n")[0]!;
}
function boxStatus(boxId: string): string {
  return psql(`select status from public.revgift_boxes where id = '${boxId}'`);
}
function appStatus(appId: string): string {
  return psql(`select status from public.revgift_box_applications where id = '${appId}'`);
}
function countOf(boxId: string, status: string): number {
  return Number(psql(`select count(*) from public.revgift_box_applications where box_id = '${boxId}' and status = '${status}'`));
}
function copyOf(appId: string): string {
  return psql(`select coalesce((select surcharge_region from pii.revgift_box_addresses where application_id = '${appId}'), '')`);
}
function copyEvents(appId: string): string[] {
  const out = psql(`select event || coalesce(':' || reason, '') from public.revgift_box_address_events where application_id = '${appId}' order by at, id`);
  return out === "" ? [] : out.split("\n");
}
async function apply(fan: SupabaseClient, boxId: string) {
  return fan.rpc("revgift_box_apply", { p_box_id: boxId, p_token: null, p_envelope: sampleEnvelope(), p_region: "none" });
}
async function close(who: SupabaseClient, boxId: string, waitlisted: string[] = []) {
  return who.rpc("revgift_box_close", { p_box_id: boxId, p_waitlisted: waitlisted });
}
type CreatorApp = { id: string; nickname: string; status: string; waitlist_no: number | null } & Record<string, unknown>;
async function creatorApps(boxId: string): Promise<CreatorApp[]> {
  return ((await haru.rpc("my_revgift_box", { p_box_id: boxId })).data as { applications: CreatorApp[] }).applications;
}
async function fanView(fan: SupabaseClient, boxId: string): Promise<Record<string, unknown>> {
  return (await fan.rpc("revgift_box_for_fan", { p_box_id: boxId, p_token: null })).data as Record<string, unknown>;
}

beforeAll(async () => {
  [haru, momo, byeolbit, daltokki, gureum, somsa, haneul] = await Promise.all(
    ["haru_creator", "momo_creator", "byeolbit_fan", "daltokki_fan", "gureumppang_fan", "somsatang_fan", "haneul_fan"].map((l) => signedInClient(l)),
  );
  deleteBoxes();
  for (const fan of [PROFILE.daltokki, PROFILE.gureumppang, PROFILE.somsatang, HANEUL]) followForTest(fan, HARU_CREATOR);
});
beforeEach(() => deleteBoxes());
afterAll(() => {
  deleteBoxes();
  deleteTestFollows();
});

describe("INV-GB5 · INV-GB2: 다 차면 대기로 받는다 — 순번은 신청 시각 순, 저절로 정원 안으로 들어가지 않는다", () => {
  it("INV-GB5 S5c: 인원 2·신청 2 → 달토끼·하늘 신청은 대기 1·2번, 정원 안은 2 그대로. 달토끼가 거두면 하늘이 1번", async () => {
    const boxId = makeBox({ capacity: 2 });
    addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.gureumppang);
    const d = await apply(daltokki, boxId);
    const h = await apply(haneul, boxId);
    expect([d.error, h.error]).toEqual([null, null]);
    expect([appStatus(d.data as string), appStatus(h.data as string)]).toEqual(["waitlisted", "waitlisted"]);
    expect(countOf(boxId, "applied")).toBe(2);
    // 내 선물함 목록의 신청 수에 대기는 들지 않는다(정원을 차지하지 않는다)
    expect(((await haru.rpc("my_revgift_boxes")).data as { id: string; active_count: number }[]).find((b) => b.id === boxId)?.active_count).toBe(2);
    expect((await creatorApps(boxId)).filter((a) => a.status === "waitlisted").map((a) => [a.nickname, a.waitlist_no])).toEqual([
      ["달토끼", 1],
      ["하늘", 2],
    ]);
    expect(await fanView(daltokki, boxId)).toMatchObject({ my_state: "waitlisted", waitlist_no: 1 });
    expect((await daltokki.rpc("revgift_box_withdraw", { p_box_id: boxId })).error).toBeNull();
    expect(appStatus(d.data as string)).toBe("withdrawn");
    expect(copyOf(d.data as string)).toBe("");
    expect(await fanView(haneul, boxId)).toMatchObject({ my_state: "waitlisted", waitlist_no: 1 });
  });

  it("INV-GB5 S5d · Q20 (실패경로): 자리가 나도 대기 1번은 그대로, 그 뒤 새 신청은 대기 뒤로(2번) — 먼저 기다린 팬보다 앞서지 않는다", async () => {
    const boxId = makeBox({ capacity: 2 });
    const a = addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.gureumppang);
    const d = (await apply(daltokki, boxId)).data as string;
    expect(appStatus(d)).toBe("waitlisted");
    expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: true })).data).toBe("excluded");
    expect(appStatus(d)).toBe("waitlisted");
    const h = (await apply(haneul, boxId)).data as string;
    expect(appStatus(h)).toBe("waitlisted");
    expect(countOf(boxId, "applied")).toBe(1);
    expect((await creatorApps(boxId)).filter((x) => x.status === "waitlisted").map((x) => [x.id, x.waitlist_no])).toEqual([
      [d, 1],
      [h, 2],
    ]);
  });

  it("INV-GB5 S5b · S5e (실패경로): 대기가 없으면 난 자리에 새 신청이 들어간다. 그 뒤 다시 넣기는 정원 안에서만 — P0023, 대기로도 가지 않는다", async () => {
    const boxId = makeBox({ capacity: 2 });
    const a = addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.gureumppang);
    await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: true });
    const s = (await apply(somsa, boxId)).data as string;
    expect(appStatus(s)).toBe("applied");
    expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: a, p_excluded: false })).error?.code).toBe("P0023");
    expect(appStatus(a)).toBe("excluded");
    expect(countOf(boxId, "waitlisted")).toBe(0);
  });

  it("INV-GB2 (실패경로): 대기 신청은 제외·다시 넣기 대상이 아니다 — P0022, 그대로 대기", async () => {
    const boxId = makeBox({ capacity: 1 });
    addApp(boxId, PROFILE.byeolbit);
    const w = addApp(boxId, PROFILE.gureumppang, "waitlisted");
    for (const excluded of [true, false]) {
      expect((await haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: w, p_excluded: excluded })).error?.code).toBe("P0022");
    }
    expect(appStatus(w)).toBe("waitlisted");
  });

  it("INV-GB5 S5f (동시): 인원 2·신청 1·제외된 달토끼 — 하늘 신청과 달토끼 다시 넣기가 동시에 → 정원 안은 정확히 2, 늦은 쪽은 대기 1번이거나 P0023", async () => {
    const boxId = makeBox({ capacity: 2 });
    addApp(boxId, PROFILE.byeolbit);
    const d = addApp(boxId, PROFILE.daltokki, "excluded");
    // 선물함 줄을 잡아 두면 두 요청 모두 그 잠금 앞에서 줄을 선다 — 풀리는 순간 겹친다
    const hold = await holdRowLock(`select 1 from public.revgift_boxes where id = '${boxId}' for update`, 1);
    const [ap, back] = await Promise.all([apply(haneul, boxId), haru.rpc("revgift_box_set_excluded", { p_box_id: boxId, p_application_id: d, p_excluded: false })]);
    await hold.released;
    expect(ap.error).toBeNull();
    expect(countOf(boxId, "applied")).toBe(2);
    const outcome = [appStatus(ap.data as string), back.data ?? back.error?.code];
    expect([
      ["applied", "P0023"],
      ["waitlisted", "applied"],
    ]).toContainEqual(outcome);
  });
});

describe("INV-GB8 · INV-GB1: 마감 — 대기 고르기(정원 무관) · 넣을 목록 대조 · 0명 마감", () => {
  it("INV-GB8 S8c: 인원 2·신청 2·대기 셋을 모두 골라 마감 → 담길 차례 5명(정원을 넘음), 돌려주는 값 5", async () => {
    const boxId = makeBox({ capacity: 2 });
    const apps = [addApp(boxId, PROFILE.byeolbit), addApp(boxId, PROFILE.daltokki)];
    const waits = [PROFILE.gureumppang, PROFILE.somsatang, HANEUL].map((f, i) => addApp(boxId, f, "waitlisted", i + 1));
    const r = await close(haru, boxId, waits);
    expect(r.error).toBeNull();
    expect(r.data).toBe(apps.length + waits.length);
    expect(boxStatus(boxId)).toBe("closed");
    expect(countOf(boxId, "selected")).toBe(apps.length + waits.length);
    expect(psql(`select ended_at is null from public.revgift_boxes where id = '${boxId}'`)).toBe("t");
  });

  it("INV-GB8 S8c: 대기 1·2·3번 중 1·3번만 골라 마감 → 담길 차례 4명, 2번은 끝 (manual/0036 뒤)", async () => {
    const boxId = makeBox({ capacity: 2 });
    addApp(boxId, PROFILE.byeolbit);
    addApp(boxId, PROFILE.daltokki);
    const [w1, w2, w3] = [PROFILE.gureumppang, PROFILE.somsatang, HANEUL].map((f, i) => addApp(boxId, f, "waitlisted", i + 1));
    const r = await close(haru, boxId, [w1!, w3!]);
    expect(r.error).toBeNull();
    expect(r.data).toBe(4);
    expect([appStatus(w1!), appStatus(w2!), appStatus(w3!)]).toEqual(["selected", "waitlisted", "selected"]);
    // 끝난 대기 신청은 크리에이터 화면에 순번이 없다
    expect((await creatorApps(boxId)).find((a) => a.id === w2)?.waitlist_no).toBeNull();
  });

  it("INV-GB8 S8d (실패경로): 다른 선물함의 대기·이 선물함의 정원 안·제외·없는 번호를 넣으면 마감 전체 거부(P0028), 아무것도 바뀌지 않는다", async () => {
    const a = makeBox({ capacity: 1 });
    const inA = addApp(a, PROFILE.byeolbit);
    const exA = addApp(a, PROFILE.daltokki, "excluded");
    const wA = addApp(a, PROFILE.gureumppang, "waitlisted");
    const b = makeBox({ owner: "momo" });
    const b1 = addApp(b, PROFILE.somsatang, "waitlisted");
    for (const bad of [b1, inA, exA, "00000000-0000-4000-9000-000000000000"]) {
      expect((await close(haru, a, [wA, bad])).error?.code).toBe("P0028");
      expect(boxStatus(a)).toBe("open");
      expect([appStatus(inA), appStatus(exA), appStatus(wA), appStatus(b1)]).toEqual(["applied", "excluded", "waitlisted", "waitlisted"]);
    }
    expect(boxStatus(b)).toBe("open");
  });

  it("INV-GB8 S8e (실패경로): 모모(다른 크리에이터)·별빛(팬)이 하루 선물함 마감 → P0002, 변화 없음", async () => {
    const boxId = makeBox();
    const a = addApp(boxId, PROFILE.byeolbit);
    for (const who of [momo, byeolbit]) {
      expect((await close(who, boxId)).error?.code).toBe("P0002");
    }
    expect([boxStatus(boxId), appStatus(a)]).toEqual(["open", "applied"]);
  });

  it("INV-GB8 S8b · INV-GB1 S8f · Q21: 신청이 모두 제외·대기 없음 → 넣을 목록 비우고 마감 = closed, 담길 차례 0, 끝난 시각 = 마감 시각", async () => {
    const boxId = makeBox();
    const x = addApp(boxId, PROFILE.byeolbit, "excluded");
    const before = psql("select now()::text");
    const r = await close(haru, boxId);
    expect(r.error).toBeNull();
    expect(r.data).toBe(0);
    expect([boxStatus(boxId), appStatus(x)]).toEqual(["closed", "excluded"]);
    expect(psql(`select ended_at >= '${before}'::timestamptz and ended_at <= now() from public.revgift_boxes where id = '${boxId}'`)).toBe("t");
    // 신청이 하나도 없던 선물함도 같다
    const empty = makeBox();
    expect((await close(haru, empty)).data).toBe(0);
    expect(boxStatus(empty)).toBe("closed");
  });

  it("INV-GB1 S8f (실패경로): 0명 마감 선물함은 끝 — 상자 고르기 「다음」(6자리 발급)·선물함 취소·라벨 모두 P0022, 6자리 없음", async () => {
    const boxId = makeBox();
    await close(haru, boxId);
    expect((await haru.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: {} })).error?.code).toBe("P0022");
    expect((await haru.rpc("revgift_box_cancel", { p_box_id: boxId })).error?.code).toBe("P0022");
    expect((await haru.rpc("my_revgift_box_labels", { p_box_id: boxId })).error?.code).toBe("P0022");
    expect(psql(`select status || '|' || coalesce(inbound_code, '-') from public.revgift_boxes where id = '${boxId}'`)).toBe("closed|-");
    // 담길 차례가 있는 마감은 그대로 「다음」으로 간다(위 거부가 마감 전체를 막은 것이 아니다)
    const live = makeBox();
    const a = addApp(live, PROFILE.byeolbit);
    await close(haru, live);
    const next = await haru.rpc("revgift_box_submit_tiers", { p_box_id: live, p_tiers: { [a]: "small" } });
    expect(next.error).toBeNull();
    expect(boxStatus(live)).toBe("awaiting_box");
  });

  it("INV-GB8 S8: 마감 뒤에는 대기 신청도 없다 — 새 신청 P0022", async () => {
    const boxId = makeBox({ capacity: 1 });
    addApp(boxId, PROFILE.byeolbit);
    await close(haru, boxId);
    expect((await apply(haneul, boxId)).error?.code).toBe("P0022");
    expect(countOf(boxId, "waitlisted")).toBe(0);
  });
});

describe("Q21 · my-account INV-A15·A16: 0명 마감은 끝난 선물함으로 센다", () => {
  it("my-account INV-A16 · Q21: 끝난 지 5년 넘은 0명 마감 선물함(크리에이터 탈퇴)은 자동 삭제가 지운다, 담길 차례가 있는 마감은 그대로", () => {
    const ghost = psql(
      `insert into public.profiles (id, login_id, nickname, role, withdrawn_at) values (gen_random_uuid(), 'withdrawn_it' || substr(md5(random()::text), 1, 10), '탈퇴한 크리에이터', 'creator', now()) returning id`,
    ).split("\n")[0]!;
    const mk = () =>
      psql(
        `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public, status) values ('${ghost}', '${HARU_CREATOR}', '시험 선물함', 3, true, 'open') returning id`,
      ).split("\n")[0]!;
    const empty = mk();
    const live = mk();
    psql(`insert into public.revgift_box_applications (box_id, fan_id, status) values ('${live}', '${PROFILE.byeolbit}', 'selected')`);
    psql(`update public.revgift_boxes set status = 'closed' where id in ('${empty}', '${live}')`);
    expect(psql(`select string_agg((ended_at is not null)::text, ',' order by (id = '${empty}') desc) from public.revgift_boxes where id in ('${empty}', '${live}')`)).toBe("true,false");
    psql(`update public.revgift_boxes set ended_at = now() - interval '5 years 1 day' where id = '${empty}'`);
    psql("select public.retention_purge()");
    expect(psql(`select count(*) from public.revgift_boxes where id = '${empty}'`)).toBe("0");
    expect(boxStatus(live)).toBe("closed");
  });

  it("my-account INV-A15: 0명 마감 선물함만 남은 크리에이터는 그 선물함 때문에 탈퇴가 막히지 않는다(신청 받는 중이면 막힌다)", () => {
    const ghost = psql(
      // 진행 중인 다른 일이 없는 계정이 필요하다 — 판정은 계정 id 만 보므로 로그인 계정 없는 프로필(탈퇴 표시)을 선물함 주인으로 둔다
      `insert into public.profiles (id, login_id, nickname, role, withdrawn_at) values (gen_random_uuid(), 'gbw_it' || substr(md5(random()::text), 1, 10), '시험 계정', 'creator', now()) returning id`,
    ).split("\n")[0]!;
    try {
      const boxId = psql(
        `insert into public.revgift_boxes (owner_id, creator_id, name, capacity, is_public) values ('${ghost}', '${HARU_CREATOR}', '시험 선물함', 3, true) returning id`,
      ).split("\n")[0]!;
      expect(psql(`select public.account_has_open_work('${ghost}', null)`)).toBe("t");
      psql(`update public.revgift_boxes set status = 'closed' where id = '${boxId}'`);
      expect(psql(`select public.account_has_open_work('${ghost}', null)`)).toBe("f");
    } finally {
      psql(`delete from public.revgift_boxes where owner_id = '${ghost}'; delete from public.profiles where id = '${ghost}'`);
    }
  });

  it("my-account INV-A15: 대기 신청한 팬은 신청 받는 중에는 진행 중, 고르지 않은 채 마감되면 끝 (manual/0036 뒤)", async () => {
    expect(psql(`select public.account_has_open_work('${HANEUL}', null)`)).toBe("f");
    const boxId = makeBox({ capacity: 1 });
    addApp(boxId, PROFILE.byeolbit);
    const w = (await apply(haneul, boxId)).data as string;
    expect(appStatus(w)).toBe("waitlisted");
    expect(psql(`select public.account_has_open_work('${HANEUL}', null)`)).toBe("t");
    expect((await close(haru, boxId)).error).toBeNull();
    expect(psql(`select public.account_has_open_work('${HANEUL}', null)`)).toBe("f");
  });
});

describe("INV-GB7 · INV-GB20: 대기 신청의 주소 사본 — 고르지 않으면 마감 때, 선물함 취소면 모두 지운다", () => {
  it("INV-GB7 S7d: 대기 구름빵·솜사탕 중 구름빵만 골라 마감 → 솜사탕 사본 0·지운 기록 한 줄, 구름빵 사본 그대로, 솜사탕에게는 「마감」 (manual/0036 뒤)", async () => {
    const boxId = makeBox({ capacity: 1 });
    addApp(boxId, PROFILE.byeolbit);
    const g = (await apply(gureum, boxId)).data as string;
    const s = (await apply(somsa, boxId)).data as string;
    expect([appStatus(g), appStatus(s)]).toEqual(["waitlisted", "waitlisted"]);
    expect((await close(haru, boxId, [g])).data).toBe(2);
    expect(copyOf(s)).toBe("");
    expect(copyEvents(s)).toEqual(["entered", "deleted:waitlist_at_close"]);
    expect(copyOf(g)).not.toBe("");
    expect(copyEvents(g)).toEqual(["entered"]);
    expect(await fanView(somsa, boxId)).toMatchObject({ my_state: "closed", waitlist_no: null });
    expect(await fanView(gureum, boxId)).toMatchObject({ my_state: "preparing" });
  });

  it("INV-GB7 S7d · INV-GB20: 대기 신청이 있는 선물함 취소 → 대기 신청도 끝, 사본 모두 0", async () => {
    const boxId = makeBox({ capacity: 1 });
    const a = (await apply(byeolbit, boxId)).data as string;
    const w = (await apply(haneul, boxId)).data as string;
    expect(appStatus(w)).toBe("waitlisted");
    expect((await haru.rpc("revgift_box_cancel", { p_box_id: boxId })).error).toBeNull();
    expect([appStatus(a), appStatus(w)]).toEqual(["ended", "ended"]);
    expect([copyOf(a), copyOf(w)]).toEqual(["", ""]);
    expect(copyEvents(w)).toEqual(["entered", "deleted:box_cancelled"]);
  });
});

describe("INV-GB9: 대기 순번 — 크리에이터에게는 순번·닉네임·신청 시각만, 팬에게는 자기 순번 하나", () => {
  it("INV-GB9 S9d: 대기 2번 하늘 — 크리에이터 줄의 칸은 정해진 여섯, 주소·실명·번호 꼴 값이 없다. 하늘에게는 「대기 2번」뿐", async () => {
    const boxId = makeBox({ capacity: 1 });
    addApp(boxId, PROFILE.byeolbit);
    await apply(somsa, boxId);
    await apply(haneul, boxId);
    const apps = await creatorApps(boxId);
    expect(apps.map((a) => Object.keys(a).sort())).toEqual(Array(3).fill(["applied_at", "chosen_tier", "id", "nickname", "status", "waitlist_no"]));
    expect(apps.map((a) => [a.nickname, a.status, a.waitlist_no])).toEqual([
      ["별빛", "applied", null],
      ["솜사탕", "waitlisted", 1],
      ["하늘", "waitlisted", 2],
    ]);
    const raw = JSON.stringify(apps);
    expect(raw).not.toMatch(/01[016789]-?\d{3,4}-?\d{4}/);
    expect(raw).not.toMatch(/ciphertext|wrappedKey|envelope|address|phone|real_name|login_id/);
    const seen = await fanView(haneul, boxId);
    expect(Object.keys(seen).sort()).toEqual(["creator", "delivery", "id", "my_state", "name", "open", "viewer", "waitlist_no"]);
    expect(seen).toMatchObject({ my_state: "waitlisted", waitlist_no: 2 });
    expect(JSON.stringify(seen)).not.toMatch(/솜사탕|별빛/);
    // 대기가 아닌 팬에게는 순번이 없다
    expect(await fanView(byeolbit, boxId)).toMatchObject({ my_state: "applied", waitlist_no: null });
  });
});
