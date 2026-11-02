import { describe, expect, it } from "vitest";
import {
  adminRechecksFromRows,
  adminRecheckTables,
  adminVerificationsFromRows,
  adminVerificationTables,
  attemptNumber,
  canLoginCheck,
  lastOutcomeText,
  myVerificationPanel,
  myVerificationsFromRows,
  myVerificationStateFromRows,
  panelOutcomeText,
  reasonLabel,
  REJECT_REASON_LABEL,
  REJECT_REASONS,
  REVOKE_REASONS,
  VERIFICATION_METHODS,
  type AdminVerification,
  type MyVerification,
} from "./creator-verification";

// 크리에이터 채널 확인 — 모양과 화면 판단 (creator-verification INV-V9·V10·V11·V13·V15·V17·V19·V20).

const mine = (over: Partial<MyVerification>): MyVerification => ({
  id: "a1",
  platform: "soop",
  channelUrl: "https://www.sooplive.com/station/haru",
  linkHandle: "haru",
  method: "link",
  status: "posted",
  issuedAt: "2026-11-02T00:00:00Z",
  reasonCode: null,
  remainingCount: 3,
  ...over,
});

const adm = (over: Partial<AdminVerification>): AdminVerification => ({
  id: "a1",
  nickname: "하루",
  loginId: "haru01",
  creatorName: "하루",
  channelTitle: "하루TV",
  platform: "soop",
  channelUrl: "https://www.sooplive.com/station/haru",
  linkHandle: "haru",
  method: "link",
  status: "posted",
  issuedAt: "2026-11-02T00:00:00Z",
  postedAt: "2026-11-02T00:00:00Z",
  usedCount: 0,
  ...over,
});

const stateRow = {
  creator_id: "c1",
  name: "하루",
  channel_title: "하루TV",
  verified: false,
  platform: null,
  channel_url: null,
  verified_at: null,
  operator_only: false,
  handle: "haru",
  next_recheck_at: null,
  grace_until: null,
  recheck_requested_at: null,
};

describe("사유 목록 (INV-V9·V19·V20)", () => {
  it("INV-V19: 반려 사유는 다섯 — 팬꾹 링크를 찾지 못함·링크 주소가 다름·채널 이름이 다름·채널 주소가 열리지 않음·그 밖", () => {
    expect([...REJECT_REASONS]).toEqual(["link_not_found", "link_mismatch", "name_mismatch", "channel_unreachable", "other"]);
    expect(REJECT_REASONS.map((r) => REJECT_REASON_LABEL[r])).toEqual(["팬꾹 링크를 찾지 못함", "링크 주소가 다름", "채널 이름이 다름", "채널 주소가 열리지 않음", "그 밖"]);
  });

  it("INV-V20: 승인 취소 사유에 「팬꾹 링크가 채널에서 내려감」이 있다", () => {
    expect(REVOKE_REASONS).toContain("link_removed");
    expect(reasonLabel("approved", "link_removed")).toBe("팬꾹 링크가 채널에서 내려감");
  });

  it("INV-V9: 상태가 사유의 종류를 정한다 — 옛 사유 값은 기록에 남은 줄을 읽을 때만", () => {
    expect(reasonLabel("rejected", "name_mismatch")).toBe("채널 이름이 다름");
    expect(reasonLabel("rejected", "code_not_found")).toBe("코드를 찾지 못함");
    expect(reasonLabel("closed", "method_changed")).toContain("확인 방식이 바뀌었습니다");
    expect(reasonLabel("approved", "code_removed")).toBe("채널에서 코드가 사라짐");
  });

  it("INV-V9 (실패경로): 종류가 다른 사유·모르는 값·사유 없음은 null — 지어낸 문구를 쓰지 않는다", () => {
    expect(reasonLabel("rejected", "link_removed")).toBeNull();
    expect(reasonLabel("approved", "name_mismatch")).toBeNull();
    expect(reasonLabel("closed", "x")).toBeNull();
    expect(reasonLabel("posted", "other")).toBeNull();
    expect(reasonLabel("rejected", null)).toBeNull();
  });
});

describe("확인 방법 (INV-V13)", () => {
  it("INV-V13: 새 값은 팬꾹 링크·플랫폼 로그인, 옛 값(인증 코드·코드 자동 확인)은 읽기만", () => {
    expect([...VERIFICATION_METHODS]).toEqual(["link", "login", "code", "auto_code"]);
  });
});

