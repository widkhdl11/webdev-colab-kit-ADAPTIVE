import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { holdRowLock, psql, psqlError, signedInClient } from "./helpers";
import { deleteTestRevgifts, payTestRevgift, PROFILE, registerTestRevgift } from "./revgift-helpers";

// 크리에이터 이름 = 닉네임 (creator-display-name INV-CN1~CN4, 2026-11-10).
// 크리에이터 정보 표의 이름 칸(creators.name)은 남아 있고, 언제나 그 계정의 닉네임(profiles.nickname)과 같다.
// 팬에게 크리에이터를 보여 주는 읽기는 그 칸을 읽으므로 닉네임이 그대로 보인다.
// 시험 동안 하루(시드)의 닉네임을 바꾸고 끝나면 되돌린다. 바꾼 기록은 추가만 되는 표라 트리거를 끄고 지운다(로컬 DB).

const NEW_NICK = "하루새닉";
let originalNickname = "";
let haruCreatorId = "";

function nickname(): string {
  return psql(`select nickname from public.profiles where id = '${PROFILE.haru}'`);
}
function creatorName(): string {
  return psql(`select name from public.creators where profile_id = '${PROFILE.haru}'`);
}
function nameChanges(): string {
  return psql(`select coalesce(string_agg(before_name || '>' || after_name, ',' order by id), '') from public.creator_name_changes where creator_id = '${haruCreatorId}'`);
}
function restore(): void {
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `update public.profiles set nickname = '${originalNickname}' where id = '${PROFILE.haru}';`,
      `update public.creators set name = '${originalNickname}', intro = '' where id = '${haruCreatorId}';`,
      `delete from public.creator_name_changes where creator_id = '${haruCreatorId}';`,
      "commit;",
    ].join(" "),
  );
}

beforeAll(() => {
  deleteTestRevgifts();
  originalNickname = nickname();
  haruCreatorId = psql(`select id from public.creators where profile_id = '${PROFILE.haru}'`);
  restore();
});
afterEach(restore);
afterAll(() => {
  deleteTestRevgifts();
  restore();
});

describe("INV-CN1: 크리에이터 이름은 언제나 닉네임", () => {
  it("INV-CN1 (S1): 닉네임이 바뀌면 같은 처리 안에서 크리에이터 이름도 바뀐다 — 어느 경로로 바꿔도(표를 직접 고쳐도)", () => {
    expect(creatorName()).toBe(originalNickname);
    psql(`update public.profiles set nickname = '${NEW_NICK}' where id = '${PROFILE.haru}'`);
    expect(creatorName()).toBe(NEW_NICK);
  });

  it("INV-CN1 (S1b, 실패경로): 크리에이터 행의 이름을 직접 다른 값으로 고쳐도 닉네임으로 돌아간다", () => {
    psql(`update public.creators set name = '가짜이름' where id = '${haruCreatorId}'`);
    expect(creatorName()).toBe(originalNickname);
  });

  it("INV-CN1 (S1b, 실패경로): 새로 넣는 행도 이름 칸에 무엇을 넣든 닉네임이 된다(한 처리 안에서 보고 되돌린다)", () => {
    const out = psql(
      `begin; insert into public.creators (profile_id, slug, name, channel, channel_title) select id, 'c-cnprobe', '아무이름', '', '' from public.profiles where id = '${PROFILE.byeolbit}' returning name; rollback;`,
    );
    const fanNick = psql(`select nickname from public.profiles where id = '${PROFILE.byeolbit}'`);
    expect(out.split("\n")).toContain(fanNick);
    expect(out).not.toContain("아무이름");
  });

  it("INV-CN1 (S1c, 동시): 크리에이터 행이 잠긴 동안 닉네임 바꾸기와 소개 저장이 겹쳐 와도 둘 다 끝난 뒤 이름은 지금 닉네임", async () => {
    const lock = await holdRowLock(`select 1 from public.creators where id = '${haruCreatorId}' for update`, 1);
    const a = await signedInClient("haru_creator");
    const b = await signedInClient("haru_creator");
    const [ra, rb] = await Promise.all([
      a.rpc("update_my_creator_profile", { p_nickname: NEW_NICK }),
      b.rpc("update_my_creator_profile", { p_intro: "겹친 소개" }),
      lock.released,
    ]);
    expect([ra.error, rb.error]).toEqual([null, null]);
    expect(nickname()).toBe(NEW_NICK);
    expect(psql(`select name || '|' || intro from public.creators where id = '${haruCreatorId}'`)).toBe(`${NEW_NICK}|겹친 소개`);
  });

  it("INV-CN1: 탈퇴해 계정이 끊긴 행(이름 「탈퇴한 크리에이터」)은 닉네임 규칙에서 빠진다", () => {
    const out = psql(
      `begin; set local fankkuk.verifying = 'on'; update public.creators set profile_id = null, name = '탈퇴한 크리에이터' where id = '${haruCreatorId}'; ` +
        `select name from public.creators where id = '${haruCreatorId}'; rollback;`,
    );
    expect(out.split("\n")).toContain("탈퇴한 크리에이터");
  });
});

