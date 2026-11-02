import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  appRowLockSql,
  approve,
  appStatus,
  as,
  channelLockSql,
  claimOf,
  createCvAccounts,
  creatorRowLockSql,
  CV,
  dropCvAccounts,
  GHOST_CREATOR_ID,
  liveCount,
  loginConfirm,
  OWNER,
  reject,
  request,
  requestOk,
  resetCv,
  revoke,
  shiftApp,
  STAFF,
  unlock,
  verified,
  verifyVia,
  withdraw,
} from "./creator-verification-helpers";
import { VERIFICATION_TRIES } from "@/entities/creator/model/creator-verification";
import { adminClient, anonClient, holdRowLock, psql, psqlError, registerTestOrder, SEED, signedInClient } from "./helpers";

// 크리에이터 채널 확인 — DB 층(creator-verification INV-V1~V15, 시나리오 S1~S15h). 선물 링크 게시 확인의 새 규칙(INV-V17~V22)은 creator-verification-link-db.
// 사람 이름은 스펙 시나리오를 따른다: 꿀단지(ggul)·여름밤(summer)은 확인 안 된 크리에이터, 하루시험(haru)은 채널을 옮기는 크리에이터,
// 별빛 = 시드 팬, 모아 = fankkuk_admin, 라임 = fankkuk_staff.

const YT = (h: string) => `https://www.youtube.com/@${h}`;
const MEMO = "다른 계정과 대조함 — 운영자만";
/** 치지직 채널 키(16진수 32자) — 로그인 확인은 치지직만 받는다(INV-V14, 2026-11-02). */
const CZ = (n: number) => `c0ffee${n.toString(16).padStart(26, "0")}`;
const CZU = (n: number) => `https://chzzk.naver.com/${CZ(n)}`;

beforeAll(() => {
  createCvAccounts();
  resetCv();
});
beforeEach(() => resetCv());
afterAll(() => dropCvAccounts());

type Mine = Record<string, unknown> & { id: string; status: string; reason_code: string | null; remaining_count: number; link_handle: string | null };

async function mine(who: keyof typeof CV): Promise<Mine[]> {
  const r = await (await as(who)).rpc("my_creator_verifications");
  if (r.error) throw new Error(r.error.message);
  return r.data as Mine[];
}

function countApps(who: keyof typeof CV): number {
  return Number(psql(`select count(*) from public.creator_verification_applications where account_id = '${CV[who].id}'`));
}

describe("신청하는 사람 (INV-V1)", () => {
  it("INV-V1 (S1): 크리에이터가 채널 주소로 요청하면 확인 대기 요청 1건이 생긴다(코드 없음)", async () => {
    const a = await requestOk("ggul", YT("GgulDanji"));
    expect(psql(`select account_id || '|' || status || '|' || method || '|' || (code is null) from public.creator_verification_applications where id = '${a.application_id}'`)).toBe(
      `${CV.ggul.id}|posted|link|true`,
    );
    expect(countApps("ggul")).toBe(1);
  });

  it("INV-V1 (S1b, 실패경로): 팬·운영자·로그인하지 않은 사람의 신청은 거부, 신청 0건", async () => {
    for (const who of ["byeolbit_fan", OWNER]) {
      const r = await (await signedInClient(who)).rpc("request_creator_verification", { p_channel_url: YT("fanattempt") });
      expect(r.error?.code).toBe("42501");
    }
    const anon = await anonClient().rpc("request_creator_verification", { p_channel_url: YT("fanattempt") });
    expect(anon.error).not.toBeNull();
    expect(psql(`select count(*) from public.creator_verification_applications where channel_key = 'fanattempt'`)).toBe("0");
  });

  it("INV-V1 (S1c, 실패경로): 요청에 다른 계정 값을 붙여도 무시되고 신청은 로그인한 사람의 것이다", async () => {
    const c = await as("ggul");
    // 인자를 더 붙이면 그런 함수가 없다고 거부된다(인자는 채널 주소 하나뿐)
    const extra = await c.rpc("request_creator_verification", { p_channel_url: YT("ggulone"), p_account_id: CV.haru.id });
    expect(extra.error).not.toBeNull();
    expect(countApps("haru")).toBe(0);
    const ok = await requestOk("ggul", YT("ggulone"));
    expect(psql(`select account_id from public.creator_verification_applications where id = '${ok.application_id}'`)).toBe(CV.ggul.id);
  });
});

describe("채널 주소 검사 (INV-V2)", () => {
  it("INV-V2 (S2): 유튜브 주소는 서버가 다시 만든 주소로 저장하고 키는 소문자 핸들", async () => {
    const a = await requestOk("ggul", "https://m.youtube.com/@GgulDanji/videos?x=1");
    expect(a.channel_url).toBe("https://www.youtube.com/@gguldanji");
    expect(psql(`select platform || '|' || channel_key || '|' || channel_url from public.creator_verification_applications where id = '${a.application_id}'`)).toBe(
      "youtube|gguldanji|https://www.youtube.com/@gguldanji",
    );
  });

  it("INV-V2 (S2b): 인스타그램은 사용자 이름을 소문자로", async () => {
    const a = await requestOk("summer", "https://instagram.com/Summer_Night_KO/");
    expect(a.channel_url).toBe("https://www.instagram.com/summer_night_ko");
    expect(claimOf("instagram", "summer_night_ko")).toBe(`application:${CV.summer.id}:`);
  });

  it("INV-V2: 치지직·SOOP 주소 꼴과 옛 SOOP 주소, 한글 핸들(퍼센트 인코딩)", async () => {
    const hex = "AbCdEf0123456789abcdef0123456789";
    const c1 = await requestOk("ggul", `https://chzzk.naver.com/live/${hex}`);
    expect(c1.channel_url).toBe(`https://chzzk.naver.com/${hex.toLowerCase()}`);
    const s1 = await requestOk("summer", "https://ch.sooplive.co.kr/SaeByeok01");
    expect(s1.channel_url).toBe("https://www.sooplive.com/station/saebyeok01");
    const k1 = await requestOk("dawn", "https://www.youtube.com/@%EA%BF%80%EB%8B%A8%EC%A7%80");
    expect(k1.channel_url).toBe("https://www.youtube.com/@꿀단지");
  });

  it("INV-V2 (S2c·S2d, 실패경로): http·목록 밖 호스트·틱톡·/channel/ 주소·정해진 꼴이 아닌 경로는 DB 가 거부, 신청 0건", async () => {
    const bad: [string, string][] = [
      ["http://www.youtube.com/@ggul", "22023"],
      ["https://evil.example/@a", "FKV02"],
      ["https://www.tiktok.com/@ggul", "FKV02"],
      ["https://youtube.com.evil.example/@ggul", "FKV02"],
      ["https://www.youtube.com@evil.example/@ggul", "22023"],
      ["https://www.youtube.com:8443/@ggul", "22023"],
      ["https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", "22023"],
      ["https://www.youtube.com/gguldanji", "22023"],
      ["https://www.youtube.com/channel/abcdef", "22023"],
      ["https://www.youtube.com/@ggul/videos/extra", "22023"],
      ["https://www.youtube.com/@g", "22023"],
      ["https://www.youtube.com/@_ggul", "22023"],
      ["https://chzzk.naver.com/abc123", "22023"],
      ["https://chzzk.naver.com/video/0123456789abcdef0123456789abcdef", "22023"],
      ["https://www.sooplive.com/ggul", "22023"],
      ["https://www.instagram.com/p/ABCDEF", "22023"],
      ["https://www.instagram.com/explore", "22023"],
      ["https://www.instagram.com/.ggul", "22023"],
      ["https://www.instagram.com/gg..ul", "22023"],
      ["", "22023"],
    ];
    for (const [url, code] of bad) {
      const r = await request("ggul", url);
      expect([url, r.error?.code]).toEqual([url, code]);
    }
    expect(countApps("ggul")).toBe(0);
  });

  it("INV-V2 (S2e, 실패경로): 알플레이 주소는 「1:1 문의로 알려 주세요」로 거부, 신청 0건", async () => {
    const r = await request("ggul", "https://rplay.live/play/ggul123");
    expect(r.error?.code).toBe("FKV02");
    expect(r.error?.message).toContain("1:1 문의로 알려 주세요");
    expect(countApps("ggul")).toBe(0);
  });

  it("INV-V2 (실패경로): 신청 표의 채널 키 칸은 플랫폼별 꼴이 아니면 DB 가 받지 않는다", () => {
    const err = psqlError(
      `insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status) values ('${CV.ggul.id}', 'youtube', 'Upper', 'https://www.youtube.com/@Upper', 'FK-ZZZZ-00', 'code', 'issued')`,
    );
    expect(err).toMatch(/check constraint/);
    const err2 = psqlError(
      `insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status) values ('${CV.ggul.id}', 'youtube', 'ggul', 'https://evil.example/@ggul', 'FK-ZZZZ-01', 'code', 'issued')`,
    );
    expect(err2).toMatch(/check constraint/);
  });
});

