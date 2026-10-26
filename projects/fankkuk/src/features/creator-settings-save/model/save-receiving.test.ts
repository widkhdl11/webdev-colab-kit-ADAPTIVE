import { describe, expect, it } from "vitest";
import { saveCreatorDays, saveCreatorReceiving } from "./save-creator-settings";

// 크리에이터 받는 양 조절 저장 — 앱 서버 경계 (creator-receiving INV-B1·B3·B5·B7). DB 판정은 통합 시험(creator-receiving-db)이 본다.

const HARU = { userId: "creator-haru", role: "creator" } as const;

function fakeClient(error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: null, error };
      },
    } as never,
  };
}

describe("INV-B1: 정해진 칸만 넘기고 크리에이터 ID 는 넘기지 않는다", () => {
  it("INV-B1: 받는 상태 — 본문의 크리에이터 ID 는 버리고 세 칸만", async () => {
    const f = fakeClient();
    const r = await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: true, resumeOn: "2026-10-20", monthlyLimit: 3, creatorId: "momo" });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "update_my_creator_receiving", args: { p_resting: true, p_resume_on: "2026-10-20", p_monthly_limit: 3 } }]);
  });

  it("INV-B3 S3b: 받는 중으로 바꾸면 날짜를 실어 보내도 null 로 넘긴다", async () => {
    const f = fakeClient();
    await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: false, resumeOn: "2026-10-20", monthlyLimit: null });
    expect(f.calls[0]?.args).toEqual({ p_resting: false, p_resume_on: null, p_monthly_limit: null });
  });

  it("INV-B1 S1b (실패경로): 팬·로그인 안 함은 DB 를 부르지 않고 403·401", async () => {
    const f = fakeClient();
    expect(await saveCreatorReceiving({ client: f.client, viewer: { userId: "fan", role: "fan" } }, { resting: false, resumeOn: null, monthlyLimit: null })).toMatchObject({ ok: false, status: 403 });
    expect(await saveCreatorDays({ client: f.client, viewer: null }, { birthday: null, anniversaries: [] })).toMatchObject({ ok: false, status: 401 });
    expect(f.calls).toEqual([]);
  });
});

describe("INV-B3·B5: 받는 상태 입력 경계", () => {
  it("INV-B3 S3 (실패경로): 쉬는 중인데 날짜가 없으면 400, DB 를 부르지 않는다", async () => {
    const f = fakeClient();
    expect(await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: true, resumeOn: null, monthlyLimit: null })).toMatchObject({ ok: false, status: 400 });
    expect(f.calls).toEqual([]);
  });

  it("INV-B5 S5 (실패경로): 한도 0·11 은 400, DB 를 부르지 않는다", async () => {
    for (const n of [0, 11, 2.5]) {
      const f = fakeClient();
      expect(await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: false, resumeOn: null, monthlyLimit: n })).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-B3 (실패경로): 달력에 없는 날(2026-02-30·2026-13-01·2026-04-31)은 400, DB 를 부르지 않는다", async () => {
    for (const d of ["2026-02-30", "2026-13-01", "2026-04-31", "2026-00-10"]) {
      const f = fakeClient();
      expect([d, await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: true, resumeOn: d, monthlyLimit: null })]).toMatchObject([d, { ok: false, status: 400 }]);
      expect([d, f.calls]).toEqual([d, []]);
    }
  });

  it("INV-B3: 윤년 2월 29일(2028-02-29)은 꼴 검사를 통과해 DB 로 간다", async () => {
    const f = fakeClient();
    expect(await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: true, resumeOn: "2028-02-29", monthlyLimit: null })).toEqual({ ok: true });
    expect(f.calls).toHaveLength(1);
  });

  it("INV-B3: DB 가 날짜 범위로 거부(22023)하면 400 과 범위 안내", async () => {
    const f = fakeClient({ code: "22023" });
    const r = await saveCreatorReceiving({ client: f.client, viewer: HARU }, { resting: true, resumeOn: "2020-01-01", monthlyLimit: null });
    expect(r).toEqual({ ok: false, status: 400, message: "다시 받는 날은 내일부터 1년 안으로, 한도는 1~10개로 선택해 주세요." });
  });
});

describe("INV-B7: 생일·기념일 입력 경계", () => {
  it("INV-B7: 생일 월·일과 기념일(이름 앞뒤 공백 뺌)을 넘긴다 — 연도 칸은 없다", async () => {
    const f = fakeClient();
    const r = await saveCreatorDays(
      { client: f.client, viewer: HARU },
      { birthday: { month: 3, day: 10, year: 1999 }, anniversaries: [{ name: " 데뷔일 ", month: 10, day: 15 }] },
    );
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "update_my_creator_days", args: { p_birthday_month: 3, p_birthday_day: 10, p_anniversaries: [{ name: "데뷔일", month: 10, day: 15 }] } },
    ]);
  });

  it("INV-B7 S7 (실패경로): 기념일 4개·이름 13자는 400, DB 를 부르지 않는다", async () => {
    const four = [1, 2, 3, 4].map((i) => ({ name: `기념${i}`, month: i, day: 1 }));
    for (const anniversaries of [four, [{ name: "가".repeat(13), month: 1, day: 1 }]]) {
      const f = fakeClient();
      expect(await saveCreatorDays({ client: f.client, viewer: HARU }, { birthday: null, anniversaries })).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-B7 S7 (실패경로): DB 필터 거부는 사유별 문구로 — 연락처 꼴(P0082)", async () => {
    const f = fakeClient({ code: "P0082" });
    const r = await saveCreatorDays({ client: f.client, viewer: HARU }, { birthday: null, anniversaries: [{ name: "01012345678", month: 1, day: 1 }] });
    expect(r).toEqual({ ok: false, status: 400, message: "기념일 이름에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다." });
  });
});
