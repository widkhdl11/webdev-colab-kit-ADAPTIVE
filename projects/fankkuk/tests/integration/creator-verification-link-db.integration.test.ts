import { spawn } from "node:child_process";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  approve,
  appStatus,
  as,
  createCvAccounts,
  creatorRowLockSql,
  CV,
  dropCvAccounts,
  ensureHandle,
  OWNER,
  recheck,
  reject,
  request,
  requestOk,
  requestWithoutHandle,
  resetCv,
  shiftApp,
  STAFF,
  verified,
  verifyVia,
  withdraw,
} from "./creator-verification-helpers";
import { anonClient, holdRowLock, psql, psqlError, registerTestOrder, signedInClient } from "./helpers";

// 채널 확인 — 팬꾹 링크 게시 확인의 DB 층 (creator-verification INV-V17·V19·V20·V22, 2026-11-02 결정 카드 3-d1).
// 사람 이름은 스펙 시나리오를 따른다: 하루(haru)·꿀단지(ggul)·여름밤(summer). 라임 = fankkuk_staff, 모아 = fankkuk_admin.
// 링크 판정 자체(INV-V18 — 같은 링크·같은 채널 이름)는 운영자가 눈으로 보거나 2차 자동 찾기가 쓰는 판정 함수라 단위 시험(gift-link-match)이 본다.

const SOOP = (id: string) => `https://www.sooplive.com/station/${id}`;
const MEMO = "소개란 확인 — 운영자만";

beforeAll(() => {
  createCvAccounts();
  resetCv();
});
beforeEach(() => resetCv());
afterAll(() => dropCvAccounts());

/** 예약 작업이 부르는 유예 끝 처리 — DB 에 직접 붙는 실행자(postgres)만 부를 수 있다. 몇 명을 취소했는지. */
function expireGrace(): number {
  return Number(psql("select public.cv_expire_link_grace()"));
}

/** 같은 처리를 다른 연결에서 끝나기를 기다리지 않고 시작한다(동시 시험). */
function expireGraceAsync(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", "supabase_db_fankkuk", "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", "select public.cv_expire_link_grace()"]);
    let out = "";
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.on("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`expire 실패 ${code}`))));
  });
}

function creatorCol(who: keyof typeof CV, expr: string): string {
  return psql(`select ${expr} from public.creators where id = '${CV[who].creatorId}'`);
}

/** 확인된 크리에이터의 재확인 칸을 옮긴다(시간이 지난 상태). 칸은 승인·재확인 함수 밖에서 못 바꾸게 막혀 있어 트리거를 끄고 고친다. */
function shiftCreator(who: keyof typeof CV, set: string): void {
  psql(`begin; set local session_replication_role = replica; update public.creators set ${set} where id = '${CV[who].creatorId}'; commit;`);
}

type RecheckRow = { creator_id: string; handle: string | null; recheck_reason: string | null; link_missing_at: string | null; recheck_requested_at: string | null };

async function rechecks(): Promise<RecheckRow[]> {
  const r = await (await as(STAFF)).rpc("admin_creator_rechecks");
  if (r.error) throw new Error(r.error.message);
  return r.data as RecheckRow[];
}

async function recheckOf(who: keyof typeof CV): Promise<RecheckRow | undefined> {
  return (await rechecks()).find((r) => r.creator_id === CV[who].creatorId);
}

function setHandleDirect(who: keyof typeof CV, handle: string): void {
  // 지금 아이디를 묶인 옛 아이디로 돌리고 새 아이디를 넣는다(update_my_creator_handle 과 같은 결과, 30일 잠금 없이)
  psql(
    `update public.creator_handles set retired_until = now() + interval '90 days' where creator_id = '${CV[who].creatorId}' and retired_until is null; insert into public.creator_handles (handle, creator_id) values ('${handle}', '${CV[who].creatorId}'); update public.creators set handle_changed_at = now() where id = '${CV[who].creatorId}'`,
  );
}

function dropHandles(who: keyof typeof CV): void {
  psql(`delete from public.creator_handles where creator_id = '${CV[who].creatorId}'`);
}

