import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, deleteTestOrders, payTestOrder, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { deleteTestUnmatched, fanSetsWaybill, inspect, receiveAndLabel, waybill } from "./office-helpers";
import { saveCreatorProfile } from "@/features/creator-settings-save/model/save-creator-settings";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";

// 크리에이터 설정 (my-account INV-A9 공개 정보 고치기 · INV-A10 찾기 노출 · INV-A11 알림, S9~S11).
// 시드 크리에이터의 값을 바꾸지 않으려고 본인 확인 시험 계정(cvt_*)을 쓴다. 모모(시드)는 「바뀌지 않았는가」만 읽는다.
// 「(manual/0012 뒤)」가 붙은 시험은 알림 칸을 고치는 함수(pii 를 쓴다 — 사람이 적용)가 있어야 통과한다.
// supabase/manual/0012_creator_notify.sql 이 적용되기 전에는 빨간불이 맞다.

const ME = CV.haru; // cvt_haru 「하루시험」
const OTHER = CV.summer; // cvt_summer 「여름밤」
const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";
const CV_IDS = Object.values(CV).map((a) => `'${a.creatorId}'`).join(", ");
const CV_ACCOUNTS = Object.values(CV).map((a) => `'${a.id}'`).join(", ");

/** 공개 이름·소개글·노출·바꾼 기록·연락처를 시험 전 상태로. 바꾼 기록은 추가만 되는 표라 트리거를 끄고 지운다(로컬 DB). */
function resetSettings(): void {
  psql(
    [
      "begin;",
      "set local session_replication_role = replica;",
      `do $$ begin if to_regclass('public.creator_name_changes') is not null then delete from public.creator_name_changes where creator_id in (${CV_IDS}); end if; end $$;`,
      ...Object.values(CV).map((a) => `update public.creators set name = '${a.name}', intro = '', fan_name = null where id = '${a.creatorId}';`),
      ...Object.values(CV).map((a) => `update public.profiles set nickname = '${a.name}' where id = '${a.id}';`),
      `do $$ begin if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'searchable') then execute $q$update public.creators set searchable = true where id in (${CV_IDS})$q$; end if; end $$;`,
      // 크리에이터 색(creator-link INV-E13) — 칸이 생기기 전(마이그레이션 전)에도 초기화가 깨지지 않게
      `do $$ begin if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'fan_color') then execute $q$update public.creators set personal_color = null, fan_color = null where id in (${CV_IDS})$q$; end if; end $$;`,
      `delete from pii.account_contacts where account_id in (${CV_ACCOUNTS});`,
      "commit;",
    ].join(" "),
  );
}

/** 본인 확인을 마친 상태로 만든다(승인 함수를 거치지 않고 — 찾기 조건만 볼 때). */
function verify(creatorId: string, slug: string): void {
  psql(
    `begin; set local session_replication_role = replica; update public.creators set identity_verified = true, channel = 'https://www.youtube.com/@${slug}' where id = '${creatorId}'; commit;`,
  );
}

function creatorRow(creatorId: string): string {
  return psql(`select name || '|' || intro || '|' || channel || '|' || identity_verified from public.creators where id = '${creatorId}'`);
}

beforeAll(() => {
  createCvAccounts();
  resetCv();
  resetSettings();
});
beforeEach(() => {
  resetCv();
  resetSettings();
  deleteTestUnmatched();
});
afterAll(() => {
  // 추적기로 판정한 시험 주문을 남겨 두면 그 팬(별빛)이 다음 파일에서 개봉 대상이 된다(office-workflow INV-W16) — 이 파일에서 지운다
  deleteTestOrders();
  resetSettings();
  dropCvAccounts();
});

async function save(login: string, args: Record<string, unknown>) {
  const client = await signedInClient(login);
  return client.rpc("update_my_creator_profile", args);
}

