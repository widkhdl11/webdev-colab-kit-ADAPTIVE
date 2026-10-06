import { describe, expect, it } from "vitest";
import {
  adminVerificationsFromRows,
  adminVerificationTables,
  eventReasonLabel,
  lastOutcomeText,
  myVerificationPanel,
  myVerificationsFromRows,
  reasonLabel,
  REVOKE_REASONS,
  VERIFICATION_METHOD_LABEL,
  verifyRoutes,
  type AdminVerification,
  type MyVerification,
} from "./creator-verification";

const mine = (over: Partial<MyVerification>): MyVerification => ({
  id: "a1",
  platform: "youtube",
  channelUrl: "https://www.youtube.com/@ggul",
  code: "FK-7H3Q-92",
  method: "code",
  status: "issued",
  issuedAt: "2026-10-06T00:00:00Z",
  postDeadline: "2026-10-13T00:00:00Z",
  reasonCode: null,
  remainingCount: 3,
  ...over,
});

const adm = (over: Partial<AdminVerification>): AdminVerification => ({
  id: "x",
  nickname: "꿀단지",
  loginId: "ggul",
  creatorName: "꿀단지",
  channelTitle: "꿀단지TV",
  platform: "youtube",
  channelUrl: "https://www.youtube.com/@ggul",
  code: "FK-AAAA-11",
  method: "code",
  status: "rejected",
  issuedAt: "2026-10-01T00:00:00Z",
  postedAt: null,
  usedCount: 1,
  ...over,
});

describe("사유 문구 (creator-verification INV-V9·V14)", () => {
  it("INV-V9: 상태가 사유의 종류를 정한다 — 반려됨은 반려 사유, 승인됨+사유는 취소 사유, 닫힘은 닫힘 사유", () => {
    expect(reasonLabel("rejected", "code_not_found")).toBe("코드를 찾지 못함");
    expect(reasonLabel("approved", "code_removed")).toBe("채널에서 코드가 사라짐");
    expect(reasonLabel("closed", "owner_confirmed_elsewhere")).toBe("다른 계정이 채널 주인 확인을 마쳤어요");
    expect(eventReasonLabel("revoke", "not_owner_confirmed")).toBe("채널 주인이 아니라는 문의가 확인됨");
    expect(eventReasonLabel("reject", "profile_mismatch")).toBe("채널과 가입 정보가 맞지 않음");
  });

  it("INV-V9 (실패경로): 종류가 다른 사유·모르는 값·사유 없음은 null — 지어낸 문구를 쓰지 않는다", () => {
    expect(reasonLabel("rejected", "code_removed")).toBeNull();
    expect(reasonLabel("approved", "code_not_found")).toBeNull();
    expect(reasonLabel("closed", "other")).toBeNull();
    expect(reasonLabel("rejected", null)).toBeNull();
    expect(eventReasonLabel("approve", "other")).toBeNull();
  });
});

describe("취소 사유 목록 (INV-V9, 2026-10-06)", () => {
  it("INV-V9: 취소 사유는 넷 — 「채널이 없어졌거나 다른 사람에게 넘어감」이 들어가고 「채널에서 코드가 사라짐」은 빠졌다", () => {
    expect([...REVOKE_REASONS]).toEqual(["channel_gone", "not_owner_confirmed", "policy_violation", "other"]);
    expect(reasonLabel("approved", "channel_gone")).toBe("채널이 없어졌거나 다른 사람에게 넘어감");
    expect(eventReasonLabel("revoke", "channel_gone")).toBe("채널이 없어졌거나 다른 사람에게 넘어감");
  });
});

describe("확인 방법 (INV-V13)", () => {
  it("INV-V13: 확인 방법은 셋 — 인증 코드·코드 자동 확인·플랫폼 로그인", () => {
    expect(VERIFICATION_METHOD_LABEL).toEqual({ code: "인증 코드", auto_code: "코드 자동 확인", login: "플랫폼 로그인" });
    const row = { id: "a1", platform: "youtube", channel_url: "u", code: "FK-7H3Q-92", method: "auto_code", status: "approved", issued_at: "t", post_deadline: "t2", reason_code: null, remaining_count: 3 };
    expect(myVerificationsFromRows([row])?.[0]?.method).toBe("auto_code");
    expect(myVerificationsFromRows([{ ...row, method: "oauth" }])).toBeNull();
  });
});