describe("확인 요청 (INV-V17)", () => {
  it("INV-V17 (실패경로): 링크용 아이디가 없으면 요청을 거부하고 「팬꾹 링크를 먼저 만들어 주세요」, 요청 0건", async () => {
    dropHandles("haru");
    const r = await requestWithoutHandle("haru", SOOP("haru"));
    expect(r.error?.code).toBe("FKV17");
    expect(r.error?.message).toContain("팬꾹 링크를 먼저 만들어 주세요");
    expect(psql(`select count(*) from public.creator_verification_applications where account_id = '${CV.haru.id}'`)).toBe("0");
  });

  it("INV-V17 (S17): 요청은 만들어질 때 바로 확인 대기이고, 그때의 링크용 아이디가 요청 줄에 남는다", async () => {
    const handle = ensureHandle("haru");
    const a = await requestOk("haru", SOOP("haru"));
    expect(a.link_handle).toBe(handle);
    expect(psql(`select status || '|' || method || '|' || link_handle || '|' || (posted_at is not null) from public.creator_verification_applications where id = '${a.application_id}'`)).toBe(
      `posted|link|${handle}|true`,
    );
  });

  it("INV-V17 (실패경로): 요청 뒤에 아이디를 바꿔도 요청 줄의 아이디는 그대로이고, 표를 직접 고칠 수도 없다", async () => {
    const before = ensureHandle("haru");
    const a = await requestOk("haru", SOOP("haru"));
    setHandleDirect("haru", "cvh_haru2");
    expect(psql(`select link_handle from public.creator_verification_applications where id = '${a.application_id}'`)).toBe(before);
    expect(psqlError(`update public.creator_verification_applications set link_handle = 'cvh_other' where id = '${a.application_id}'`)).toMatch(/고칠 수 없다/);
  });

  it("INV-V17 (실패경로): 요청에 아이디·계정 값을 붙이면 그런 함수가 없다고 거부된다 — 인자는 채널 주소 하나", async () => {
    ensureHandle("haru");
    const r = await (await as("haru")).rpc("request_creator_verification", { p_channel_url: SOOP("haru"), p_link_handle: "someone" });
    expect(r.error).not.toBeNull();
    expect(psql(`select count(*) from public.creator_verification_applications where account_id = '${CV.haru.id}'`)).toBe("0");
  });

  it("INV-V17 (실패경로): 코드 단계의 함수(다시 받기·코드 올렸어요·자동 확인)는 없다", async () => {
    const c = await as("haru");
    for (const fn of ["regenerate_creator_verification_code", "mark_creator_verification_posted", "claim_creator_verification_auto_check", "confirm_creator_verification_auto_check"]) {
      expect([fn, psql(`select count(*) from pg_proc where proname = '${fn}' and pronamespace = 'public'::regnamespace`)]).toEqual([fn, "0"]);
    }
    expect((await c.rpc("regenerate_creator_verification_code")).error).not.toBeNull();
  });

  it("INV-V15·V17: 확인 방식이 바뀌어 닫힌 옛 코드 신청(method_changed)은 3번 횟수에 세지 않는다", async () => {
    ensureHandle("haru");
    const tries = Number(psql("select public.cv_verification_tries()"));
    for (let i = 0; i < tries; i++) {
      psql(
        `begin; set local session_replication_role = replica; insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status, ended_at, reason_code) values ('${CV.haru.id}', 'soop', 'haruold', 'https://www.sooplive.com/station/haruold', public.cv_new_code(), 'code', 'closed', now(), 'method_changed'); commit;`,
      );
    }
    const a = await requestOk("haru", SOOP("haruold"));
    const rows = (await (await as("haru")).rpc("my_creator_verifications")).data as { id: string; remaining_count: number }[];
    expect(rows.find((r) => r.id === a.application_id)?.remaining_count).toBe(tries);
  });
});

