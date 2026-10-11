import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, payTestOrder, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { deleteTestUnmatched, fanSetsWaybill, inspect, receiveAndLabel, waybill } from "./office-helpers";

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
      ...Object.values(CV).map((a) => `update public.creators set name = '${a.name}', intro = '' where id = '${a.creatorId}';`),
      ...Object.values(CV).map((a) => `update public.profiles set nickname = '${a.name}' where id = '${a.id}';`),
      `do $$ begin if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'creators' and column_name = 'searchable') then execute $q$update public.creators set searchable = true where id in (${CV_IDS})$q$; end if; end $$;`,
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
    expect(psql(`select nickname from public.profiles where id = '${ME.id}'`)).toBe("하루달");
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
      { p_name: "하루달", p_intro: "", p_searchable: null },
    ]) {
      const r = await save(ME.login, args);
      expect(r.error?.code).toBe("22023");
    }
    expect(creatorRow(ME.creatorId)).toBe(before);
    expect(psql(`select searchable from public.creators where id = '${ME.creatorId}'`)).toBe("t");
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

  it("INV-A11 S11 (manual/0012 뒤): 두 칸을 다 끈 크리에이터 — 보관 알림은 건너뛰고 승인 요청은 간다", async () => {
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
    try {
      for (const [id, expected] of [
        [approvalRow, "cvt.haru@example.com"],
        [holdRow, null],
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