describe("계정마다 살아 있는 신청 하나 (INV-V4)", () => {
  it("INV-V4 (S4c, 동시): 같은 계정의 신청 두 개가 동시에 와도 살아 있는 신청은 1건", async () => {
    const held = await holdRowLock(creatorRowLockSql("ggul"), 1);
    const results = await Promise.all([request("ggul", YT("ggulconc1")), request("ggul", YT("ggulconc2"))]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("FKV03");
    expect(liveCount("ggul")).toBe(1);
  });

  it("INV-V4 (실패경로): 계정마다 살아 있는 신청 하나는 DB 제약이 지킨다", async () => {
    await requestOk("ggul", YT("ggulone1"));
    const err = psqlError(
      `insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status, posted_at) values ('${CV.ggul.id}', 'youtube', 'ggulone2', 'https://www.youtube.com/@ggulone2', 'FK-ZZZZ-02', 'code', 'posted', now())`,
    );
    expect(err).toMatch(/duplicate key|unique/);
  });

  it("INV-V4 (S4d, 실패경로): 올림 신청이 있으면 다른 채널로 새 신청은 거부, 살아 있는 신청 1건 그대로", async () => {
    const a = await requestOk("ggul", YT("ggulposted"));
    expect((await request("ggul", YT("ggulother"))).error?.code).toBe("FKV03");
    expect(liveCount("ggul")).toBe(1);
    expect(appStatus(a.application_id)).toBe("posted");
  });

  it("INV-V4 (S4e): 올림 신청을 거두면 거둠, 점유가 풀리고 새로 신청할 수 있다", async () => {
    const a = await requestOk("ggul", YT("ggulwd"));
    expect((await withdraw("ggul", a.application_id)).error).toBeNull();
    expect(appStatus(a.application_id)).toBe("withdrawn");
    expect(claimOf("youtube", "ggulwd")).toBe("");
    await requestOk("summer", YT("ggulwd"));
  });

  it("INV-V4 (실패경로): 남의 요청은 거둘 수 없다", async () => {
    const a = await requestOk("ggul", YT("ggulmine"));
    expect((await withdraw("summer", a.application_id)).error?.code).toBe("P0002");
    expect(appStatus(a.application_id)).toBe("posted");
  });
});

describe("운영자 확인에는 기한이 없다 (INV-V5)", () => {
  it("INV-V5 (S5c): 확인 대기 요청은 30일 뒤에도 운영자가 승인한다 — 코드 단계의 7일 기한은 없다", async () => {
    const a = await requestOk("ggul", YT("ggullate"));
    shiftApp(a.application_id, "issued_at = now() - interval '30 days', posted_at = now() - interval '30 days'");
    expect((await mine("ggul")).find((m) => m.id === a.application_id)?.status).toBe("posted");
    expect((await approve(a.application_id)).error).toBeNull();
    expect(verified("ggul")).toBe("t");
  });
});

describe("승인·반려는 운영자만, 한 번만 (INV-V6)", () => {
  it("INV-V6 (S6, 실패경로): 본인·다른 크리에이터·팬은 승인·반려할 수 없고 아무것도 안 바뀐다", async () => {
    const a = await requestOk("ggul", YT("ggulself"));
    for (const who of [CV.ggul.login, CV.summer.login, "byeolbit_fan"]) {
      expect((await approve(a.application_id, who)).error?.code).toBe("42501");
      expect((await reject(a.application_id, "link_not_found", "", who)).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_approve_creator_verification", { p_application_id: a.application_id })).error).not.toBeNull();
    expect(appStatus(a.application_id)).toBe("posted");
    expect(verified("ggul")).toBe("f");
    expect(psql(`select count(*) from public.creator_verification_events where creator_id = '${CV.ggul.creatorId}'`)).toBe("0");
  });

  it("INV-V6 (S6b, 동시): 모아의 승인과 라임의 반려가 동시에 와도 하나만, 기록 1줄", async () => {
    const a = await requestOk("ggul", YT("ggulrace"));
    const held = await holdRowLock(appRowLockSql(a.application_id), 1);
    const results = await Promise.all([approve(a.application_id, OWNER), reject(a.application_id, "link_not_found", "", STAFF)]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("55000");
    expect(psql(`select count(*) from public.creator_verification_events where application_id = '${a.application_id}'`)).toBe("1");
    const st = appStatus(a.application_id);
    expect(verified("ggul")).toBe(st === "approved" ? "t" : "f");
  });

  it("INV-V6 (S6c, 동시): 모아의 승인과 꿀단지의 거두기가 동시에 와도 하나만", async () => {
    const a = await requestOk("ggul", YT("ggulrace2"));
    const held = await holdRowLock(appRowLockSql(a.application_id), 1);
    const results = await Promise.all([approve(a.application_id, OWNER), withdraw("ggul", a.application_id)]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("55000");
    const st = appStatus(a.application_id);
    expect(["approved", "withdrawn"]).toContain(st);
    expect(verified("ggul")).toBe(st === "approved" ? "t" : "f");
  });

  it("INV-V6 (S6e, 실패경로): 신청 없이 확인됨으로 바꾸는 경로는 없다 — 옛 승인 함수도, 표 직접 고치기도", async () => {
    const op = await as(OWNER);
    const r = await op.rpc("admin_set_creator_verified", { p_creator_id: CV.ggul.creatorId, p_verified: true, p_reason: "" });
    expect(r.error?.code).toBe("FKV11");
    expect(verified("ggul")).toBe("f");
    // 앱 서버 키로 표를 직접 고쳐도 막는다
    await adminClient().from("creators").update({ identity_verified: true }).eq("id", CV.ggul.creatorId);
    expect(verified("ggul")).toBe("f");
    expect(psqlError(`update public.creators set identity_verified = true where id = '${CV.ggul.creatorId}'`)).toMatch(/승인 함수/);
  });

  it("INV-V6 (실패경로): 확인된 상태로 공개 정보 행을 바로 넣을 수도 없다", async () => {
    const ghost = GHOST_CREATOR_ID;
    const r = await adminClient().from("creators").insert({ id: ghost, slug: "cvt-ghost", name: "유령", channel: "유튜브", identity_verified: true });
    expect(r.error).not.toBeNull();
    expect(psql(`select count(*) from public.creators where id = '${ghost}'`)).toBe("0");
    // 확인 안 됨으로는 넣을 수 있다(있을 때 보는 쪽)
    const ok = await adminClient().from("creators").insert({ id: ghost, slug: "cvt-ghost", name: "유령", channel: "", identity_verified: false });
    expect(ok.error).toBeNull();
    psql(`delete from public.creators where id = '${ghost}'`);
  });

  it("INV-V6 (S6f): 승인 기록에 누가·언제·채널 주소·코드·확인 방법이 있고, 그 줄은 고치거나 지울 수 없다", async () => {
    const a = await verifyVia("ggul", YT("ggullog"));
    const row = psql(
      `select e.action || '|' || e.acted_by || '|' || e.channel_url || '|' || coalesce(e.code, '-') || '|' || e.link_handle || '|' || e.method || '|' || (e.at > now() - interval '1 minute') from public.creator_verification_events e where e.application_id = '${a.application_id}'`,
    );
    expect(row).toBe(`approve|00000000-0000-4000-a000-000000000021|https://www.youtube.com/@ggullog|-|${a.link_handle}|link|true`);
    expect(psqlError(`update public.creator_verification_events set reason = 'x' where application_id = '${a.application_id}'`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`delete from public.creator_verification_events where application_id = '${a.application_id}'`)).toMatch(/고치거나 지울 수 없다/);
    const events = (await (await as(STAFF)).rpc("admin_creator_verification_events")).data as { application_id: string; link_handle: string; method: string; channel_url: string }[];
    expect(events.find((e) => e.application_id === a.application_id)).toMatchObject({ link_handle: a.link_handle, method: "link", channel_url: "https://www.youtube.com/@ggullog" });
  });

  it("INV-V6 (실패경로): 끝난 신청은 다시 살아나지 않는다 — 표를 직접 고쳐도", async () => {
    const a = await requestOk("ggul", YT("ggulended"));
    expect((await reject(a.application_id)).error).toBeNull();
    expect(psqlError(`update public.creator_verification_applications set status = 'posted' where id = '${a.application_id}'`)).toMatch(/끝난 신청/);
    expect(appStatus(a.application_id)).toBe("rejected");
  });
});

describe("승인하면 한 처리에서 (INV-V7)", () => {
  it("INV-V7 (S7): 승인 → 신청 승인, 공개 정보의 플랫폼·주소·키, 확인됨, 점유가 확인된 크리에이터로, 찾기에 나온다", async () => {
    const a = await verifyVia("ggul", "https://m.youtube.com/@GgulDanji");
    expect(appStatus(a.application_id)).toBe("approved");
    expect(psql(`select platform || '|' || channel || '|' || channel_url || '|' || channel_key || '|' || identity_verified from public.creators where id = '${CV.ggul.creatorId}'`)).toBe(
      "youtube|유튜브|https://www.youtube.com/@gguldanji|gguldanji|true",
    );
    expect(claimOf("youtube", "gguldanji")).toBe(`verified:${CV.ggul.id}:${CV.ggul.creatorId}`);
    const found = (await anonClient().rpc("list_creators")).data as { id: string }[];
    expect(found.map((c) => c.id)).toContain(CV.ggul.creatorId);
  });

  it("INV-V7 (S7b, 실패경로): 확인된 뒤 채널 주소·플랫폼은 승인 밖에서 바뀌지 않는다", async () => {
    await verifyVia("ggul", YT("ggulfixed"));
    const me = await as("ggul");
    await me.from("creators").update({ channel_url: YT("someoneelse"), platform: "instagram" }).eq("id", CV.ggul.creatorId);
    await adminClient().from("creators").update({ channel_url: YT("someoneelse") }).eq("id", CV.ggul.creatorId);
    await adminClient().from("creators").update({ channel_key: "someoneelse" }).eq("id", CV.ggul.creatorId);
    await adminClient().from("creators").update({ platform: "instagram" }).eq("id", CV.ggul.creatorId);
    await adminClient().from("creators").update({ channel: "인스타그램" }).eq("id", CV.ggul.creatorId);
    // 세 칸을 서로 맞춰 한 번에 바꾸면 표의 꼴 제약은 통과한다 — 막는 것은 승인 함수 밖 쓰기 금지뿐이다
    await adminClient()
      .from("creators")
      .update({ platform: "youtube", channel_key: "someoneelse", channel_url: YT("someoneelse") })
      .eq("id", CV.ggul.creatorId);
    expect(psql(`select platform || '|' || channel || '|' || channel_url || '|' || channel_key from public.creators where id = '${CV.ggul.creatorId}'`)).toBe(
      "youtube|유튜브|https://www.youtube.com/@ggulfixed|ggulfixed",
    );
  });
});

describe("한 채널 한 계정 (INV-V8)", () => {
  it("INV-V8 (S8): 다른 계정이 확인된 채널로 신청하면 「이미 등록한 채널이에요」", async () => {
    await verifyVia("haru", YT("haruchan"));
    const r = await request("ggul", YT("haruchan"));
    expect(r.error?.code).toBe("FKV05");
    expect(r.error?.message).toContain("이미 등록한 채널이에요");
    expect(countApps("ggul")).toBe(0);
  });

  it("INV-V8: 시드의 확인된 크리에이터 채널도 점유돼 있다", async () => {
    const seedUrl = psql(`select channel_url from public.creators where id = '${SEED.haruCreatorId}'`);
    expect(seedUrl).toMatch(/^https:\/\//);
    const r = await request("ggul", seedUrl);
    expect(r.error?.code).toBe("FKV05");
    expect(Number(psql(`select count(*) from public.creators c where c.identity_verified and not exists (select 1 from public.creator_channel_claims k where k.creator_id = c.id and k.kind = 'verified')`))).toBe(0);
  });

  it("INV-V8 (S8b, 실패경로): 다른 계정이 확인 중인 채널(코드 받음·올림)은 「이미 확인중인 채널이에요」", async () => {
    const a = await requestOk("ggul", YT("xchan"));
    const r1 = await request("summer", YT("xchan"));
    expect(r1.error?.code).toBe("FKV06");
    expect(r1.error?.message).toContain("이미 확인중인 채널이에요");
    expect((await request("summer", YT("XChan"))).error?.code).toBe("FKV06");
    expect(Number(psql(`select count(*) from public.creator_verification_applications where channel_key = 'xchan'`))).toBe(1);
  });

  it("INV-V8 (S8c, 동시): 두 계정이 같은 채널로 동시에 신청해도 신청은 1건", async () => {
    const held = await holdRowLock(channelLockSql("youtube", "racechan"), 1);
    const results = await Promise.all([request("ggul", YT("racechan")), request("summer", YT("RaceChan"))]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error !== null)?.error?.code).toBe("FKV06");
    expect(psql(`select count(*) from public.creator_verification_applications where channel_key = 'racechan'`)).toBe("1");
  });

  it("INV-V8 (실패경로): 점유 표는 채널 키마다 한 줄 — DB 제약", async () => {
    await requestOk("ggul", YT("dupclaim"));
    const err = psqlError(
      `insert into public.creator_channel_claims (platform, channel_key, kind, account_id, creator_id) values ('youtube', 'dupclaim', 'verified', '${CV.summer.id}', '${CV.summer.creatorId}')`,
    );
    expect(err).toMatch(/duplicate key|unique/);
  });

  it("INV-V8 (S8d, 실패경로): 표기만 다른 같은 채널은 같은 키라 「이미 등록한 채널이에요」", async () => {
    await verifyVia("haru", "https://youtube.com/@Haru");
    expect((await request("ggul", "https://m.youtube.com/@haru/")).error?.code).toBe("FKV05");
  });

  it("INV-V8 (S8f): 링크가 없는 사칭 요청을 반려하면 점유가 풀린다", async () => {
    const fake = await requestOk("summer", YT("fakeposted"));
    expect((await reject(fake.application_id, "link_not_found")).error).toBeNull();
    expect(claimOf("youtube", "fakeposted")).toBe("");
    await requestOk("ggul", YT("fakeposted"));
  });
});

describe("사유 (INV-V9)", () => {
  it("INV-V9 (S9): 반려 사유 목록 값은 크리에이터에게 보이고 메모는 어디에도 없다", async () => {
    const a = await requestOk("ggul", YT("ggulreason"));
    expect((await reject(a.application_id, "link_not_found", MEMO)).error).toBeNull();
    const rows = await mine("ggul");
    const row = rows.find((m) => m.id === a.application_id);
    expect(row).toMatchObject({ status: "rejected", reason_code: "link_not_found" });
    expect(JSON.stringify(rows)).not.toContain(MEMO);
    // 운영자 기록에는 메모가 있다(있을 때 보는 쪽)
    const ev = (await (await as(STAFF)).rpc("admin_creator_verification_events")).data as { application_id: string; reason: string; reason_code: string }[];
    expect(ev.find((e) => e.application_id === a.application_id)).toMatchObject({ reason: MEMO, reason_code: "link_not_found" });
  });

  it("INV-V9 (S9b): 승인 취소 사유는 크리에이터에게 보이고 메모는 없다", async () => {
    const a = await verifyVia("ggul", YT("ggulrevoke"));
    expect((await revoke(CV.ggul.creatorId, "channel_gone", MEMO)).error).toBeNull();
    const rows = await mine("ggul");
    expect(rows.find((m) => m.id === a.application_id)).toMatchObject({ reason_code: "channel_gone" });
    expect(JSON.stringify(rows)).not.toContain(MEMO);
  });

  it("INV-V9 화면 맨 위 줄: 이사 신청을 거둔 뒤 승인이 취소되면, 내 신청 읽기의 첫 줄은 거둔 신청이 아니라 취소된 승인이다", async () => {
    const a = await verifyVia("ggul", YT("ggulfirst"));
    const move = await requestOk("ggul", YT("ggulmove"));
    expect((await withdraw("ggul", move.application_id)).error).toBeNull();
    expect((await revoke(CV.ggul.creatorId, "channel_gone")).error).toBeNull();
    const rows = await mine("ggul");
    // 발급은 이사 신청이 나중이지만, 마지막으로 일어난 일은 승인 취소다
    expect(rows[0]).toMatchObject({ id: a.application_id, status: "approved", reason_code: "channel_gone" });
    expect(rows[1]).toMatchObject({ id: move.application_id, status: "withdrawn" });
  });

  it("INV-V9 화면 맨 위 줄: 끝난 시각(거둠·반려)이 발급보다 늦으면 그 시각으로 줄을 세운다", async () => {
    const a = await requestOk("ggul", YT("ggulended1"));
    expect((await withdraw("ggul", a.application_id)).error).toBeNull();
    const b = await requestOk("ggul", YT("ggulended2"));
    expect((await withdraw("ggul", b.application_id)).error).toBeNull();
    // 발급은 b 가 나중이다. a 가 가장 늦게 끝난 것으로 만든다(끝난 시각만 옮김).
    shiftApp(a.application_id, "ended_at = now() + interval '1 minute'");
    expect((await mine("ggul"))[0]).toMatchObject({ id: a.application_id, status: "withdrawn" });
  });

  it("INV-V9 (S9c, 실패경로): 사유 없이·목록 밖 값·서로 바뀐 목록·201자 메모로 반려·취소하면 거부, 아무것도 안 바뀜", async () => {
    const a = await requestOk("ggul", YT("ggulnoreason"));
    for (const code of ["", "nope", "code_removed", "owner_confirmed_elsewhere", "code_not_found", "profile_mismatch"]) {
      expect((await reject(a.application_id, code)).error?.code).toBe("22023");
    }
    expect((await reject(a.application_id, "other", "가".repeat(201))).error?.code).toBe("22023");
    expect(appStatus(a.application_id)).toBe("posted");

    await verifyVia("haru", YT("harunoreason"));
    for (const code of ["", "nope", "link_not_found", "code_removed"]) {
      expect((await revoke(CV.haru.creatorId, code)).error?.code).toBe("22023");
    }
    expect(verified("haru")).toBe("t");
  });

  it("INV-V9 (S9d, 실패경로): 반려된 요청은 승인·다시 반려 모두 「이미 처리됨」, 새 요청은 새 줄", async () => {
    const a = await requestOk("ggul", YT("ggulrej"));
    expect((await reject(a.application_id)).error).toBeNull();
    expect((await approve(a.application_id)).error?.code).toBe("55000");
    expect((await reject(a.application_id)).error?.code).toBe("55000");
    expect(appStatus(a.application_id)).toBe("rejected");
    const b = await requestOk("ggul", YT("ggulrej"));
    expect(b.application_id).not.toBe(a.application_id);
  });
});

describe("승인 취소 뒤 (INV-V10)", () => {
  it("INV-V10 (S10·S10b): 취소된 꿀단지는 새로 요청할 수 있고, 옛 요청은 다시 승인되지 않는다", async () => {
    const a = await verifyVia("ggul", YT("ggulx"));
    expect((await revoke(CV.ggul.creatorId)).error).toBeNull();
    expect(verified("ggul")).toBe("f");
    expect(claimOf("youtube", "ggulx")).toBe("");
    expect((await approve(a.application_id)).error?.code).toBe("55000");
    expect(verified("ggul")).toBe("f");
    const b = await requestOk("ggul", YT("ggulx"));
    expect(b.application_id).not.toBe(a.application_id);
    const found = (await anonClient().rpc("list_creators")).data as { id: string }[];
    expect(found.map((c) => c.id)).not.toContain(CV.ggul.creatorId);
  });

  it("INV-V10 (S10c): 취소로 풀린 채널은 다른 계정이 신청할 수 있다", async () => {
    await verifyVia("ggul", YT("freed"));
    expect((await revoke(CV.ggul.creatorId, "not_owner_confirmed")).error).toBeNull();
    await requestOk("summer", YT("freed"));
  });

  it("INV-V10 (동시): 취소와 같은 계정의 채널 이사 승인이 겹치면 하나만 반영된다", async () => {
    await verifyVia("haru", YT("harufrom"));
    const move = await requestOk("haru", YT("haruto"));
    const held = await holdRowLock(creatorRowLockSql("haru"), 1);
    const [rv, ap] = await Promise.all([revoke(CV.haru.creatorId), approve(move.application_id)]);
    await held.released;
    // 취소는 어느 순서든 반영된다. 취소가 먼저면 이사 신청도 함께 끝나 승인은 「이미 처리됨」 —
    // 취소된 크리에이터가 이사 승인으로 다시 확인됨이 되는 일은 없다.
    expect(rv.error).toBeNull();
    if (ap.error) expect(ap.error.code).toBe("55000");
    expect(verified("haru")).toBe("f");
    expect(claimOf("youtube", "haruto")).toBe("");
    expect(claimOf("youtube", "harufrom")).toBe("");
    expect(liveCount("haru")).toBe(0);
  });

  it("INV-V10 (실패경로): 취소가 먼저 끝나면 이사 신청은 끝나고 다시 승인되지 않는다", async () => {
    await verifyVia("haru", YT("harufrom2"));
    const move = await requestOk("haru", YT("haruto2"));
    expect((await revoke(CV.haru.creatorId)).error).toBeNull();
    expect((await approve(move.application_id)).error?.code).toBe("55000");
    expect(verified("haru")).toBe("f");
    expect(claimOf("youtube", "haruto2")).toBe("");
  });

  it("INV-V10 (실패경로): 취소는 운영자만, 확인 안 된 크리에이터 취소는 「이미 처리됨」", async () => {
    await verifyVia("ggul", YT("ggulonlyop"));
    for (const who of [CV.ggul.login, "byeolbit_fan"]) {
      expect((await revoke(CV.ggul.creatorId, "channel_gone", "", who)).error?.code).toBe("42501");
    }
    expect(verified("ggul")).toBe("t");
    expect((await revoke(CV.summer.creatorId)).error?.code).toBe("55000");
  });
});

describe("읽기 (INV-V11)", () => {
  it("INV-V11 (S11, 실패경로): 남의 신청은 여름밤·팬·로그인 안 한 사람에게 0줄, 표 직접 읽기도 0줄", async () => {
    const a = await requestOk("ggul", YT("ggulread"));
    expect((await mine("ggul")).map((m) => m.id)).toEqual([a.application_id]);
    expect(await mine("summer")).toEqual([]);
    expect((await (await signedInClient("byeolbit_fan")).rpc("my_creator_verifications")).data).toEqual([]);
    const anon = await anonClient().rpc("my_creator_verifications");
    expect(anon.data ?? []).toEqual([]);
    for (const table of ["creator_verification_applications", "creator_channel_claims", "creator_verification_unlocks"]) {
      const direct = await (await as("ggul")).from(table).select("*");
      expect([table, direct.data ?? []]).toEqual([table, []]);
    }
  });

  it("INV-V11: 크리에이터가 읽는 칸은 정해진 목록뿐이다", async () => {
    await requestOk("ggul", YT("ggulcols"));
    const [row] = await mine("ggul");
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ["channel_url", "id", "issued_at", "link_handle", "method", "platform", "reason_code", "remaining_count", "status"].sort(),
    );
    expect(row).toMatchObject({ status: "posted", method: "link", platform: "youtube", remaining_count: VERIFICATION_TRIES, link_handle: "cvh_ggul" });
  });

  it("INV-V11 (S11b): 운영자 신청 목록의 칸은 정해진 목록뿐, 휴대폰·이메일 없음", async () => {
    const a = await requestOk("ggul", YT("ggulop"));
    const rows = (await (await as(STAFF)).rpc("admin_creator_verifications")).data as Record<string, unknown>[];
    const row = rows.find((r) => r.id === a.application_id);
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ["channel_title", "channel_url", "creator_name", "id", "issued_at", "link_handle", "login_id", "method", "nickname", "platform", "posted_at", "status", "used_count"].sort(),
    );
    expect(row).toMatchObject({ login_id: CV.ggul.login, nickname: CV.ggul.name, link_handle: a.link_handle, used_count: 0 });
  });

  it("INV-V11 (S11c, 실패경로): 크리에이터·팬이 운영자 목록 함수를 부르면 0줄", async () => {
    await requestOk("ggul", YT("ggulopx"));
    for (const who of [CV.ggul.login, "byeolbit_fan"]) {
      expect((await (await signedInClient(who)).rpc("admin_creator_verifications")).data).toEqual([]);
    }
  });

  it("INV-V11 (S11d): 로그인 확인으로 닫힌 신청을 읽으면 닫힘 사유는 있고 확인한 계정은 없다", async () => {
    const a = await requestOk("ggul", CZU(9));
    expect((await loginConfirm("summer", "chzzk", CZ(9))).error).toBeNull();
    const rows = await mine("ggul");
    const row = rows.find((m) => m.id === a.application_id);
    expect(row).toMatchObject({ status: "closed", reason_code: "owner_confirmed_elsewhere" });
    const text = JSON.stringify(rows);
    expect(text).not.toContain(CV.summer.id);
    expect(text).not.toContain(CV.summer.name);
    expect(text).not.toContain(CV.summer.login);
  });
});

describe("채널 이사 중 선물 등록 막기 (INV-V12)", () => {
  it("INV-V12 (S12·S12d): 채널 Y 로 신청한 하루는 찾기에 X 로 남고, 새 선물 등록은 DB 가 「채널 이사 중」으로 거부, 이미 등록된 주문은 그대로", async () => {
    await verifyVia("haru", YT("harux"));
    const before = await registerTestOrder(1, { creatorId: CV.haru.creatorId });
    await requestOk("haru", YT("haruy"));
    const found = (await anonClient().rpc("list_creators")).data as { id: string; channel: string }[];
    expect(found.find((c) => c.id === CV.haru.creatorId)).toBeTruthy();
    expect(psql(`select channel_url from public.creators where id = '${CV.haru.creatorId}'`)).toBe(YT("harux"));
    const orders = () => psql(`select count(*) from public.orders where creator_id = '${CV.haru.creatorId}'`);
    await expect(registerTestOrder(1, { creatorId: CV.haru.creatorId })).rejects.toThrow(/채널 이사 중/);
    expect(orders()).toBe("1");
    expect(psql(`select count(*) from public.payments p join public.orders o on o.id = p.order_id where o.creator_id = '${CV.haru.creatorId}'`)).toBe("1");
    expect(psql(`select status from public.orders where id = '${before.orderId}'`)).toBe("pending_payment");
    // 팔로우는 그대로 된다
    expect((await (await signedInClient("byeolbit_fan")).rpc("set_follow", { p_creator_id: CV.haru.creatorId, p_following: true })).error).toBeNull();
  });

  it("INV-V12 (S12b): Y 신청이 승인되면 Y 로 바뀌고 X 점유가 풀리고 등록이 받아진다", async () => {
    await verifyVia("haru", YT("harux2"));
    const y = await requestOk("haru", YT("haruy2"));
    expect((await approve(y.application_id)).error).toBeNull();
    expect(psql(`select channel_url from public.creators where id = '${CV.haru.creatorId}'`)).toBe(YT("haruy2"));
    expect(claimOf("youtube", "harux2")).toBe("");
    expect(claimOf("youtube", "haruy2")).toBe(`verified:${CV.haru.id}:${CV.haru.creatorId}`);
    await registerTestOrder(1, { creatorId: CV.haru.creatorId });
    await requestOk("ggul", YT("harux2"));
  });

  it("INV-V12 (S12c): Y 요청이 반려·거둠이면 X 그대로 등록이 다시 받아진다", async () => {
    await verifyVia("haru", YT("harux3"));
    const y1 = await requestOk("haru", YT("haruy3"));
    expect((await reject(y1.application_id)).error).toBeNull();
    await registerTestOrder(1, { creatorId: CV.haru.creatorId });
    const y2 = await requestOk("haru", YT("haruy3"));
    expect((await withdraw("haru", y2.application_id)).error).toBeNull();
    await registerTestOrder(1, { creatorId: CV.haru.creatorId });
    expect(psql(`select channel_url || '|' || identity_verified from public.creators where id = '${CV.haru.creatorId}'`)).toBe(`${YT("harux3")}|true`);
    expect(claimOf("youtube", "harux3")).toBe(`verified:${CV.haru.id}:${CV.haru.creatorId}`);
  });

  it("INV-V12 (실패경로): 크리에이터 → 크리에이터 선물도 이사 중이면 거부", async () => {
    await verifyVia("haru", YT("harux5"));
    // 시드 크리에이터 하루(seed)가 시험 하루를 팔로우해야 크리에이터끼리 보낼 수 있다
    psql(`insert into public.follows (fan_id, creator_id) values ('${SEED.creatorProfileId}', '${CV.haru.creatorId}') on conflict do nothing`);
    await registerTestOrder(1, { senderId: SEED.creatorProfileId, creatorId: CV.haru.creatorId });
    await requestOk("haru", YT("haruy5"));
    await expect(registerTestOrder(1, { senderId: SEED.creatorProfileId, creatorId: CV.haru.creatorId })).rejects.toThrow(/채널 이사 중/);
    psql(`delete from public.follows where fan_id = '${SEED.creatorProfileId}' and creator_id = '${CV.haru.creatorId}'`);
  });

  it("INV-V12 (S12e, 동시): 이사 신청과 선물 등록이 동시에 와도 이사 신청 뒤에 생긴 주문은 없다", async () => {
    await verifyVia("haru", YT("harux6"));
    const held = await holdRowLock(creatorRowLockSql("haru"), 1);
    const [app, order] = await Promise.allSettled([requestOk("haru", YT("haruy6")), registerTestOrder(1, { creatorId: CV.haru.creatorId })]);
    await held.released;
    expect(app.status).toBe("fulfilled");
    const issuedAt = psql(`select issued_at from public.creator_verification_applications where account_id = '${CV.haru.id}' and channel_key = 'haruy6'`);
    const after = psql(
      `select count(*) from public.orders where creator_id = '${CV.haru.creatorId}' and created_at >= '${issuedAt}'::timestamptz`,
    );
    if (order.status === "fulfilled") {
      // 등록이 먼저 끝났다 — 그 주문은 신청보다 먼저 생겼다
      expect(after).toBe("0");
    } else {
      expect(String(order.reason)).toMatch(/채널 이사 중/);
      expect(psql(`select count(*) from public.orders where creator_id = '${CV.haru.creatorId}'`)).toBe("0");
    }
  });
});

describe("채널 이사 중 — 끝나지 않은 신청과 등록 (INV-V12)", () => {
  it("INV-V12 (S12e, 동시): 아직 끝나지 않은 이사 신청이 공개 정보 행을 쥐고 있으면 등록은 기다렸다가 거부된다", async () => {
    await verifyVia("haru", YT("harux7"));
    // 신청 함수가 하는 일을 다른 연결에서 끝내지 않고 쥐고 있는다: 공개 정보 행 잠금 + 살아 있는 신청 한 줄(아직 커밋 전)
    const held = await holdRowLock(
      `${creatorRowLockSql("haru")}; insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status) values ('${CV.haru.id}', 'youtube', 'haruy7', 'https://www.youtube.com/@haruy7', public.cv_new_code(), 'code', 'issued')`,
      1,
    );
    // 거부를 바로 받아 둔다(잠금이 풀리기 전에 끝나면 처리 안 된 거부가 된다)
    const order = registerTestOrder(1, { creatorId: CV.haru.creatorId }).then(
      () => "등록됨",
      (e: unknown) => String(e),
    );
    await held.released;
    expect(await order).toMatch(/채널 이사 중/);
    expect(psql(`select count(*) from public.orders where creator_id = '${CV.haru.creatorId}'`)).toBe("0");
  });
});

describe("확인 방법 칸 (INV-V13)", () => {
  it("INV-V13 (S13): 선물 링크로 승인된 요청의 기록은 「선물 링크」", async () => {
    const a = await verifyVia("ggul", YT("ggulmethod"));
    expect(psql(`select method from public.creator_verification_events where application_id = '${a.application_id}'`)).toBe("link");
    expect(psql(`select method from public.creator_verification_applications where id = '${a.application_id}'`)).toBe("link");
  });

  it("INV-V13 (S13b, 실패경로): 확인 방법 값을 붙여 요청하면 거부, 요청 함수는 언제나 「선물 링크」", async () => {
    const r = await (await as("ggul")).rpc("request_creator_verification", { p_channel_url: YT("ggulm2"), p_method: "login" });
    expect(r.error).not.toBeNull();
    const a = await requestOk("ggul", YT("ggulm2"));
    expect(psql(`select method from public.creator_verification_applications where id = '${a.application_id}'`)).toBe("link");
  });

  it("INV-V13 (실패경로): 결정 기록의 확인 방법 칸은 정해진 값(선물 링크·플랫폼 로그인, 옛 인증 코드·코드 자동 확인)만 받는다", async () => {
    const a = await verifyVia("ggul", YT("ggulm3"));
    const insert = (m: string) =>
      psqlError(
        `insert into public.creator_verification_events (creator_id, acted_by, action, application_id, method) values ('${CV.ggul.creatorId}', '${CV.ggul.id}', 'approve', '${a.application_id}', '${m}')`,
      );
    expect(insert("oauth")).toMatch(/check constraint/);
    // 받는 값 — 직접 넣은 줄은 시험이 끝나면 정리 단계가 지운다
    expect(insert("link")).toBeNull();
    expect(insert("auto_code")).toBeNull();
  });

  it("INV-V13 (실패경로): 요청 줄의 확인 방법 칸은 정해진 값만 받는다", () => {
    const err = psqlError(
      `insert into public.creator_verification_applications (account_id, platform, channel_key, channel_url, code, method, status) values ('${CV.ggul.id}', 'youtube', 'methodx', 'https://www.youtube.com/@methodx', 'FK-ZZZZ-03', 'oauth', 'rejected')`,
    );
    expect(err).toMatch(/check constraint/);
  });
});

describe("플랫폼 로그인 확인 (INV-V14)", () => {
  it("INV-V14 (S14): 로그인 확인이 다른 계정의 올림 신청을 이긴다 — 닫힘, 플랫폼 로그인으로 승인, 점유 이동, 기록 2줄", async () => {
    const fake = await requestOk("summer", CZU(1));
    expect((await loginConfirm("ggul", "chzzk", CZ(1))).error).toBeNull();
    expect(appStatus(fake.application_id)).toBe("closed");
    expect(psql(`select reason_code from public.creator_verification_applications where id = '${fake.application_id}'`)).toBe("owner_confirmed_elsewhere");
    expect(verified("ggul")).toBe("t");
    expect(psql(`select method || '|' || status from public.creator_verification_applications where account_id = '${CV.ggul.id}'`)).toBe("login|approved");
    expect(claimOf("chzzk", CZ(1))).toBe(`verified:${CV.ggul.id}:${CV.ggul.creatorId}`);
    expect(psql(`select string_agg(action || ':' || method, ',' order by id) from public.creator_verification_events where creator_id in ('${CV.ggul.creatorId}', '${CV.summer.creatorId}')`)).toBe(
      "close:link,approve:login",
    );
    expect(psql(`select channel_url from public.creators where id = '${CV.ggul.creatorId}'`)).toBe(CZU(1));
  });

  it("INV-V14 (S14b, 실패경로): 로그인한 사용자 권한으로는 로그인 확인 함수를 부를 수 없다", async () => {
    const fake = await requestOk("ggul", CZU(2));
    const r = await (await as("summer")).rpc("confirm_creator_channel_by_login", { p_account_id: CV.summer.id, p_platform: "chzzk", p_channel_key: CZ(2) });
    expect(r.error).not.toBeNull();
    expect(appStatus(fake.application_id)).toBe("posted");
    expect(verified("summer")).toBe("f");
    expect((await anonClient().rpc("confirm_creator_channel_by_login", { p_account_id: CV.summer.id, p_platform: "chzzk", p_channel_key: CZ(2) })).error).not.toBeNull();
  });

  it("INV-V14 (S14c, 실패경로): 다른 계정으로 이미 확인된 채널은 로그인 확인도 빼앗지 않는다", async () => {
    await verifyVia("haru", CZU(3));
    const r = await loginConfirm("ggul", "chzzk", CZ(3));
    expect(r.error?.code).toBe("FKV05");
    expect(r.error?.message).toContain("1:1 문의로 알려 주세요");
    expect(verified("ggul")).toBe("f");
    expect(claimOf("chzzk", CZ(3))).toBe(`verified:${CV.haru.id}:${CV.haru.creatorId}`);
  });

  it("INV-V14 (S14d, 동시): 운영자 승인과 로그인 확인이 같은 채널에 동시에 와도 하나만 — 확인된 계정은 1명", async () => {
    const fake = await requestOk("summer", CZU(4));
    const held = await holdRowLock(appRowLockSql(fake.application_id), 1);
    const results = await Promise.all([approve(fake.application_id), loginConfirm("ggul", "chzzk", CZ(4))]);
    await held.released;
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    const [ap, lg] = results;
    if (ap?.error === null) {
      expect(verified("summer")).toBe("t");
      expect(verified("ggul")).toBe("f");
      expect(lg?.error?.code).toBe("FKV05");
    } else {
      expect(ap?.error?.code).toBe("55000");
      expect(appStatus(fake.application_id)).toBe("closed");
      expect(verified("ggul")).toBe("t");
    }
    expect(psql(`select count(*) from public.creators where identity_verified and channel_key = '${CZ(4)}'`)).toBe("1");
  });

  it("INV-V14 (S14e): 로그인 확인한 계정의 다른 채널 신청은 거둔다", async () => {
    const y = await requestOk("ggul", YT("ggully"));
    expect((await loginConfirm("ggul", "chzzk", CZ(5))).error).toBeNull();
    expect(appStatus(y.application_id)).toBe("withdrawn");
    expect(claimOf("youtube", "ggully")).toBe("");
    expect(liveCount("ggul")).toBe(0);
    expect(verified("ggul")).toBe("t");
  });

  it("INV-V14 (실패경로): 로그인 확인이 안 되는 플랫폼(SOOP·유튜브·인스타그램 — 2026-11-02 치지직만)·꼴이 아닌 키·크리에이터가 아닌 계정은 거부", async () => {
    expect((await loginConfirm("ggul", "soop", "ggulsoop")).error?.code).toBe("22023");
    expect((await loginConfirm("ggul", "youtube", "ggulyt")).error?.code).toBe("22023");
    expect((await loginConfirm("ggul", "instagram", "ggul_ig")).error?.code).toBe("22023");
    expect((await loginConfirm("ggul", "chzzk", "Bad Key")).error?.code).toBe("22023");
    const fan = await adminClient().rpc("confirm_creator_channel_by_login", { p_account_id: SEED.fanId, p_platform: "chzzk", p_channel_key: CZ(10) });
    expect(fan.error?.code).toBe("42501");
    expect(verified("ggul")).toBe("f");
  });
});

describe("확인 요청 횟수 (INV-V15)", () => {
  /** 꿀단지가 X 로 끝난 요청을 만든다. key 가 https 로 시작하면 그 주소로. */
  async function ended(kind: "rejected" | "withdrawn", key = "cntx"): Promise<string> {
    const a = await requestOk("ggul", key.startsWith("https://") ? key : YT(key));
    if (kind === "rejected") expect((await reject(a.application_id)).error).toBeNull();
    if (kind === "withdrawn") expect((await withdraw("ggul", a.application_id)).error).toBeNull();
    return a.application_id;
  }
  /** 한도(DB 의 cv_verification_tries)만큼 — 반려와 거둠을 번갈아. 마지막 요청 id. */
  async function endedUpTo(count: number, key = "cntx"): Promise<string> {
    let last = "";
    for (let i = 0; i < count; i += 1) last = await ended(i % 2 === 0 ? "rejected" : "withdrawn", key);
    return last;
  }
  const tries = () => Number(psql("select public.cv_verification_tries()"));

  it("INV-V15: 한도는 10번이고 앱 상수와 같다", () => {
    expect(tries()).toBe(10);
    expect(tries()).toBe(VERIFICATION_TRIES);
  });

  it("INV-V15 (S15): 끝난 요청이 한도보다 1건 적으면 요청이 생긴다", async () => {
    await endedUpTo(tries() - 1);
    const a = await requestOk("ggul", YT("cntx"));
    expect((await mine("ggul")).find((m) => m.id === a.application_id)?.remaining_count).toBe(1);
  });

  it("INV-V15 (S15b, 실패경로): 끝난 요청이 한도만큼이면 거부, 「이 채널로는 더 신청할 수 없어요」", async () => {
    await endedUpTo(tries());
    const r = await request("ggul", YT("cntx"));
    expect(r.error?.code).toBe("FKV04");
    expect(r.error?.message).toContain("이 채널로는 더 신청할 수 없어요");
    expect(liveCount("ggul")).toBe(0);
  });

  it("INV-V15 (실패경로): 닫힘도 센다", async () => {
    await endedUpTo(tries() - 1, CZU(6));
    const a = await requestOk("ggul", CZU(6));
    expect((await loginConfirm("summer", "chzzk", CZ(6))).error).toBeNull();
    expect(appStatus(a.application_id)).toBe("closed");
    // summer 의 확인을 취소해 채널을 풀어도 꿀단지는 한도를 다 썼다
    expect((await revoke(CV.summer.creatorId)).error).toBeNull();
    expect((await request("ggul", CZU(6))).error?.code).toBe("FKV04");
  });

  it("INV-V15 (S15d): X 로 한도를 다 써도 다른 채널 Y 는 따로 센다", async () => {
    await endedUpTo(tries());
    expect((await request("ggul", YT("cntx"))).error?.code).toBe("FKV04");
    await requestOk("ggul", YT("cnty"));
  });

  it("INV-V15 (S15e): 라임이 횟수를 풀면 다시 신청할 수 있고 풀기 기록이 남는다", async () => {
    const last = await endedUpTo(tries());
    expect((await request("ggul", YT("cntx"))).error?.code).toBe("FKV04");
    expect((await unlock(last, "본인 문의 확인")).error).toBeNull();
    const a = await requestOk("ggul", YT("cntx"));
    expect((await mine("ggul")).find((m) => m.id === a.application_id)?.remaining_count).toBe(tries());
    expect(
      psql(`select acted_by || '|' || account_id || '|' || platform || '|' || channel_key || '|' || memo || '|' || (at > now() - interval '1 minute') from public.creator_verification_unlocks where account_id = '${CV.ggul.id}'`),
    ).toBe(`00000000-0000-4000-a000-000000000022|${CV.ggul.id}|youtube|cntx|본인 문의 확인|true`);
    expect(psqlError(`update public.creator_verification_unlocks set memo = 'x' where account_id = '${CV.ggul.id}'`)).toMatch(/고치거나 지울 수 없다/);
    expect(psqlError(`delete from public.creator_verification_unlocks where account_id = '${CV.ggul.id}'`)).toMatch(/고치거나 지울 수 없다/);
    // 풀기는 0 으로 영원히 돌리는 것이 아니다 — 풀린 뒤에도 끝난 신청이 한도만큼이면 다시 막힌다
    expect((await reject(a.application_id)).error).toBeNull();
    await endedUpTo(tries() - 1);
    expect((await request("ggul", YT("cntx"))).error?.code).toBe("FKV04");
  });

  it("INV-V15 (S15e, 실패경로): 한 채널을 풀어도 같은 계정의 다른 채널은 그대로 막혀 있다", async () => {
    await endedUpTo(tries(), "cnty");
    const last = await endedUpTo(tries());
    expect((await unlock(last, "본인 문의 확인")).error).toBeNull();
    expect((await request("ggul", YT("cnty"))).error?.code).toBe("FKV04");
    await requestOk("ggul", YT("cntx"));
  });

  it("INV-V14: 같은 채널에 낸 내 요청은 로그인 확인이 이기면 「거둠」으로 끝나고 닫힘 기록이 없다", async () => {
    const a = await requestOk("ggul", CZU(8));
    expect((await loginConfirm("ggul", "chzzk", CZ(8))).error).toBeNull();
    expect(appStatus(a.application_id)).toBe("withdrawn");
    expect(verified("ggul")).toBe("t");
    expect(psql(`select count(*) from public.creator_verification_events where application_id = '${a.application_id}' and action = 'close'`)).toBe("0");
  });

  it("INV-V15 (S15f, 실패경로): 크리에이터·팬은 횟수를 풀 수 없고 기록 0줄", async () => {
    const last = await ended("rejected");
    for (const who of [CV.ggul.login, "byeolbit_fan"]) {
      expect((await unlock(last, "", who)).error?.code).toBe("42501");
    }
    expect(psql(`select count(*) from public.creator_verification_unlocks where account_id = '${CV.ggul.id}'`)).toBe("0");
  });

  it("INV-V15 (S15g): 승인됐다 취소된 신청은 세지 않는다", async () => {
    await verifyVia("ggul", YT("cntx"));
    expect((await revoke(CV.ggul.creatorId)).error).toBeNull();
    await ended("rejected");
    await ended("rejected");
    await requestOk("ggul", YT("cntx"));
  });

  it("INV-V15 (S15h): 한도를 다 써도 로그인 확인은 된다", async () => {
    await endedUpTo(tries(), CZU(7));
    expect((await request("ggul", CZU(7))).error?.code).toBe("FKV04");
    expect((await loginConfirm("ggul", "chzzk", CZ(7))).error).toBeNull();
    expect(verified("ggul")).toBe("t");
  });

  it("INV-V15: 운영자 목록의 횟수는 그 계정이 그 채널로 쓴 수", async () => {
    await ended("rejected");
    await ended("withdrawn");
    const a = await requestOk("ggul", YT("cntx"));
    const rows = (await (await as(STAFF)).rpc("admin_creator_verifications")).data as { id: string; used_count: number }[];
    expect(rows.find((r) => r.id === a.application_id)?.used_count).toBe(2);
  });
});