describe("운영자 판정 (INV-V18·V19)", () => {
  it("INV-V18: 운영자 목록은 찾을 링크의 아이디(요청 때 값)와 가입 때 적은 채널 이름을 준다", async () => {
    const handle = ensureHandle("summer");
    const a = await requestOk("summer", SOOP("summernight"));
    setHandleDirect("summer", "cvh_summer2");
    const rows = (await (await as(STAFF)).rpc("admin_creator_verifications")).data as { id: string; link_handle: string; channel_title: string }[];
    expect(rows.find((r) => r.id === a.application_id)).toMatchObject({ link_handle: handle, channel_title: `${CV.summer.name} 채널` });
  });

  it("INV-V19 (S19): 새 반려 사유 다섯은 받고, 크리에이터에게 사유 값만 보이고 메모는 없다", async () => {
    for (const code of ["link_not_found", "link_mismatch", "name_mismatch", "channel_unreachable", "other"]) {
      const a = await requestOk("ggul", SOOP(`ggul${code.replace(/_/g, "")}`.slice(0, 24)));
      expect([code, (await reject(a.application_id, code, MEMO)).error]).toEqual([code, null]);
      const mine = (await (await as("ggul")).rpc("my_creator_verifications")).data as { id: string; reason_code: string }[];
      expect(mine.find((m) => m.id === a.application_id)?.reason_code).toBe(code);
      expect(JSON.stringify(mine)).not.toContain(MEMO);
      psql(`delete from public.creator_verification_unlocks where account_id = '${CV.ggul.id}'`);
    }
  });

  it("INV-V19 (실패경로): 옛 반려 사유(코드를 찾지 못함·가입 정보 다름)는 거부, 요청은 확인 대기 그대로", async () => {
    const a = await requestOk("ggul", SOOP("ggulold"));
    for (const code of ["code_not_found", "profile_mismatch"]) expect((await reject(a.application_id, code)).error?.code).toBe("22023");
    expect(appStatus(a.application_id)).toBe("posted");
  });

  it("INV-V19 (실패경로): 크리에이터는 자기 요청을 승인할 수 없고, 운영자 확인에는 기한이 없다", async () => {
    const a = await requestOk("ggul", SOOP("ggulself"));
    expect((await approve(a.application_id, CV.ggul.login)).error?.code).toBe("42501");
    shiftApp(a.application_id, "issued_at = now() - interval '200 days', posted_at = now() - interval '200 days'");
    expect((await approve(a.application_id, OWNER)).error).toBeNull();
    expect(verified("ggul")).toBe("t");
  });
});

