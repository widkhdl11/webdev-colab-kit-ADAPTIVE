import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  appRowLockSql,
  appStatus,
  as,
  autoClaim,
  autoConfirm,
  claimOf,
  createCvAccounts,
  CV,
  dropCvAccounts,
  post,
  reject,
  requestOk,
  resetCv,
  shiftApp,
  STAFF,
  verified,
  verifyVia,
} from "./creator-verification-helpers";
import { anonClient, holdRowLock, psql } from "./helpers";

// 크리에이터 본인 확인 — 코드 자동 확인 DB 층 (creator-verification INV-V16, 시나리오 S16~S16g).
// 앱 서버가 하는 일은 둘로 나뉜다: ① 1분 제한을 잡고 읽을 채널·찾을 코드를 받는다(claim) → 플랫폼 API 로 소개란을 읽는다 →
// ② 찾았는지만 넘긴다(confirm). 두 함수 모두 서버 관리자 키 전용이고, 소개란 글은 DB 로 오지 않는다.

const YT = (h: string) => `https://www.youtube.com/@${h}`;
const SOOP = (id: string) => `https://www.sooplive.com/station/${id}`;

beforeAll(() => {
  createCvAccounts();
  resetCv();
});
beforeEach(() => resetCv());
afterAll(() => dropCvAccounts());

type Claimed = { platform: string; channel_key: string; code: string };

async function claimOk(who: keyof typeof CV, applicationId: string): Promise<Claimed> {
  const r = await autoClaim(who, applicationId);
  if (r.error) throw new Error(`claim 실패: ${r.error.code} ${r.error.message}`);
  return r.data as Claimed;
}

function eventsOf(applicationId: string): string {
  return psql(`select coalesce(string_agg(action || ':' || coalesce(method, ''), ',' order by id), '') from public.creator_verification_events where application_id = '${applicationId}'`);
}