describe("INV-A9: 크리에이터 공개 정보 고치기", () => {
  it("INV-A9 S9: 공개 이름을 「하루달」로 저장하면 내 공개 이름만 바뀌고 바꾼 기록 한 줄(언제·전·후)", async () => {
    const momoBefore = creatorRow(MOMO_CREATOR_ID);
    const otherBefore = creatorRow(OTHER.creatorId);
    const r = await save(ME.login, { p_name: "하루달", p_intro: "안녕하세요", p_searchable: true });
    expect(r.error).toBeNull();
    expect(psql(`select name || '|' || intro from public.creators where id = '${ME.creatorId}'`)).toBe("하루달|안녕하세요");
    // 머리 메뉴·인사말에 쓰이는 계정 닉네임도 같이 바뀐다(가입 때 공개 이름으로 정한 것과 같게)
    // 공개 이름은 계정 닉네임을 덮지 않는다(signup INV-U13, 2026-10-15 — 닉네임은 1~12자·계정마다 다름, 공개 이름은 20자)
    expect(psql(`select nickname from public.profiles where id = '${ME.id}'`)).toBe(ME.name);
    expect(psql(`select before_name || '|' || after_name || '|' || (at is not null) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe(
      `${ME.name}|하루달|true`,
    );
    expect(creatorRow(MOMO_CREATOR_ID)).toBe(momoBefore);
    expect(creatorRow(OTHER.creatorId)).toBe(otherBefore);
  });

  it("INV-A9: 공개 이름이 그대로면 바꾼 기록을 남기지 않는다(소개글만 고침)", async () => {
    expect((await save(ME.login, { p_name: ME.name, p_intro: "소개만", p_searchable: true })).error).toBeNull();
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("0");
    expect(psql(`select intro from public.creators where id = '${ME.creatorId}'`)).toBe("소개만");
  });

  it("INV-A9 S9b (실패경로): 본문에 모모의 크리에이터 ID·채널 주소·본인 확인 참을 넣으면 거부되고 아무것도 안 바뀐다", async () => {
    const momoBefore = creatorRow(MOMO_CREATOR_ID);
    const meBefore = creatorRow(ME.creatorId);
    const extra = [
      { p_creator_id: MOMO_CREATOR_ID },
      { p_channel: "https://www.youtube.com/@fake" },
      { p_identity_verified: true },
      { p_account_id: ME.id },
    ];
    for (const e of extra) {
      const r = await save(ME.login, { p_name: "하루달", p_intro: "", p_searchable: true, ...e });
      expect(r.error).not.toBeNull();
    }
    expect(creatorRow(MOMO_CREATOR_ID)).toBe(momoBefore);
    expect(creatorRow(ME.creatorId)).toBe(meBefore);
  });

  it("INV-A9 S9b (실패경로): 공개 이름 21자·빈 이름·소개 41자는 거부되고 아무 칸도 안 바뀐다", async () => {
    const before = creatorRow(ME.creatorId);
    for (const args of [
      { p_name: "가".repeat(21), p_intro: "바뀌면 안 됨", p_searchable: false },
      { p_name: "   ", p_intro: "바뀌면 안 됨", p_searchable: false },
      { p_name: "하루달", p_intro: "가".repeat(41), p_searchable: false },
      { p_searchable: false, p_fan_name: "가".repeat(11) },
      { p_name: "하루달", p_searchable: false, p_intro: "가".repeat(41) },
    ]) {
      const r = await save(ME.login, args);
      expect(r.error?.code).toBe("22023");
    }
    expect(creatorRow(ME.creatorId)).toBe(before);
    expect(psql(`select searchable from public.creators where id = '${ME.creatorId}'`)).toBe("t");
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("0");
  });

  it("INV-A9: 「내 팬꾹 꾸미기」 저장(공개 이름·한 줄 소개·팬을 부르는 이름)은 「주소와 설정」에서 끈 찾기 노출을 되돌리지 않는다", async () => {
    const client = await signedInClient(ME.login);
    const viewer = { userId: ME.id, role: "creator" as const };
    expect(await saveCreatorProfile({ client, viewer }, { searchable: false })).toEqual({ ok: true });
    expect(await saveCreatorProfile({ client, viewer }, { name: "하루달", intro: "새 소개", fanName: "달빛지기" })).toEqual({ ok: true });
    expect(psql(`select name || '|' || intro || '|' || fan_name || '|' || searchable from public.creators where id = '${ME.creatorId}'`)).toBe("하루달|새 소개|달빛지기|false");
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("1");
  });

  it("INV-A9: 「주소와 설정」 저장(찾기 노출만)은 「내 팬꾹 꾸미기」에서 바꾼 이름·소개·팬을 부르는 이름을 덮어쓰지 않고 이름 변경 기록도 남기지 않는다", async () => {
    const client = await signedInClient(ME.login);
    const viewer = { userId: ME.id, role: "creator" as const };
    expect(await saveCreatorProfile({ client, viewer }, { name: "하루달", intro: "새 소개", fanName: "달빛지기" })).toEqual({ ok: true });
    expect(await saveCreatorProfile({ client, viewer }, { searchable: false })).toEqual({ ok: true });
    expect(psql(`select name || '|' || intro || '|' || fan_name || '|' || searchable from public.creators where id = '${ME.creatorId}'`)).toBe("하루달|새 소개|달빛지기|false");
    // 공개 이름은 계정 닉네임을 덮지 않는다(signup INV-U13, 2026-10-15 — 닉네임은 1~12자·계정마다 다름, 공개 이름은 20자)
    expect(psql(`select nickname from public.profiles where id = '${ME.id}'`)).toBe(ME.name);
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("1");
  });

  it("INV-A9: DB 함수에 칸을 하나만 넘겨도 나머지 칸은 그대로다 — 이름을 넘기지 않으면 이름 변경 기록이 없다", async () => {
    expect((await save(ME.login, { p_intro: "소개만" })).error).toBeNull();
    expect((await save(ME.login, { p_fan_name: "꿀벌단" })).error).toBeNull();
    expect((await save(ME.login, {})).error).toBeNull();
    expect(psql(`select name || '|' || intro || '|' || fan_name || '|' || searchable from public.creators where id = '${ME.creatorId}'`)).toBe(`${ME.name}|소개만|꿀벌단|true`);
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("0");
  });

  it("INV-A9: 경계 안 — 공개 이름 20자·한 줄 소개 40자는 저장된다 (creator-link INV-E6)", async () => {
    const r = await save(ME.login, { p_name: "가".repeat(20), p_intro: "나".repeat(40), p_searchable: true });
    expect(r.error).toBeNull();
    expect(psql(`select char_length(name) || '|' || char_length(intro) from public.creators where id = '${ME.creatorId}'`)).toBe("20|40");
  });

  it("INV-A9: DB 함수도 앞뒤의 탭·줄바꿈·전각 공백을 앱과 같은 범위로 빼고 저장한다", async () => {
    const r = await save(ME.login, { p_name: "\t\u3000 하루달\n\u3000", p_intro: "\u3000소개\n", p_searchable: true });
    expect(r.error).toBeNull();
    expect(psql(`select name || '|' || intro from public.creators where id = '${ME.creatorId}'`)).toBe("하루달|소개");
    expect(psql(`select after_name from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("하루달");
  });

  it("INV-A9 S9b (실패경로): DB 함수를 직접 불러도 공개 이름의 제어 문자·보이지 않는 글자는 거부되고 아무 칸도 안 바뀐다", async () => {
    const before = creatorRow(ME.creatorId);
    for (const bad of ["하루\u200b달", "하루\u200c달", "하루\u200d달", "하루\u2060달", "하루\ufeff달", "하루\u202e달", "하루\n달", "하루\t달", "하루\u0007달", "\u3164", "하루\u00ad달"]) {
      const r = await save(ME.login, { p_name: bad, p_intro: "바뀌면 안 됨", p_searchable: false });
      expect(r.error?.code, JSON.stringify(bad)).toBe("22023");
    }
    expect(creatorRow(ME.creatorId)).toBe(before);
    expect(psql(`select count(*) from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("0");
  });

  it("INV-A9 S9b (실패경로): 팬 계정으로 부르면 거부, 로그인하지 않으면 부를 수 없다", async () => {
    const fan = await save("byeolbit_fan", { p_name: "하루달", p_intro: "", p_searchable: true });
    expect(fan.error?.code).toBe("42501");
    const anon = await anonClient().rpc("update_my_creator_profile", { p_name: "하루달", p_intro: "", p_searchable: true });
    expect(anon.error).not.toBeNull();
  });

  it("INV-A9 (실패경로): 로그인한 사용자는 공개 정보 표·바꾼 기록 표를 직접 고치지 못한다", async () => {
    const me = await signedInClient(ME.login);
    await me.from("creators").update({ name: "직접바꿈" }).eq("id", ME.creatorId);
    expect(psql(`select name from public.creators where id = '${ME.creatorId}'`)).toBe(ME.name);
    const read = await me.from("creator_name_changes").select("*");
    expect(read.error).not.toBeNull();
  });

  it("INV-A9: 바꾼 기록은 추가만 된다 — 고치기·지우기는 DB 가 거부한다", async () => {
    await save(ME.login, { p_name: "하루달", p_intro: "", p_searchable: true });
    expect(psqlError(`update public.creator_name_changes set after_name = '조작' where creator_id = '${ME.creatorId}'`)).not.toBeNull();
    expect(psqlError(`delete from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).not.toBeNull();
    expect(psql(`select after_name from public.creator_name_changes where creator_id = '${ME.creatorId}'`)).toBe("하루달");
  });

  it("INV-A9: 바꾼 기록은 운영자 크리에이터 목록에서 보이고, 팬·크리에이터에게는 보이지 않는다", async () => {
    await save(ME.login, { p_name: "하루달", p_intro: "", p_searchable: true });
    const owner = await signedInClient("fankkuk_admin");
    const r = await owner.rpc("admin_creator_name_changes");
    expect(r.error).toBeNull();
    const mine = (r.data as { creator_id: string; before_name: string; after_name: string; at: string }[]).filter((x) => x.creator_id === ME.creatorId);
    expect(mine.map((x) => [x.before_name, x.after_name])).toEqual([[ME.name, "하루달"]]);
    for (const login of ["byeolbit_fan", ME.login]) {
      const c = await signedInClient(login);
      const other = await c.rpc("admin_creator_name_changes");
      expect(other.data ?? []).toEqual([]);
    }
  });
});

describe("INV-A10: 찾기 목록 = 본인 확인됨 그리고 찾기 노출 켜짐", () => {
  async function found(): Promise<string[]> {
    const r = await anonClient().rpc("find_creators");
    expect(r.error).toBeNull();
    return (r.data as { id: string }[]).map((x) => x.id);
  }
  async function listed(): Promise<string[]> {
    const r = await anonClient().rpc("list_creators");
    expect(r.error).toBeNull();
    return (r.data as { id: string }[]).map((x) => x.id);
  }

  it("INV-A10: 노출의 처음 값은 켜짐이다", () => {
    expect(psql(`select searchable from public.creators where id = '${ME.creatorId}'`)).toBe("t");
  });

  it("INV-A10 S10 (실패경로): 확인 전 + 켜짐 → 찾기에 안 나온다", async () => {
    expect((await save(ME.login, { p_name: ME.name, p_intro: "", p_searchable: true })).error).toBeNull();
    expect(await found()).not.toContain(ME.creatorId);
  });

  it("INV-A10 S10 (실패경로): 확인됨 + 꺼짐 → 찾기에도, 손님의 목록 읽기에도 안 나온다", async () => {
    verify(ME.creatorId, "cvt-haru");
    expect((await save(ME.login, { p_name: ME.name, p_intro: "", p_searchable: false })).error).toBeNull();
    expect(await found()).not.toContain(ME.creatorId);
    expect(await listed()).not.toContain(ME.creatorId);
  });

  it("INV-A10 S10b: 노출을 꺼도 팔로우한 팬·본인의 목록에는 나오고, 팔로우 안 한 팬에게는 안 나온다", async () => {
    verify(ME.creatorId, "cvt-haru");
    await save(ME.login, { p_name: ME.name, p_intro: "", p_searchable: false });
    const ids = async (login: string) => (((await (await signedInClient(login)).rpc("list_creators")).data ?? []) as { id: string }[]).map((x) => x.id);
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("set_follow", { p_creator_id: ME.creatorId, p_following: true })).error).toBeNull();
    try {
      expect(await ids("byeolbit_fan")).toContain(ME.creatorId);
      expect(await ids("daltokki_fan")).not.toContain(ME.creatorId);
      expect(await ids(ME.login)).toContain(ME.creatorId);
    } finally {
      await fan.rpc("set_follow", { p_creator_id: ME.creatorId, p_following: false });
    }
  });

  it("INV-A10 S10b: 한 명 읽기는 노출과 상관없이 확인됨이면 누구에게나 나온다 — 확인 전이면 빈 결과", async () => {
    const one = async () => ((await anonClient().rpc("creator_by_id", { p_id: ME.creatorId })).data ?? []) as { id: string; name: string }[];
    expect(await one()).toEqual([]);
    verify(ME.creatorId, "cvt-haru");
    await save(ME.login, { p_name: ME.name, p_intro: "", p_searchable: false });
    expect((await one()).map((x) => x.id)).toEqual([ME.creatorId]);
    const fan = await signedInClient("daltokki_fan");
    expect((((await fan.rpc("creator_by_id", { p_id: ME.creatorId })).data ?? []) as { id: string }[]).map((x) => x.id)).toEqual([ME.creatorId]);
  });

  it("INV-A10 S10: 확인됨 + 켜짐 → 찾기에 나온다", async () => {
    verify(ME.creatorId, "cvt-haru");
    expect(await found()).toContain(ME.creatorId);
  });

  it("INV-A10 S10 (실패경로): 켜짐인 채 승인이 취소되면 찾기에서 사라진다", async () => {
    verify(ME.creatorId, "cvt-haru");
    expect(await found()).toContain(ME.creatorId);
    const owner = await signedInClient("fankkuk_admin");
    const r = await owner.rpc("admin_revoke_creator", { p_creator_id: ME.creatorId, p_reason_code: "channel_gone", p_memo: "" });
    expect(r.error).toBeNull();
    expect(psql(`select searchable from public.creators where id = '${ME.creatorId}'`)).toBe("t");
    expect(await found()).not.toContain(ME.creatorId);
  });

  it("INV-A10: 노출을 끈 크리에이터에게도 팔로우와 새 선물 등록은 그대로 된다", async () => {
    verify(ME.creatorId, "cvt-haru");
    await save(ME.login, { p_name: ME.name, p_intro: "", p_searchable: false });
    const fan = await signedInClient("byeolbit_fan");
    const f = await fan.rpc("set_follow", { p_creator_id: ME.creatorId, p_following: true });
    expect(f.error).toBeNull();
    const o = await registerTestOrder(1, { creatorId: ME.creatorId });
    expect(o.orderId).toBeTruthy();
  });
});

describe("INV-A11: 크리에이터 알림은 카카오·이메일 두 칸 (manual/0012 뒤)", () => {
  type Account = { notify_kakao: boolean; notify_email: boolean };
  async function myAccount(login: string): Promise<Account> {
    const c = await signedInClient(login);
    const r = await c.rpc("my_account");
    if (r.error) throw new Error(`my_account 실패: ${r.error.code}`);
    return (r.data as Account[])[0]!;
  }

  it("INV-A11 (manual/0012 뒤): 크리에이터가 두 칸을 끄고 켜면 그대로 저장된다", async () => {
    const me = await signedInClient(ME.login);
    expect((await me.rpc("update_my_creator_notify", { p_notify_kakao: false, p_notify_email: false })).error).toBeNull();
    expect(await myAccount(ME.login)).toMatchObject({ notify_kakao: false, notify_email: false });
    expect((await me.rpc("update_my_creator_notify", { p_notify_kakao: true, p_notify_email: false })).error).toBeNull();
    expect(await myAccount(ME.login)).toMatchObject({ notify_kakao: true, notify_email: false });
  });

  it("INV-A11 (manual/0012 뒤, 실패경로): 빈 값은 거부, 팬은 이 경로를 쓰지 못한다, 계정 ID 를 넘기면 거부", async () => {
    const me = await signedInClient(ME.login);
    expect((await me.rpc("update_my_creator_notify", { p_notify_kakao: null, p_notify_email: false })).error?.code).toBe("22023");
    expect((await me.rpc("update_my_creator_notify", { p_notify_kakao: false, p_notify_email: false, p_account_id: OTHER.id })).error).not.toBeNull();
    const fan = await signedInClient("byeolbit_fan");
    expect((await fan.rpc("update_my_creator_notify", { p_notify_kakao: false, p_notify_email: false })).error?.code).toBe("42501");
    const anon = await anonClient().rpc("update_my_creator_notify", { p_notify_kakao: false, p_notify_email: false });
    expect(anon.error).not.toBeNull();
    expect(await myAccount(ME.login)).toMatchObject({ notify_kakao: true, notify_email: true });
  });

  // 2026-10-12 문제집 D7(notifications INV-N6 표): 추적기 반송(hold)은 끌 수 없는 알림이 됐다.
  // 크리에이터가 끌 수 있는 알림(배송중·수령)은 택배사 연결 전이라 흐름에서 생기지 않아, 수령 줄을 직접 넣어 건너뛰는 쪽을 본다.
  it("INV-A11 S11 (manual/0012·0016 뒤): 두 칸을 다 끈 크리에이터 — 수령 알림은 건너뛰고 승인 요청·추적기 반송은 간다", async () => {
    verify(ME.creatorId, "cvt-haru");
    psql(`insert into pii.account_contacts (account_id, email, phone) values ('${ME.id}', 'cvt.haru@example.com', '01077770003')`);
    const me = await signedInClient(ME.login);
    expect((await me.rpc("update_my_creator_notify", { p_notify_kakao: false, p_notify_email: false })).error).toBeNull();

    const o = await registerTestOrder(1, { creatorId: ME.creatorId });
    await payTestOrder(o);
    const boxId = psql(`select id from public.boxes where order_id = '${o.orderId}'`);
    const no = waybill();
    await fanSetsWaybill(boxId, no);
    const staff = await signedInClient("fankkuk_staff");
    const qr = await receiveAndLabel(staff, no);
    await inspect(staff, qr, { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" });

    const outbox = (kind: string) =>
      psql(`select id from public.notification_outbox where order_id = '${o.orderId}' and kind = '${kind}' and account_id = '${ME.id}' and channel = 'email' and round = 1`);
    const approvalRow = outbox("approval_request");
    const holdRow = outbox("hold");
    expect(approvalRow).not.toBe("");
    expect(holdRow).not.toBe("");
    const deliveredRow = psql(
      `insert into public.notification_outbox (order_id, account_id, kind, channel, round, status, next_attempt_at, event_at)
       values ('${o.orderId}', '${ME.id}', 'delivered', 'email', 1, 'pending', now() + interval '1 day', now()) returning id`,
    ).split("\n")[0]; // psql 이 id 뒤에 「INSERT 0 1」을 붙인다
    expect(deliveredRow).not.toBe("");
    try {
      for (const [id, expected] of [
        [approvalRow, "cvt.haru@example.com"],
        [holdRow, "cvt.haru@example.com"],
        [deliveredRow, null],
      ] as const) {
        // 이 줄만 꺼낼 수 있게 다른 대기 줄을 뒤로 미룬다
        psql(
          `update public.notification_outbox set next_attempt_at = case when id = '${id}' then now() - interval '1 minute' else now() + interval '1 day' end where status = 'pending'`,
        );
        const claimed = await adminClient().rpc("notification_claim", { p_limit: 1 });
        expect(claimed.error).toBeNull();
        expect((claimed.data as { id: string }[]).map((x) => x.id)).toEqual([id]);
        const contact = await adminClient().rpc("notification_contact", { p_outbox_id: id });
        expect(contact.error).toBeNull();
        expect(contact.data).toBe(expected);
      }
    } finally {
      psql(`delete from public.notification_outbox where order_id = '${o.orderId}'`);
    }
  });
});

describe("INV-E13·E14: 테마 색(저장 칸 퍼스널 컬러) — 파스텔 8색만, 팬컬러는 바꾸지 않는다 (creator-link)", () => {
  const MIGRATION = new URL("../../supabase/migrations/20261018000003_theme_color.sql", import.meta.url);

  function colors(creatorId: string): string {
    return psql(`select coalesce(personal_color, '-') || '|' || coalesce(fan_color, '-') from public.creators where id = '${creatorId}'`);
  }
  /** 규칙 전 값을 심는다 — 8색 제약을 잠깐 내리고 표에 직접 쓴다(로컬 DB). 끝나면 마이그레이션을 다시 돌려 제약을 되살린다 */
  function seedLegacy(rows: readonly { id: string; personal: string | null; fan: string | null }[]): void {
    const q = (v: string | null) => (v === null ? "null" : `'${v}'`);
    psql(
      [
        "begin;",
        "alter table public.creators drop constraint if exists creators_personal_color_palette;",
        ...rows.map((r) => `update public.creators set personal_color = ${q(r.personal)}, fan_color = ${q(r.fan)} where id = '${r.id}';`),
        "commit;",
      ].join(" "),
    );
  }
  function runMigration(): void {
    psql(readFileSync(MIGRATION, "utf8"));
  }

  it("INV-E13 S12: 하루로 #dcebff 저장 → #DCEBFF, 팬덤 이름만 보내면 색은 그대로, 빈 값이면 기본(null)으로", async () => {
    const client = await signedInClient(ME.login);
    const viewer = { userId: ME.id, role: "creator" as const };
    expect(await saveCreatorProfile({ client, viewer }, { personalColor: "#dcebff" })).toEqual({ ok: true });
    expect(colors(ME.creatorId)).toBe("#DCEBFF|-");
    expect(await saveCreatorProfile({ client, viewer }, { fanName: "달빛지기" })).toEqual({ ok: true });
    expect(colors(ME.creatorId)).toBe("#DCEBFF|-");
    expect(await saveCreatorProfile({ client, viewer }, { personalColor: "" })).toEqual({ ok: true });
    expect(colors(ME.creatorId)).toBe("-|-");
  });

  it("INV-E13 S12: DB 함수를 직접 불러도 8색은 모두 받고, 소문자로 보내도 대문자로 저장된다", async () => {
    for (const c of ["#FDE2E4", "#FFE5CC", "#FFF1B8", "#DFF5D8", "#D3F0EC", "#DCEBFF", "#E6E0FF", "#F6DFF0"]) {
      expect((await save(ME.login, { p_personal_color: c.toLowerCase() })).error, c).toBeNull();
      expect(colors(ME.creatorId), c).toBe(`${c}|-`);
    }
  });

  it("INV-E13: 본인 설정 읽기(my_creator_settings)에 테마 색이 있다 — 본인 것만", async () => {
    expect((await save(ME.login, { p_personal_color: "#E6E0FF" })).error).toBeNull();
    const mine = await (await signedInClient(ME.login)).rpc("my_creator_settings");
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([expect.objectContaining({ personal_color: "#E6E0FF" })]);
    const other = await (await signedInClient(OTHER.login)).rpc("my_creator_settings");
    expect(other.data).toEqual([expect.objectContaining({ personal_color: null })]);
  });

  it("INV-E13 S12b (실패경로): DB 함수를 직접 불러 8색 밖 값(#1E3A8A 등)·형식 밖 값 → 22023, 같이 보낸 칸도 아무것도 안 바뀐다", async () => {
    expect((await save(ME.login, { p_personal_color: "#FFF1B8" })).error).toBeNull();
    const before = creatorRow(ME.creatorId);
    for (const bad of ["#1E3A8A", "#FFFFFF", "#DCEBFE", "red", "#12345", "#DCEBFF; background:url(x)", "DCEBFF", " #DCEBFF", "#GGGGGG"]) {
      const r = await save(ME.login, { p_name: "바뀌면안됨", p_fan_name: "바뀌면안됨", p_personal_color: bad });
      expect(r.error?.code, bad).toBe("22023");
    }
    expect(colors(ME.creatorId)).toBe("#FFF1B8|-");
    expect(creatorRow(ME.creatorId)).toBe(before);
    expect(psql(`select coalesce(fan_name, '-') from public.creators where id = '${ME.creatorId}'`)).toBe("-");
  });

  it("INV-E13 S12b (실패경로): 모모의 크리에이터 ID 를 넣으면 거부되고 모모·하루 그대로 · 팬·로그인 안 함은 거부", async () => {
    const momoBefore = colors(MOMO_CREATOR_ID);
    const r = await save(ME.login, { p_personal_color: "#DCEBFF", p_creator_id: MOMO_CREATOR_ID });
    expect(r.error).not.toBeNull();
    expect(colors(MOMO_CREATOR_ID)).toBe(momoBefore);
    expect(colors(ME.creatorId)).toBe("-|-");
    expect((await save("byeolbit_fan", { p_personal_color: "#DCEBFF" })).error?.code).toBe("42501");
    expect((await anonClient().rpc("update_my_creator_profile", { p_personal_color: "#DCEBFF" })).error).not.toBeNull();
    expect(colors(ME.creatorId)).toBe("-|-");
  });

  it("INV-E13 S12b (실패경로): DB 제약 — 표에 직접 넣어도 8색 밖의 값(진한 색·소문자·형식 밖)은 들어가지 않는다", () => {
    for (const bad of ["#1E3A8A", "#FFFFFF", "#dcebff", "red", "#12345", "#DCEBFF; x"]) {
      expect(psqlError(`update public.creators set personal_color = '${bad}' where id = '${ME.creatorId}'`), bad).not.toBeNull();
    }
    expect(psqlError(`update public.creators set personal_color = '#DCEBFF' where id = '${ME.creatorId}'`)).toBeNull();
    expect(psql(`select count(*) from pg_constraint where conname = 'creators_personal_color_palette'`)).toBe("1");
    expect(psql(`select count(*) from pg_constraint where conname = 'creators_personal_color_shape'`)).toBe("0");
  });

  it("INV-E13 S12c: 규칙 전 퍼스널 컬러 #1E3A8A·팬컬러 #FFF59D → 마이그레이션 뒤 퍼스널 컬러는 비고 팬컬러는 남는다 · 8색 값은 그대로 · 다시 돌려도 같다", () => {
    try {
      seedLegacy([
        { id: ME.creatorId, personal: "#1E3A8A", fan: "#FFF59D" },
        { id: OTHER.creatorId, personal: "#DCEBFF", fan: "#C4B5FD" },
      ]);
      expect(colors(ME.creatorId)).toBe("#1E3A8A|#FFF59D");
      runMigration();
      expect(colors(ME.creatorId)).toBe("-|#FFF59D");
      expect(colors(OTHER.creatorId)).toBe("#DCEBFF|#C4B5FD");
      runMigration();
      expect(colors(ME.creatorId)).toBe("-|#FFF59D");
      expect(colors(OTHER.creatorId)).toBe("#DCEBFF|#C4B5FD");
    } finally {
      runMigration();
    }
  });

  it("INV-E13 S12c: 남아 있는 팬컬러는 저장 요청에 팬컬러를 넣어도 바뀌지 않는다(앱 서버·DB 함수 모두) · 공개 읽기 카드에도 그려지지 않는다", async () => {
    psql(`update public.creators set fan_color = '#FFF59D' where id = '${ME.creatorId}'`);
    const client = await signedInClient(ME.login);
    const viewer = { userId: ME.id, role: "creator" as const };
    expect(await saveCreatorProfile({ client, viewer }, { personalColor: "#DCEBFF", fanColor: "#1E3A8A" })).toEqual({ ok: true });
    expect(colors(ME.creatorId)).toBe("#DCEBFF|#FFF59D");
    expect((await save(ME.login, { p_fan_color: "#C4B5FD" })).error).toBeNull();
    expect((await save(ME.login, { p_fan_color: "" })).error).toBeNull();
    expect(colors(ME.creatorId)).toBe("#DCEBFF|#FFF59D");
    verify(ME.creatorId, "cvt_haru_color");
    const cards = await readCreatorCards(anonClient(), { signedIn: false, onlyId: ME.creatorId });
    expect(cards.map((c) => c.colors)).toEqual([{ personal: "#DCEBFF" }]);
  });

  it("INV-E14 S13b: 글자색을 저장하는 칸은 없다(넘기면 함수가 없다고 거부)", async () => {
    expect(psql(`select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name ~ '(text|on|ink|font)_?colou?r|^on_'`)).toBe("0");
    expect((await save(ME.login, { p_personal_color: "#DCEBFF", p_text_color: "#FF0000" })).error).not.toBeNull();
    expect(colors(ME.creatorId)).toBe("-|-");
  });

  it("INV-E13 · INV-E7: 공개 읽기(creator_by_id·목록·찾기·다른 크리에이터)에 테마 색이 있다 — 누구나 읽는 공개 값", async () => {
    verify(ME.creatorId, "cvt_haru_color");
    expect((await save(ME.login, { p_personal_color: "#DCEBFF" })).error).toBeNull();
    const anon = anonClient();
    const one = await anon.rpc("creator_by_id", { p_id: ME.creatorId });
    expect(one.error).toBeNull();
    expect(one.data).toEqual([expect.objectContaining({ id: ME.creatorId, personal_color: "#DCEBFF" })]);
    for (const fn of ["list_creators", "find_creators"] as const) {
      const r = await anon.rpc(fn);
      expect(r.error, fn).toBeNull();
      expect((r.data as { id: string }[]).find((x) => x.id === ME.creatorId), fn).toEqual(expect.objectContaining({ personal_color: "#DCEBFF" }));
    }
    const others = await anon.rpc("list_other_creators", { p_exclude: MOMO_CREATOR_ID, p_limit: 12 });
    expect(others.error).toBeNull();
    expect(Object.keys((others.data as object[])[0] ?? {})).toEqual(expect.arrayContaining(["personal_color"]));
  });
});