describe("크리에이터 요청 읽기 (INV-V11·V17)", () => {
  const row = {
    id: "a1",
    platform: "soop",
    channel_url: "https://www.sooplive.com/station/haru",
    link_handle: "haru",
    method: "link",
    status: "posted",
    issued_at: "2026-11-02T00:00:00Z",
    reason_code: null,
    remaining_count: 3,
  };

  it("INV-V17: 요청 줄의 링크용 아이디를 그대로 옮긴다", () => {
    expect(myVerificationsFromRows([row])?.[0]?.linkHandle).toBe("haru");
  });

  it("INV-V11 (실패경로): 정해진 칸만 받는다 — 메모·코드 같은 칸이 끼어 있으면 null", () => {
    expect(myVerificationsFromRows([{ ...row, memo: "x" }])).toBeNull();
    expect(myVerificationsFromRows([{ ...row, code: "FK-AAAA-11" }])).toBeNull();
  });

  it("INV-V20: 확인 상태는 지금 아이디·다음 재확인·유예 끝을 옮긴다, 칸이 빠지면 모양이 다르다(undefined)", () => {
    const s = myVerificationStateFromRows([{ ...stateRow, verified: true, next_recheck_at: "2027-01-31T00:00:00Z", grace_until: "2026-11-16T00:00:00Z" }]);
    expect(s).toMatchObject({ handle: "haru", nextRecheckAt: "2027-01-31T00:00:00Z", graceUntil: "2026-11-16T00:00:00Z" });
    const { grace_until: _omit, ...missing } = stateRow;
    expect(myVerificationStateFromRows([missing])).toBeUndefined();
  });
});

describe("확인 칸의 단계 (UX signup.md 2026-11-02, INV-V15·V17·V20)", () => {
  const st = (over: Partial<{ verified: boolean; handle: string | null; graceUntil: string | null }> = {}) => ({
    verified: false,
    handle: "haru" as string | null,
    graceUntil: null as string | null,
    ...over,
  });

  it("INV-V17 (실패경로): 링크용 아이디가 없으면 link_needed — 요청 칸을 열지 않는다", () => {
    expect(myVerificationPanel(st({ handle: null }), []).stage).toBe("link_needed");
  });

  it("INV-V17: 아이디가 있고 요청이 없으면 idle, 확인 대기 요청이 있으면 waiting(코드 받음 단계 없음)", () => {
    expect(myVerificationPanel(st(), []).stage).toBe("idle");
    const p = myVerificationPanel(st(), [mine({ status: "posted" })]);
    expect(p.stage).toBe("waiting");
    expect(p.live?.id).toBe("a1");
  });

  it("INV-V19: 마지막 요청이 반려면 rejected, 남은 횟수가 0이면 locked(INV-V15)", () => {
    expect(myVerificationPanel(st(), [mine({ status: "rejected", reasonCode: "name_mismatch", remainingCount: 2 })]).stage).toBe("rejected");
    expect(myVerificationPanel(st(), [mine({ status: "rejected", reasonCode: "name_mismatch", remainingCount: 0 })]).stage).toBe("locked");
  });

  it("INV-V20: 확인됐으면 verified, 유예 중이면 recheck_missing, 이사 요청이 있으면 waiting(이사)", () => {
    expect(myVerificationPanel(st({ verified: true }), [mine({ status: "approved" })]).stage).toBe("verified");
    expect(myVerificationPanel(st({ verified: true, graceUntil: "2026-11-16T00:00:00Z" }), [mine({ status: "approved" })]).stage).toBe("recheck_missing");
    const move = myVerificationPanel(st({ verified: true }), [mine({ status: "posted" })]);
    expect([move.stage, move.mode]).toEqual(["waiting", "move"]);
  });

  it("INV-V9·V10: 승인 취소·닫힘·거둠의 알림 문구, 취소 안 된 승인은 알릴 것이 없다", () => {
    expect(lastOutcomeText(mine({ status: "approved", reasonCode: "link_removed" }))).toBe("승인이 취소되었습니다 — 팬꾹 링크가 채널에서 내려감");
    expect(lastOutcomeText(mine({ status: "rejected", reasonCode: "link_mismatch" }))).toBe("승인이 반려되었습니다 — 링크 주소가 다름");
    expect(lastOutcomeText(mine({ status: "closed", reasonCode: "method_changed", method: "code" }))).toContain("확인 방식이 바뀌었습니다");
    expect(lastOutcomeText(mine({ status: "approved" }))).toBeNull();
  });

  it("INV-V10 (S10d): 운영자 확인만이고 확인 전이면 위반 취소를 먼저 알린다", () => {
    expect(panelOutcomeText({ verified: false, operatorOnly: true }, mine({ status: "withdrawn" }))).toContain("이용 규칙 위반");
    expect(panelOutcomeText({ verified: false, operatorOnly: false }, mine({ status: "withdrawn" }))).toBe("요청을 취소했습니다");
  });

  it("INV-V14: 로그인 확인 버튼은 로그인 확인 플랫폼이고 운영자 확인만이 아닐 때만", () => {
    const login = new Set(["chzzk"]);
    expect(canLoginCheck("chzzk", login, { operatorOnly: false })).toBe(true);
    expect(canLoginCheck("youtube", login, { operatorOnly: false })).toBe(false);
    expect(canLoginCheck("chzzk", login, { operatorOnly: true })).toBe(false);
  });
});