describe("확인 길 고르기 (INV-V2 「API 확인」·V14·V16)", () => {
  const API = new Set(["youtube", "chzzk", "instagram"]);

  it("INV-V14·V16: API 가 있는 플랫폼은 플랫폼 로그인이 먼저, 그다음 코드 자동 확인, 그래도 안 되면 운영자 확인", () => {
    expect(verifyRoutes("youtube", API)).toEqual(["login", "auto_code", "operator"]);
    expect(verifyRoutes("instagram", API)).toEqual(["login", "auto_code", "operator"]);
  });

  it("INV-V16 (실패경로): API 가 없는 플랫폼(SOOP)·모르는 플랫폼은 운영자 확인뿐", () => {
    expect(verifyRoutes("soop", API)).toEqual(["operator"]);
    expect(verifyRoutes("tiktok", API)).toEqual(["operator"]);
    expect(verifyRoutes("youtube", new Set())).toEqual(["operator"]);
  });

  it("INV-V16: 코드 받음 신청이면 API 있는 플랫폼에서만 「확인」(자동 확인)을 연다, 확인 대기면 닫는다", () => {
    expect(myVerificationPanel({ verified: false }, [mine({ status: "issued" })], API).canAutoCheck).toBe(true);
    expect(myVerificationPanel({ verified: false }, [mine({ status: "issued", platform: "soop" })], API).canAutoCheck).toBe(false);
    expect(myVerificationPanel({ verified: false }, [mine({ status: "posted" })], API).canAutoCheck).toBe(false);
    expect(myVerificationPanel({ verified: false }, [], API).canAutoCheck).toBe(false);
  });
});

describe("크리에이터 신청 읽기 (INV-V11)", () => {
  it("INV-V11: 정해진 칸만 받는다 — 메모·상대 계정 같은 칸이 끼어 있으면 null", () => {
    const row = {
      id: "a1",
      platform: "youtube",
      channel_url: "u",
      code: "FK-7H3Q-92",
      method: "code",
      status: "posted",
      issued_at: "t",
      post_deadline: "t2",
      reason_code: null,
      remaining_count: 2,
    };
    expect(myVerificationsFromRows([row])?.[0]).toMatchObject({ status: "posted", remainingCount: 2 });
    expect(myVerificationsFromRows([{ ...row, memo: "운영자 메모" }])).toBeNull();
    expect(myVerificationsFromRows([{ ...row, status: "unknown" }])).toBeNull();
  });
});

describe("크리에이터 확인 칸의 판단 (INV-V4·V5·V15)", () => {
  it("INV-V4: 살아 있는 신청이 있으면 새 신청은 닫고, 코드 받음이면 올렸어요·다시 받기·거두기를 연다", () => {
    const p = myVerificationPanel({ verified: false }, [mine({ status: "issued", remainingCount: 3 })]);
    expect(p).toMatchObject({ mode: "verify", canRequest: false, canMarkPosted: true, canRegenerate: true, canWithdraw: true, last: null });
  });

  it("INV-V5: 확인 대기면 올렸어요·다시 받기는 닫고 거두기만", () => {
    const p = myVerificationPanel({ verified: false }, [mine({ status: "posted" })]);
    expect(p).toMatchObject({ canMarkPosted: false, canRegenerate: false, canWithdraw: true });
  });

  it("INV-V15 (실패경로): 남은 횟수가 1이면 다시 받기를 닫는다(버리면 새 신청을 만들 수 없다), 2면 연다", () => {
    expect(myVerificationPanel({ verified: false }, [mine({ remainingCount: 1 })]).canRegenerate).toBe(false);
    expect(myVerificationPanel({ verified: false }, [mine({ remainingCount: 2 })]).canRegenerate).toBe(true);
  });

  it("INV-V12: 확인된 크리에이터면 채널 이사 신청, 살아 있는 신청이 없으면 마지막 신청의 결과를 알린다", () => {
    const rows = [mine({ id: "new", status: "rejected", reasonCode: "code_not_found" }), mine({ id: "old", status: "approved" })];
    const p = myVerificationPanel({ verified: true }, rows);
    expect(p).toMatchObject({ mode: "move", live: null, canRequest: true, canWithdraw: false });
    expect(p.last?.id).toBe("new");
    expect(lastOutcomeText(p.last!)).toBe("반려됐어요 — 코드를 찾지 못함");
  });

  it("INV-V9·V10: 승인 취소·닫힘·기간 지남의 알림 문구, 취소 안 된 승인은 알릴 것이 없다", () => {
    expect(lastOutcomeText(mine({ status: "approved", reasonCode: "policy_violation" }))).toBe("승인이 취소됐어요 — 이용 규칙 위반");
    expect(lastOutcomeText(mine({ status: "approved" }))).toBeNull();
    expect(lastOutcomeText(mine({ status: "closed", reasonCode: "owner_confirmed_elsewhere" }))).toContain("다른 계정이 채널 주인 확인을 마쳤어요");
    expect(lastOutcomeText(mine({ status: "expired" }))).toBe("7일 안에 확인을 마치지 않아 기간이 지났어요");
  });
});