describe("코드 자동 확인 (INV-V16)", () => {
  it("INV-V16 (S16): 소개란에서 코드를 찾으면 그 자리에서 승인 — 확인됨, 점유가 확인된 크리에이터로, 기록의 확인 방법 「코드 자동 확인」", async () => {
    const a = await requestOk("ggul", YT("ggulauto"));
    const c = await claimOk("ggul", a.application_id);
    // 읽을 채널과 찾을 코드는 신청 줄에서 DB 가 정한다
    expect(c).toEqual({ platform: "youtube", channel_key: "ggulauto", code: a.code });
    const r = await autoConfirm(a.application_id, true);
    expect(r.error).toBeNull();
    expect(r.data).toBe("approved");
    expect(appStatus(a.application_id)).toBe("approved");
    expect(verified("ggul")).toBe("t");
    expect(claimOf("youtube", "ggulauto")).toBe(`verified:${CV.ggul.id}:${CV.ggul.creatorId}`);
    expect(psql(`select channel_url from public.creators where id = '${CV.ggul.creatorId}'`)).toBe(YT("ggulauto"));
    expect(eventsOf(a.application_id)).toBe("approve:auto_code");
    // 크리에이터와 운영자가 읽는 확인 방법도 「코드 자동 확인」
    const mine = (await (await as("ggul")).rpc("my_creator_verifications")).data as { id: string; method: string }[];
    expect(mine.find((m) => m.id === a.application_id)?.method).toBe("auto_code");
    const ops = (await (await as(STAFF)).rpc("admin_creator_verifications")).data as { id: string; method: string }[];
    expect(ops.find((m) => m.id === a.application_id)?.method).toBe("auto_code");
  });

  it("INV-V16 (S16b, 실패경로): 코드를 못 찾으면 신청은 코드 받음 그대로, 발급 시각·기한·남은 횟수 그대로, 기록 0줄", async () => {
    const a = await requestOk("ggul", YT("ggulnone"));
    const before = psql(`select issued_at from public.creator_verification_applications where id = '${a.application_id}'`);
    await claimOk("ggul", a.application_id);
    const r = await autoConfirm(a.application_id, false);
    expect(r.error).toBeNull();
    expect(r.data).toBe("not_found");
    expect(appStatus(a.application_id)).toBe("issued");
    expect(verified("ggul")).toBe("f");
    expect(eventsOf(a.application_id)).toBe("");
    expect(psql(`select issued_at from public.creator_verification_applications where id = '${a.application_id}'`)).toBe(before);
    const mine = (await (await as("ggul")).rpc("my_creator_verifications")).data as { id: string; post_deadline: string; remaining_count: number; status: string }[];
    expect(mine.find((m) => m.id === a.application_id)).toMatchObject({ status: "issued", post_deadline: a.post_deadline, remaining_count: 3 });
    expect(claimOf("youtube", "ggulnone")).toBe(`application:${CV.ggul.id}:`);
  });

  it("INV-V16 (S16c, 실패경로): API 확인이 없는 플랫폼(SOOP)은 자동 확인을 잡지도 승인하지도 않는다 — 「확인 요청」만 된다", async () => {
    const a = await requestOk("ggul", SOOP("ggulsoop"));
    const c = await autoClaim("ggul", a.application_id);
    expect(c.error?.code).toBe("FKV14");
    const r = await autoConfirm(a.application_id, true);
    expect(r.error?.code).toBe("FKV14");
    expect(appStatus(a.application_id)).toBe("issued");
    expect(verified("ggul")).toBe("f");
    expect(psql(`select last_auto_check_at is null from public.creator_verification_applications where id = '${a.application_id}'`)).toBe("t");
    // 운영자 확인 길은 그대로 열려 있다
    expect((await post("ggul", a.application_id)).error).toBeNull();
    expect(appStatus(a.application_id)).toBe("posted");
  });

  it("INV-V16 (INV-V2 표): DB 가 아는 「API 확인」 — 유튜브·치지직·인스타그램은 있음, SOOP 은 없음", async () => {
    const r = await (await as("ggul")).rpc("creator_verification_platforms");
    expect(r.error).toBeNull();
    const rows = (r.data as { platform: string; api_check: boolean }[]).toSorted((x, y) => x.platform.localeCompare(y.platform));
    expect(rows).toEqual([
      { platform: "chzzk", api_check: true },
      { platform: "instagram", api_check: true },
      { platform: "soop", api_check: false },
      { platform: "youtube", api_check: true },
    ]);
  });

  it("INV-V16 (S16d, 실패경로): 로그인한 사용자·로그인하지 않은 사람은 자동 확인 함수를 부를 수 없다, 아무것도 안 바뀜", async () => {
    const a = await requestOk("ggul", YT("ggulself"));
    for (const client of [await as("ggul"), await as("summer"), anonClient()]) {
      const c = await client.rpc("claim_creator_verification_auto_check", { p_account_id: CV.ggul.id, p_application_id: a.application_id });
      expect(c.error).not.toBeNull();
      const r = await client.rpc("confirm_creator_verification_auto_check", { p_application_id: a.application_id, p_found: true });
      expect(r.error).not.toBeNull();
    }
    expect(appStatus(a.application_id)).toBe("issued");
    expect(verified("ggul")).toBe("f");
    expect(psql(`select last_auto_check_at is null from public.creator_verification_applications where id = '${a.application_id}'`)).toBe("t");
    // 자동 확인 함수는 소개란 글을 받는 인자가 없다
    const args = psql(
      `select string_agg(pg_get_function_identity_arguments(p.oid), ' / ') from pg_proc p where p.proname in ('claim_creator_verification_auto_check', 'confirm_creator_verification_auto_check')`,
    );
    expect(args.split(" / ").toSorted()).toEqual(["p_account_id uuid, p_application_id uuid", "p_application_id uuid, p_found boolean"]);
  });

  it("INV-V16 (실패경로): 남의 신청은 자동 확인을 잡을 수 없다", async () => {
    const a = await requestOk("ggul", YT("ggulother"));
    const c = await autoClaim("summer", a.application_id);
    expect(c.error?.code).toBe("P0002");
    expect(psql(`select last_auto_check_at is null from public.creator_verification_applications where id = '${a.application_id}'`)).toBe("t");
  });

  it("INV-V16 (S16e, 실패경로): 1분 안에 다시 확인하면 「잠시 뒤 다시 눌러 주세요」, 1분이 지나면 다시 된다", async () => {
    const a = await requestOk("ggul", YT("ggulminute"));
    await claimOk("ggul", a.application_id);
    const again = await autoClaim("ggul", a.application_id);
    expect(again.error?.code).toBe("FKV15");
    expect(again.error?.message).toContain("잠시 뒤 다시 눌러 주세요");
    shiftApp(a.application_id, "last_auto_check_at = now() - interval '61 seconds'");
    await claimOk("ggul", a.application_id);
  });

  it("INV-V16 (S16e, 동시): 같은 신청의 확인 두 번이 동시에 와도 1분 제한을 잡는 것은 하나", async () => {
    const a = await requestOk("ggul", YT("ggulminute2"));
    const held = await holdRowLock(appRowLockSql(a.application_id), 1);
    const results = await Promise.all([autoClaim("ggul", a.application_id), autoClaim("ggul", a.application_id)]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("FKV15");
  });

  it("INV-V16 (S16f, 실패경로): 기간 지난 신청은 잡지도 승인하지도 않는다", async () => {
    const a = await requestOk("ggul", YT("ggulold"));
    shiftApp(a.application_id, "issued_at = now() - interval '7 days 1 minute'");
    expect((await autoClaim("ggul", a.application_id)).error?.code).toBe("FKV08");
    expect((await autoConfirm(a.application_id, true)).error?.code).toBe("FKV08");
    expect(appStatus(a.application_id)).toBe("issued");
    expect(verified("ggul")).toBe("f");
    expect(eventsOf(a.application_id)).toBe("");
  });

  it("INV-V16 (S16f, 실패경로): 올림(확인 대기) 신청은 자동 확인 대상이 아니다 — 운영자 확인을 기다린다", async () => {
    const a = await requestOk("ggul", YT("ggulposted"));
    expect((await post("ggul", a.application_id)).error).toBeNull();
    expect((await autoClaim("ggul", a.application_id)).error?.code).toBe("55000");
    expect((await autoConfirm(a.application_id, true)).error?.code).toBe("55000");
    expect(appStatus(a.application_id)).toBe("posted");
    expect(verified("ggul")).toBe("f");
  });

  it("INV-V16 (S16f, 실패경로): 반려된 신청은 「이미 처리됨」, 아무것도 안 바뀜", async () => {
    const a = await requestOk("ggul", YT("ggulrej"));
    expect((await reject(a.application_id)).error).toBeNull();
    expect((await autoClaim("ggul", a.application_id)).error?.code).toBe("55000");
    expect((await autoConfirm(a.application_id, true)).error?.code).toBe("55000");
    expect(appStatus(a.application_id)).toBe("rejected");
    expect(verified("ggul")).toBe("f");
    expect(eventsOf(a.application_id)).toBe("reject:code");
  });

  it("INV-V16 (S16g, 동시): 자동 확인과 운영자 반려가 동시에 와도 하나만, 나머지는 「이미 처리됨」, 기록 1줄", async () => {
    const a = await requestOk("ggul", YT("ggulrace"));
    await claimOk("ggul", a.application_id);
    const held = await holdRowLock(appRowLockSql(a.application_id), 1);
    const results = await Promise.all([autoConfirm(a.application_id, true), reject(a.application_id, "code_not_found", "", STAFF)]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("55000");
    expect(psql(`select count(*) from public.creator_verification_events where application_id = '${a.application_id}'`)).toBe("1");
    const st = appStatus(a.application_id);
    expect(["approved", "rejected"]).toContain(st);
    expect(verified("ggul")).toBe(st === "approved" ? "t" : "f");
  });

  it("INV-V16 (INV-V12): 확인된 크리에이터의 채널 이사 신청도 자동 확인으로 승인되면 새 채널로 바뀌고 옛 점유가 풀린다", async () => {
    await verifyVia("haru", YT("haruold"));
    const a = await requestOk("haru", YT("harunew"));
    await claimOk("haru", a.application_id);
    expect((await autoConfirm(a.application_id, true)).error).toBeNull();
    expect(psql(`select channel_url from public.creators where id = '${CV.haru.creatorId}'`)).toBe(YT("harunew"));
    expect(claimOf("youtube", "haruold")).toBe("");
    expect(claimOf("youtube", "harunew")).toBe(`verified:${CV.haru.id}:${CV.haru.creatorId}`);
  });
});