describe("운영자 요청 표 (INV-V6·V11·V15·V18)", () => {
  const row = {
    id: "a1",
    nickname: "하루",
    login_id: "haru01",
    creator_name: "하루",
    channel_title: "하루TV",
    platform: "soop",
    channel_url: "https://www.sooplive.com/station/haru",
    link_handle: "haru",
    method: "link",
    status: "posted",
    issued_at: "2026-11-02T00:00:00Z",
    posted_at: "2026-11-02T00:00:00Z",
    used_count: 0,
  };

  it("INV-V18: 운영자 줄은 찾을 링크의 아이디와 가입 때 적은 채널 이름을 옮긴다", () => {
    expect(adminVerificationsFromRows([row])?.[0]).toMatchObject({ linkHandle: "haru", channelTitle: "하루TV" });
  });

  it("INV-V11 (실패경로): 정해진 칸만 받는다 — 휴대폰·이메일 칸이 끼어 있으면 null", () => {
    expect(adminVerificationsFromRows([{ ...row, phone: "010" }])).toBeNull();
    expect(adminVerificationsFromRows([{ ...row, email: "a@b.c" }])).toBeNull();
  });

  it("INV-V6: 확인 대기는 요청 순서대로, 나머지는 끝난 요청", () => {
    const t = adminVerificationTables([
      adm({ id: "late", postedAt: "2026-11-02T02:00:00Z" }),
      adm({ id: "early", loginId: "b", channelUrl: "u2", postedAt: "2026-11-02T01:00:00Z" }),
      adm({ id: "done", loginId: "c", status: "rejected", usedCount: 1 }),
    ]);
    expect(t.posted.map((r) => r.id)).toEqual(["early", "late"]);
    expect(t.ended.map((r) => [r.id, r.unlockable])).toEqual([["done", true]]);
  });

  it("INV-V15 (실패경로): 같은 계정·채널에 살아 있는 요청이 있으면 끝난 줄에 풀기 버튼을 두지 않는다, 로그인 줄은 풀기 대상이 아니다", () => {
    const t = adminVerificationTables([adm({ id: "live" }), adm({ id: "old", status: "rejected", usedCount: 1 }), adm({ id: "login", loginId: "z", method: "login", status: "approved", usedCount: 1 })]);
    expect(t.ended.map((r) => [r.id, r.unlockable])).toEqual([
      ["old", false],
      ["login", false],
    ]);
  });

  it("INV-V15: 진행 중인 요청이 몇 번째인지 — 상한을 넘지 않는다", () => {
    expect(attemptNumber(3)).toBe(1);
    expect(attemptNumber(1)).toBe(3);
    expect(attemptNumber(0)).toBe(3);
  });
});

describe("운영자 재확인 목록 (INV-V20)", () => {
  const row = {
    creator_id: "c1",
    nickname: "하루",
    login_id: "haru01",
    creator_name: "하루",
    channel_title: "하루TV",
    platform: "soop",
    channel_url: "https://www.sooplive.com/station/haru",
    handle: "haru2",
    recheck_reason: "handle",
    link_checked_at: "2026-10-01T00:00:00Z",
    link_missing_at: null,
    grace_until: null,
    recheck_requested_at: null,
  };

  it("INV-V20: 재확인 대기와 유예 중을 나눈다 — 찾을 링크는 지금 아이디", () => {
    const rows = adminRechecksFromRows([row, { ...row, creator_id: "c2", recheck_reason: "days", link_missing_at: "2026-11-01T00:00:00Z", grace_until: "2026-11-15T00:00:00Z" }]);
    expect(rows).not.toBeNull();
    const t = adminRecheckTables(rows ?? []);
    expect(t.recheck.map((r) => [r.creatorId, r.handle, r.reason])).toEqual([["c1", "haru2", "handle"]]);
    expect(t.grace.map((r) => [r.creatorId, r.graceUntil])).toEqual([["c2", "2026-11-15T00:00:00Z"]]);
  });

  it("INV-V20 (실패경로): 모르는 이유 값·연락처 칸이 끼면 null", () => {
    expect(adminRechecksFromRows([{ ...row, recheck_reason: "other" }])).toBeNull();
    expect(adminRechecksFromRows([{ ...row, phone: "010" }])).toBeNull();
  });
});