describe("INV-CN2: 크리에이터가 이름을 따로 정하는 길은 없다", () => {
  it("INV-CN2 (실패경로): 저장 함수에 옛 이름 인자(p_name)를 넘기면 함수가 없다고 거부 — 이름·닉네임 그대로", async () => {
    const c = await signedInClient("haru_creator");
    const r = await c.rpc("update_my_creator_profile", { p_name: "가짜이름" });
    expect(r.error).not.toBeNull();
    expect([nickname(), creatorName()]).toEqual([originalNickname, originalNickname]);
  });

  it("INV-CN2: 저장 함수의 닉네임 칸은 닉네임을 바꾸고 이름이 따라 바뀐다", async () => {
    const c = await signedInClient("haru_creator");
    expect((await c.rpc("update_my_creator_profile", { p_nickname: NEW_NICK })).error).toBeNull();
    expect([nickname(), creatorName()]).toEqual([NEW_NICK, NEW_NICK]);
  });
});

describe("INV-CN3: 크리에이터 닉네임을 바꿀 때마다 기록", () => {
  it("INV-CN3 (S3): 바꾸면 전·후 한 줄 — 같은 닉네임으로 다시 저장하면 늘지 않는다, 다른 경로로 바꿔도 남는다", async () => {
    const c = await signedInClient("haru_creator");
    expect((await c.rpc("update_my_creator_profile", { p_nickname: NEW_NICK })).error).toBeNull();
    expect(nameChanges()).toBe(`${originalNickname}>${NEW_NICK}`);
    expect((await c.rpc("update_my_creator_profile", { p_nickname: NEW_NICK, p_intro: "소개만" })).error).toBeNull();
    expect(nameChanges()).toBe(`${originalNickname}>${NEW_NICK}`);
    psql(`update public.profiles set nickname = '${originalNickname}' where id = '${PROFILE.haru}'`);
    expect(nameChanges()).toBe(`${originalNickname}>${NEW_NICK},${NEW_NICK}>${originalNickname}`);
  });

  it("INV-CN3 (실패경로): 기록은 고치거나 지울 수 없다", async () => {
    psql(`update public.profiles set nickname = '${NEW_NICK}' where id = '${PROFILE.haru}'`);
    expect(psqlError(`update public.creator_name_changes set after_name = '조작' where creator_id = '${haruCreatorId}'`)).not.toBeNull();
    expect(psqlError(`delete from public.creator_name_changes where creator_id = '${haruCreatorId}'`)).not.toBeNull();
    expect(nameChanges()).toBe(`${originalNickname}>${NEW_NICK}`);
  });

  it("INV-CN3: 팬의 닉네임이 바뀔 때는 크리에이터 기록이 생기지 않는다", () => {
    const before = psql(`select count(*) from public.creator_name_changes`);
    const fanNick = psql(`select nickname from public.profiles where id = '${PROFILE.daltokki}'`);
    psql(`begin; update public.profiles set nickname = '달토끼시험' where id = '${PROFILE.daltokki}'; update public.profiles set nickname = '${fanNick}' where id = '${PROFILE.daltokki}'; commit;`);
    expect(psql(`select count(*) from public.creator_name_changes`)).toBe(before);
  });
});

describe("INV-CN1: 팬·운영자 화면의 크리에이터 이름은 닉네임", () => {
  it("팬이 받은 역조공 목록의 보낸 크리에이터 이름은 닉네임이다", async () => {
    psql(`update public.profiles set nickname = '${NEW_NICK}' where id = '${PROFILE.haru}'`);
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const { data, error } = await (await signedInClient("byeolbit_fan")).rpc("my_received_revgifts");
    expect(error).toBeNull();
    const row = (data as { order_no: string; creator_name: string }[]).find((r) => r.order_no === send.orderNos[0]);
    expect(row?.creator_name).toBe(NEW_NICK);
  });

  it("운영자의 「확인 필요」 결제 목록에서 역조공을 낸 크리에이터는 닉네임으로 보인다", async () => {
    psql(`update public.profiles set nickname = '${NEW_NICK}' where id = '${PROFILE.haru}'`);
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    psql(`update public.revgift_sends set status = 'confirming', confirming_at = now(), review_at = now() where id = '${send.sendId}'`);
    const { data, error } = await (await signedInClient("fankkuk_admin")).rpc("admin_review_payments");
    expect(error).toBeNull();
    const row = (data as { toss_order_id: string; payer_nickname: string }[]).find((r) => r.toss_order_id === send.tossOrderId);
    expect(row?.payer_nickname).toBe(NEW_NICK);
  });

  it("운영자의 결제 내역에서 역조공을 낸 크리에이터는 닉네임으로 보인다", async () => {
    psql(`update public.profiles set nickname = '${NEW_NICK}' where id = '${PROFILE.haru}'`);
    const send = await registerTestRevgift([{ fanId: PROFILE.byeolbit, tier: "small" }]);
    await payTestRevgift(send);
    const { data, error } = await (await signedInClient("fankkuk_admin")).rpc("admin_payment_rows");
    expect(error).toBeNull();
    const row = (data as { order_no: string; unit_kind: string; payer_nickname: string }[]).find((r) => r.order_no === send.orderNos[0]);
    expect(row?.unit_kind).toBe("revgift");
    expect(row?.payer_nickname).toBe(NEW_NICK);
  });
});