describe("재확인 (INV-V20)", () => {
  it("INV-V20: 승인하면 마지막 확인 시각과 확인한 아이디가 적히고 재확인 목록에 없다", async () => {
    const handle = ensureHandle("haru");
    await verifyVia("haru", SOOP("haru"));
    expect(creatorCol("haru", "(link_checked_at > now() - interval '1 minute') || '|' || link_checked_handle")).toBe(`true|${handle}`);
    expect(await recheckOf("haru")).toBeUndefined();
  });

  it("INV-V20 (S20): 마지막 확인에서 90일이 지나면 재확인 목록에 오르고, 「링크 있음」이면 마지막 확인 시각이 지금으로 바뀌어 빠진다", async () => {
    await verifyVia("haru", SOOP("haru"));
    shiftCreator("haru", "link_checked_at = now() - interval '90 days 1 minute'");
    expect(await recheckOf("haru")).toMatchObject({ recheck_reason: "days", link_missing_at: null });
    expect((await recheck(CV.haru.creatorId, true, MEMO)).error).toBeNull();
    expect(creatorCol("haru", "(link_checked_at > now() - interval '1 minute')")).toBe("t");
    expect(await recheckOf("haru")).toBeUndefined();
    expect(psql(`select action || '|' || reason from public.creator_verification_events where creator_id = '${CV.haru.creatorId}' order by id desc limit 1`)).toBe(`recheck_found|${MEMO}`);
  });

  it("INV-V20 (실패경로): 89일이면 목록에 없고, 목록에 없는 크리에이터의 재확인은 「이미 처리됨」", async () => {
    await verifyVia("haru", SOOP("haru"));
    shiftCreator("haru", "link_checked_at = now() - interval '89 days'");
    expect(await recheckOf("haru")).toBeUndefined();
    expect((await recheck(CV.haru.creatorId, true)).error?.code).toBe("55000");
    expect((await recheck(CV.haru.creatorId, false)).error?.code).toBe("55000");
  });

  it("INV-V20 (S20b): 링크용 아이디를 바꾸면 바로 재확인 목록에 오른다 — 찾을 링크는 지금 아이디", async () => {
    await verifyVia("haru", SOOP("haru"));
    setHandleDirect("haru", "cvh_haru2");
    expect(await recheckOf("haru")).toMatchObject({ recheck_reason: "handle", handle: "cvh_haru2" });
    expect((await recheck(CV.haru.creatorId, true)).error).toBeNull();
    expect(creatorCol("haru", "link_checked_handle")).toBe("cvh_haru2");
    expect(await recheckOf("haru")).toBeUndefined();
  });

  it("INV-V20 (S20c): 「링크 없음」이면 유예가 시작되고, 유예 동안 확인됨·선물 받기는 그대로, 크리에이터는 「다시 확인 요청」을 낼 수 있다", async () => {
    await verifyVia("haru", SOOP("haru"));
    shiftCreator("haru", "link_checked_at = now() - interval '91 days'");
    expect((await recheck(CV.haru.creatorId, false)).error).toBeNull();
    expect(await recheckOf("haru")).toMatchObject({ link_missing_at: expect.any(String) });
    expect(verified("haru")).toBe("t");
    await registerTestOrder(1, { creatorId: CV.haru.creatorId });
    const st = (await (await as("haru")).rpc("my_creator_verification_state")).data as { grace_until: string | null }[];
    expect(Date.parse(st[0]?.grace_until ?? "") - Date.now()).toBeGreaterThan(13 * 86_400_000);
    expect((await (await as("haru")).rpc("request_creator_link_recheck")).error).toBeNull();
    expect((await recheckOf("haru"))?.recheck_requested_at).not.toBeNull();
    // 유예 중에 다시 「링크 없음」은 한 번만 반영된다
    expect((await recheck(CV.haru.creatorId, false)).error?.code).toBe("55000");
    // 「링크 있음」이면 유예가 끝난다
    expect((await recheck(CV.haru.creatorId, true)).error).toBeNull();
    expect(creatorCol("haru", "coalesce(link_missing_at::text, '-') || '|' || coalesce(recheck_requested_at::text, '-')")).toBe("-|-");
  });

  it("INV-V20 (S20d): 유예 14일이 지나도 다시 확인되지 않으면 예약 작업이 승인을 취소한다 — 사유 「팬꾹 링크가 채널에서 내려감」, 이미 등록된 주문은 그대로", async () => {
    await verifyVia("haru", SOOP("haru"));
    const order = await registerTestOrder(1, { creatorId: CV.haru.creatorId });
    shiftCreator("haru", "link_checked_at = now() - interval '91 days'");
    expect((await recheck(CV.haru.creatorId, false)).error).toBeNull();
    shiftCreator("haru", "link_missing_at = now() - interval '14 days 1 minute'");
    expect(expireGrace()).toBe(1);
    expect(verified("haru")).toBe("f");
    expect(psql(`select action || '|' || reason_code || '|' || acted_by from public.creator_verification_events where creator_id = '${CV.haru.creatorId}' order by id desc limit 1`)).toBe(
      "revoke|link_removed|00000000-0000-4000-a000-000000000022",
    );
    const mine = (await (await as("haru")).rpc("my_creator_verifications")).data as { status: string; reason_code: string }[];
    expect(mine[0]).toMatchObject({ status: "approved", reason_code: "link_removed" });
    expect(psql(`select status from public.orders where id = '${order.orderId}'`)).toBe("pending_payment");
    await expect(registerTestOrder(1, { creatorId: CV.haru.creatorId })).rejects.toThrow();
    // 채널이 풀려 다시 요청할 수 있다
    await requestOk("haru", SOOP("haru"));
  });

  it("INV-V20 (실패경로): 유예가 아직 남았으면(13일) 예약 작업은 아무것도 하지 않는다", async () => {
    await verifyVia("haru", SOOP("haru"));
    shiftCreator("haru", "link_checked_at = now() - interval '91 days'");
    expect((await recheck(CV.haru.creatorId, false)).error).toBeNull();
    shiftCreator("haru", "link_missing_at = now() - interval '13 days'");
    expireGrace();
    expect(verified("haru")).toBe("t");
  });

  it("INV-V20 (실패경로): 재확인은 운영자만, 「다시 확인 요청」은 유예 중인 본인만 — 유예가 아니면 「이미 처리됨」", async () => {
    await verifyVia("haru", SOOP("haru"));
    shiftCreator("haru", "link_checked_at = now() - interval '91 days'");
    for (const who of [CV.haru.login, CV.ggul.login, "byeolbit_fan"]) {
      expect((await recheck(CV.haru.creatorId, false, "", who)).error?.code).toBe("42501");
    }
    expect((await (await as("haru")).rpc("request_creator_link_recheck")).error?.code).toBe("55000");
    expect(creatorCol("haru", "coalesce(link_missing_at::text, '-')")).toBe("-");
    expect((await (await signedInClient("byeolbit_fan")).rpc("admin_creator_rechecks")).data).toEqual([]);
    expect(psqlError(`update public.creators set link_missing_at = now() where id = '${CV.haru.creatorId}'`)).toMatch(/재확인/);
  });

  it("INV-V20 (실패경로): 예약 작업 함수는 앱 서버 키·로그인한 사람이 부를 수 없다", async () => {
    expect((await anonClient().rpc("cv_expire_link_grace")).error).not.toBeNull();
    expect((await (await as(STAFF)).rpc("cv_expire_link_grace")).error).not.toBeNull();
    expect(psql(`select schedule || '|' || command from cron.job where jobname = 'fankkuk-link-grace'`)).toBe("7 * * * *|select public.cv_expire_link_grace()");
  });

  it("INV-V20 (동시): 유예 끝 처리와 운영자 「링크 있음」이 겹쳐도 하나만 반영된다", async () => {
    await verifyVia("haru", SOOP("haru"));
    shiftCreator("haru", "link_checked_at = now() - interval '91 days'");
    expect((await recheck(CV.haru.creatorId, false)).error).toBeNull();
    shiftCreator("haru", "link_missing_at = now() - interval '15 days'");
    const held = await holdRowLock(creatorRowLockSql("haru"), 1);
    const [found, expired] = await Promise.all([recheck(CV.haru.creatorId, true), expireGraceAsync()]);
    await held.released;
    if (found.error === null) {
      expect(verified("haru")).toBe("t");
      expect(expired).toBe("0");
      expect(creatorCol("haru", "coalesce(link_missing_at::text, '-')")).toBe("-");
    } else {
      expect(found.error.code).toBe("55000");
      expect(expired).toBe("1");
      expect(verified("haru")).toBe("f");
    }
  });
});