describe("운영자 신청 표 (INV-V6·V11·V15)", () => {
  it("INV-V11: 정해진 칸만 받는다 — 휴대폰·이메일 칸이 끼어 있으면 null", () => {
    const row = {
      id: "x",
      nickname: "n",
      login_id: "l",
      creator_name: null,
      channel_title: null,
      platform: "soop",
      channel_url: "u",
      code: null,
      method: "login",
      status: "approved",
      issued_at: "t",
      posted_at: null,
      used_count: 0,
    };
    expect(adminVerificationsFromRows([row])?.[0]).toMatchObject({ method: "login", usedCount: 0 });
    expect(adminVerificationsFromRows([{ ...row, phone: "01000000000" }])).toBeNull();
  });

  it("INV-V6: 확인 대기는 올린 순서대로, 코드 받음은 따로(승인 버튼이 없는 표), 나머지는 끝난 신청", () => {
    const t = adminVerificationTables([
      adm({ id: "p2", status: "posted", postedAt: "2026-10-05T10:00:00Z" }),
      adm({ id: "p1", status: "posted", postedAt: "2026-10-04T10:00:00Z", loginId: "b" }),
      adm({ id: "i1", status: "issued", loginId: "c" }),
      adm({ id: "e1", status: "expired", loginId: "d" }),
    ]);
    expect(t.posted.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(t.issued.map((r) => r.id)).toEqual(["i1"]);
    expect(t.ended.map((r) => r.id)).toEqual(["e1"]);
  });

  it("INV-V15: 횟수 풀기는 계정·채널마다 가장 최근의 끝난 코드 신청 한 줄에만, 쓴 횟수가 있을 때만", () => {
    const t = adminVerificationTables([
      adm({ id: "new", usedCount: 3 }),
      adm({ id: "old", usedCount: 3 }),
      adm({ id: "other-channel", channelUrl: "https://www.youtube.com/@other", usedCount: 0 }),
      adm({ id: "login", method: "login", status: "approved", loginId: "z", code: null, usedCount: 2 }),
    ]);
    expect(t.ended.filter((r) => r.unlockable).map((r) => r.id)).toEqual(["new"]);
  });

  it("INV-V15·V16: 자동 확인으로 승인된 줄도 코드 신청이다 — 그 쌍의 가장 최근 줄로 친다", () => {
    const t = adminVerificationTables([adm({ id: "auto", method: "auto_code", status: "approved", usedCount: 2 }), adm({ id: "older", usedCount: 2 })]);
    expect(t.ended.filter((r) => r.unlockable).map((r) => r.id)).toEqual(["auto"]);
  });

  it("INV-V15 (실패경로): 같은 계정·채널에 살아 있는 신청이 있으면 끝난 줄에 풀기 버튼을 두지 않는다", () => {
    const t = adminVerificationTables([adm({ id: "live", status: "issued", usedCount: 2 }), adm({ id: "ended", usedCount: 2 })]);
    expect(t.ended.find((r) => r.id === "ended")?.unlockable).toBe(false);
  });
});