describe("확인 대기 중의 팬꾹 링크 페이지 (INV-V22)", () => {
  type Verifying = { creator_id: string; handle: string; name: string; intro: string; photo_path: string | null; face_tone: string };
  async function verifyingOf(handle: string): Promise<Verifying[]> {
    const r = await anonClient().rpc("verifying_creator_by_handle", { p_handle: handle });
    if (r.error) throw new Error(r.error.message);
    return r.data as Verifying[];
  }

  it("INV-V22 (S22): 확인 대기 요청이 있으면 로그인하지 않아도 공개 칸(이름·소개·사진·얼굴 색)만 읽힌다 — 확인된 링크 찾기에는 여전히 없다", async () => {
    const handle = ensureHandle("haru");
    await requestOk("haru", SOOP("haru"));
    const rows = await verifyingOf(handle);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["creator_id", "face_tone", "handle", "intro", "name", "photo_path"]);
    expect(rows[0]).toMatchObject({ creator_id: CV.haru.creatorId, handle, name: CV.haru.name });
    expect((await anonClient().rpc("resolve_creator_handle", { p_handle: handle })).data).toEqual([]);
  });

  it("INV-V22 (S22b, 실패경로): 확인 대기 중 크리에이터에게는 선물 등록이 거부되고, 찾기에 나오지 않는다", async () => {
    await requestOk("haru", SOOP("haru"));
    await expect(registerTestOrder(1, { creatorId: CV.haru.creatorId })).rejects.toThrow(/선물을 받을 수 없는 크리에이터/);
    expect(psql(`select count(*) from public.orders where creator_id = '${CV.haru.creatorId}'`)).toBe("0");
    const found = (await anonClient().rpc("find_creators")).data as { id: string }[];
    expect(found.map((c) => c.id)).not.toContain(CV.haru.creatorId);
  });

  it("INV-V22 (실패경로): 요청 전·반려 뒤·거둔 뒤에는 「채널 확인 중」이 아니다(없는 페이지)", async () => {
    const handle = ensureHandle("haru");
    expect(await verifyingOf(handle)).toEqual([]);
    const a = await requestOk("haru", SOOP("haru"));
    expect((await reject(a.application_id)).error).toBeNull();
    expect(await verifyingOf(handle)).toEqual([]);
    const b = await request("haru", SOOP("haru"));
    expect(b.error).toBeNull();
    expect((await withdraw("haru", (b.data as { application_id: string }).application_id)).error).toBeNull();
    expect(await verifyingOf(handle)).toEqual([]);
  });

  it("INV-V22: 묶인 옛 아이디로 찾으면 지금 아이디를 준다(페이지가 지금 주소로 넘긴다)", async () => {
    const old = ensureHandle("haru");
    await requestOk("haru", SOOP("haru"));
    setHandleDirect("haru", "cvh_haru3");
    expect((await verifyingOf(old))[0]?.handle).toBe("cvh_haru3");
  });

  it("INV-V22 (실패경로): 확인된 크리에이터는 「채널 확인 중」이 아니다(이사 요청이 있어도 지금 페이지 그대로)", async () => {
    const handle = ensureHandle("haru");
    await verifyVia("haru", SOOP("haru"));
    await requestOk("haru", SOOP("haru2"));
    expect(await verifyingOf(handle)).toEqual([]);
  });
});
