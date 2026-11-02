import { z } from "zod";
import { CHANNEL_PLATFORM_LABEL, isChannelPlatform } from "./channel-url";

// 크리에이터 채널 확인 요청의 모양과 화면 판단 (creator-verification INV-V4·V9·V11·V13·V15·V17·V19·V20).
// 2026-11-02 확인 방법을 「팬꾹 링크 게시 확인」으로 바꿨다 — 요청은 바로 확인 대기, 인증 코드·코드 자동 확인은 없다.
// DB 읽기 함수(my_creator_verifications · admin_creator_verifications · admin_creator_rechecks)가 돌려준 줄을 이 모양으로 바꾼다.
// 꼴이 다른 줄이 하나라도 있으면 null — 요청이 몰래 빠지지 않게.
// 화면이 정하는 것은 「무엇을 보여 주고 어느 버튼을 열어 둘지」뿐이다. 거부·허용은 DB 함수가 다시 판정한다.

/** issued(코드 받음)는 옛 코드 신청에만 있다 — 새 요청은 만들어질 때 바로 posted(확인 대기)다(INV-V17). */
export const VERIFICATION_STATUSES = ["issued", "posted", "approved", "rejected", "withdrawn", "closed", "expired"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  issued: "코드 발급 완료",
  posted: "확인 대기",
  approved: "승인 완료",
  rejected: "승인 반려",
  withdrawn: "요청 취소",
  closed: "요청 종료",
  expired: "기한 만료",
};

/** INV-V13: 새 요청은 「팬꾹 링크」·「플랫폼 로그인」. 옛 값(인증 코드·코드 자동 확인)은 기록에 남은 것만 읽는다. */
export const VERIFICATION_METHODS = ["link", "login", "code", "auto_code"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];
export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = {
  link: "팬꾹 링크",
  login: "플랫폼 로그인",
  code: "인증 코드",
  auto_code: "코드 자동 확인",
};

/** 운영자 확인을 거치는 요청인가 — 팬꾹 링크와 옛 인증 코드. INV-V15 횟수도 이것으로 센다. */
export function isOperatorCheckedApplication(method: VerificationMethod): boolean {
  return method !== "login";
}

/** INV-V19: 반려 사유 목록 — DB 의 admin_reject_creator_verification 이 받는 값과 같다. */
export const REJECT_REASONS = ["link_not_found", "link_mismatch", "name_mismatch", "channel_unreachable", "other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
/** INV-V9·V20: 승인 취소 사유 목록 — DB 의 admin_revoke_creator 가 받는 값과 같다. link_removed 는 유예 끝 취소도 쓴다. */
export const REVOKE_REASONS = ["channel_gone", "not_owner_confirmed", "policy_violation", "link_removed", "other"] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];
/** INV-V14: 닫힘 사유 — 서버가 정한다. method_changed 는 2026-11-02 확인 방식을 바꾸며 닫은 옛 코드 신청. */
export const CLOSE_REASON = "owner_confirmed_elsewhere";

export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  link_not_found: "팬꾹 링크를 찾지 못함",
  link_mismatch: "링크 주소가 다름",
  name_mismatch: "채널 이름이 다름",
  channel_unreachable: "채널 주소가 열리지 않음",
  other: "그 밖",
};
export const REVOKE_REASON_LABEL: Record<RevokeReason, string> = {
  channel_gone: "채널이 없어졌거나 다른 사람에게 넘어감",
  not_owner_confirmed: "채널 주인이 아니라는 문의가 확인됨",
  policy_violation: "이용 규칙 위반",
  link_removed: "팬꾹 링크가 채널에서 내려감",
  other: "그 밖",
};
const CLOSE_REASON_LABELS: Record<string, string> = {
  owner_confirmed_elsewhere: "다른 계정에서 채널 소유자 확인을 완료했습니다.",
  method_changed: "확인 방식이 바뀌었습니다. 새로 확인을 요청해 주세요.",
};
/** 지금은 고를 수 없지만 예전 기록에 남아 있을 수 있는 사유 — 읽을 때만 쓴다. */
const LEGACY_REJECT_REASON_LABEL: Record<string, string> = { code_not_found: "코드를 찾지 못함", profile_mismatch: "채널과 가입 정보가 맞지 않음" };
const LEGACY_REVOKE_REASON_LABEL: Record<string, string> = { code_removed: "채널에서 코드가 사라짐" };

/** 운영자 메모 한도(INV-V9) — DB 와 같은 기준(글자 수). */
export const VERIFICATION_MEMO_MAX = 200;
/** INV-V15: 한 계정·한 채널의 확인 요청 횟수(DB 의 cv_verification_tries 와 같은 기준). 크리에이터 화면에는 남은 횟수를 보이지 않는다. */
export const VERIFICATION_TRIES = 10;
/** INV-V20: 재확인 주기·유예 기간(DB 의 cv_recheck_window·cv_link_grace 와 같은 기준). */
export const RECHECK_DAYS = 90;
export const LINK_GRACE_DAYS = 14;

export function platformLabel(platform: string): string {
  return isChannelPlatform(platform) ? CHANNEL_PLATFORM_LABEL[platform] : platform;
}

/**
 * 사유 목록 값의 화면 문구. 상태가 사유의 종류를 정한다 — 반려됨은 반려 사유, 닫힘은 닫힘 사유,
 * 승인됨에 사유가 있으면 승인이 취소된 것(취소 사유). 모르는 값이면 null(화면에 지어낸 문구를 쓰지 않는다).
 */
export function reasonLabel(status: VerificationStatus, reasonCode: string | null): string | null {
  if (reasonCode === null) return null;
  if (status === "rejected") return (REJECT_REASON_LABEL as Record<string, string>)[reasonCode] ?? LEGACY_REJECT_REASON_LABEL[reasonCode] ?? null;
  if (status === "closed") return CLOSE_REASON_LABELS[reasonCode] ?? null;
  if (status === "approved") return (REVOKE_REASON_LABEL as Record<string, string>)[reasonCode] ?? LEGACY_REVOKE_REASON_LABEL[reasonCode] ?? null;
  return null;
}

// ── 크리에이터 자신의 요청 (my_creator_verifications) ─────────

export type MyVerification = {
  id: string;
  platform: string;
  channelUrl: string;
  /** 요청 때의 링크용 아이디(INV-V17). 옛 코드 신청·로그인 확인 줄이면 null */
  linkHandle: string | null;
  method: VerificationMethod;
  status: VerificationStatus;
  issuedAt: string;
  reasonCode: string | null;
  /** 그 채널로 남은 요청 횟수(INV-V15) */
  remainingCount: number;
};

const myRow = z
  .object({
    id: z.string(),
    platform: z.string(),
    channel_url: z.string(),
    link_handle: z.string().nullable(),
    method: z.enum(VERIFICATION_METHODS),
    status: z.enum(VERIFICATION_STATUSES),
    issued_at: z.string(),
    reason_code: z.string().nullable(),
    remaining_count: z.number().int().min(0),
  })
  .strict();

export function myVerificationsFromRows(rows: unknown): MyVerification[] | null {
  const parsed = z.array(myRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    id: r.id,
    platform: r.platform,
    channelUrl: r.channel_url,
    linkHandle: r.link_handle,
    method: r.method,
    status: r.status,
    issuedAt: r.issued_at,
    reasonCode: r.reason_code,
    remainingCount: r.remaining_count,
  }));
}

/** 크리에이터 자신의 공개 정보 가운데 확인 상태(my_creator_verification_state). */
export type MyVerificationState = {
  creatorId: string;
  name: string;
  channelTitle: string;
  verified: boolean;
  platform: string | null;
  channelUrl: string | null;
  verifiedAt: string | null;
  /** INV-V10(d32): 마지막 결정이 「이용 규칙 위반」 취소 — 운영자 승인으로만 다시 확인된다. */
  operatorOnly: boolean;
  /** 지금 링크용 아이디 — 없으면 확인 요청을 낼 수 없다(INV-V17) */
  handle: string | null;
  /** 확인됐을 때 다음 재확인 날(마지막 확인 + 90일, INV-V20) */
  nextRecheckAt: string | null;
  /** 재확인에서 링크가 없어 유예 중이면 유예 끝(INV-V20) */
  graceUntil: string | null;
  /** 유예 중 「다시 확인 요청」을 누른 때 */
  recheckRequestedAt: string | null;
};

const stateRow = z
  .object({
    creator_id: z.string(),
    name: z.string(),
    channel_title: z.string(),
    verified: z.boolean(),
    platform: z.string().nullable(),
    channel_url: z.string().nullable(),
    verified_at: z.string().nullable(),
    operator_only: z.boolean(),
    handle: z.string().nullable(),
    next_recheck_at: z.string().nullable(),
    grace_until: z.string().nullable(),
    recheck_requested_at: z.string().nullable(),
  })
  .strict();

export function myVerificationStateFromRows(rows: unknown): MyVerificationState | null | undefined {
  const parsed = z.array(stateRow).max(1).safeParse(rows);
  if (!parsed.success) return undefined;
  const r = parsed.data[0];
  if (!r) return null;
  return {
    creatorId: r.creator_id,
    name: r.name,
    channelTitle: r.channel_title,
    verified: r.verified,
    platform: r.platform,
    channelUrl: r.channel_url,
    verifiedAt: r.verified_at,
    operatorOnly: r.operator_only,
    handle: r.handle,
    nextRecheckAt: r.next_recheck_at,
    graceUntil: r.grace_until,
    recheckRequestedAt: r.recheck_requested_at,
  };
}

/** 살아 있는 요청 = 확인 대기(INV-V4). 옛 코드 받음 줄은 기간이 지나면 서버가 expired 로 돌려준다. */
export function isLive(v: Pick<MyVerification, "status">): boolean {
  return v.status === "issued" || v.status === "posted";
}

/**
 * 크리에이터 화면의 확인 칸이 보여 줄 단계 (UX 명세 signup.md 「2026-11-02 채널 확인」 상태표, INV-V15·V17·V20).
 * - link_needed: 링크용 아이디가 없다 — 요청을 낼 수 없다.
 * - waiting: 확인 대기 요청이 있다(확인 전이든 채널 이사든).
 * - recheck_missing: 확인됐고 재확인에서 링크가 없어 유예 중.
 * - verified: 확인됨(이사 요청 없음).
 * - locked: 마지막 요청이 반려 등으로 끝났고 그 채널로 남은 횟수가 0.
 * - rejected: 마지막 요청이 반려됨 — 사유 한 줄 + 다시 요청 칸.
 * - idle: 확인 전, 살아 있는 요청 없음.
 */
export type PanelStage = "link_needed" | "idle" | "waiting" | "rejected" | "locked" | "verified" | "recheck_missing";

export type MyVerificationPanel = {
  stage: PanelStage;
  mode: "verify" | "move";
  live: MyVerification | null;
  last: MyVerification | null;
};

export function myVerificationPanel(
  state: Pick<MyVerificationState, "verified" | "handle" | "graceUntil">,
  rows: readonly MyVerification[],
): MyVerificationPanel {
  const live = rows.find(isLive) ?? null;
  // 줄은 마지막으로 일어난 일이 늦은 순서로 온다(DB 읽기 함수가 정렬). 그래서 첫 줄이 가장 최근 결정이다.
  const last = live ? null : (rows[0] ?? null);
  const mode = state.verified ? "move" : "verify";
  const stage: PanelStage = live
    ? "waiting"
    : state.verified
      ? state.graceUntil
        ? "recheck_missing"
        : "verified"
      : state.handle === null
        ? "link_needed"
        : last && isOperatorCheckedApplication(last.method) && last.status !== "approved" && last.remainingCount === 0
          ? "locked"
          : last?.status === "rejected"
            ? "rejected"
            : "idle";
  return { stage, mode, live, last };
}

/**
 * 그 플랫폼에서 쓸 수 있는 확인 길 (INV-V14·V17). 로그인 확인이 되는 플랫폼(지금은 치지직)이면 「○○로 바로 확인」이 함께 보인다.
 * 화면 안내일 뿐이다 — 로그인 확인 함수가 같은 표로 다시 판정한다.
 */
export function canLoginCheck(platform: string, loginPlatforms: ReadonlySet<string>, state: Pick<MyVerificationState, "operatorOnly">): boolean {
  return !state.operatorOnly && isChannelPlatform(platform) && loginPlatforms.has(platform);
}

/**
 * 확인 칸 맨 위 한 줄. 운영자 확인만이고 아직 확인 전이면(INV-V10, d32) 지난 요청보다 위반 취소를 먼저 알린다.
 */
export function panelOutcomeText(state: Pick<MyVerificationState, "verified" | "operatorOnly">, last: MyVerification | null): string | null {
  if (!state.verified && state.operatorOnly) return "이용 규칙 위반으로 승인이 취소되었습니다. 재확인은 운영자가 진행합니다.";
  return last ? lastOutcomeText(last) : null;
}

/** 지난 요청이 화면에 알릴 한 줄 — 승인 취소·반려·닫힘·기간 지남·거둠. 승인됐고 취소되지 않았으면 null. */
export function lastOutcomeText(v: MyVerification): string | null {
  const reason = reasonLabel(v.status, v.reasonCode);
  if (v.status === "approved") return reason ? `승인이 취소되었습니다 — ${reason}` : null;
  if (v.status === "rejected") return reason ? `승인이 반려되었습니다 — ${reason}` : "승인이 반려되었습니다";
  if (v.status === "closed") return `요청이 종료되었습니다. ${reason ?? ""}`.trim();
  if (v.status === "expired") return "확인 기한이 지났습니다";
  if (v.status === "withdrawn") return "요청을 취소했습니다";
  return null;
}

// ── 운영자 요청 목록 (admin_creator_verifications) ──────────

export type AdminVerification = {
  id: string;
  nickname: string;
  loginId: string;
  creatorName: string | null;
  /** 가입 때 적은 채널 이름 — 승인 조건 (1)의 비교 대상(INV-V18) */
  channelTitle: string | null;
  platform: string;
  channelUrl: string;
  /** 찾을 링크의 아이디 — 요청 때 값(INV-V17). 옛 코드 신청이면 null */
  linkHandle: string | null;
  method: VerificationMethod;
  status: VerificationStatus;
  issuedAt: string;
  postedAt: string | null;
  /** 그 계정이 그 채널로 쓴 요청 횟수(INV-V15 — 승인되지 않고 끝난 것, 마지막 풀기 뒤) */
  usedCount: number;
};

const adminRow = z
  .object({
    id: z.string(),
    nickname: z.string(),
    login_id: z.string(),
    creator_name: z.string().nullable(),
    channel_title: z.string().nullable(),
    platform: z.string(),
    channel_url: z.string(),
    link_handle: z.string().nullable(),
    method: z.enum(VERIFICATION_METHODS),
    status: z.enum(VERIFICATION_STATUSES),
    issued_at: z.string(),
    posted_at: z.string().nullable(),
    used_count: z.number().int().min(0),
  })
  .strict();

export function adminVerificationsFromRows(rows: unknown): AdminVerification[] | null {
  const parsed = z.array(adminRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    id: r.id,
    nickname: r.nickname,
    loginId: r.login_id,
    creatorName: r.creator_name,
    channelTitle: r.channel_title,
    platform: r.platform,
    channelUrl: r.channel_url,
    linkHandle: r.link_handle,
    method: r.method,
    status: r.status,
    issuedAt: r.issued_at,
    postedAt: r.posted_at,
    usedCount: r.used_count,
  }));
}

/**
 * 운영자 화면의 두 표 (INV-V6·V15·V19).
 * - posted: 확인 대기 — 승인·반려. 오래된 것부터(먼저 기다린 사람 먼저).
 * - ended: 끝난 요청 — 읽기 전용. 그 계정·그 채널의 가장 최근 요청 줄에만 「횟수 풀기」를 둔다.
 */
export type AdminVerificationTables = {
  posted: AdminVerification[];
  ended: Array<AdminVerification & { unlockable: boolean }>;
};

export function adminVerificationTables(rows: readonly AdminVerification[]): AdminVerificationTables {
  const posted = rows.filter((r) => r.status === "posted").toSorted((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));
  const seen = new Set(rows.filter(isLive).map((r) => `${r.loginId}\n${r.channelUrl}`));
  const ended = rows
    .filter((r) => !isLive(r))
    .map((r) => {
      const pair = `${r.loginId}\n${r.channelUrl}`;
      const counted = isOperatorCheckedApplication(r.method);
      const first = counted && !seen.has(pair);
      if (counted) seen.add(pair);
      return { ...r, unlockable: first && r.usedCount > 0 };
    });
  return { posted, ended };
}

// ── 운영자 재확인 목록 (admin_creator_rechecks, INV-V20) ──────

export type AdminRecheck = {
  creatorId: string;
  nickname: string | null;
  loginId: string | null;
  creatorName: string;
  channelTitle: string;
  platform: string | null;
  channelUrl: string | null;
  /** 지금 링크용 아이디 — 재확인은 지금 아이디로 찾는다. 없으면 null */
  handle: string | null;
  /** 오른 이유: handle(아이디를 바꿈) · days(90일 지남). 유예 중이면 null 일 수 있다 */
  reason: "handle" | "days" | null;
  linkCheckedAt: string | null;
  /** 「링크 없음」으로 유예가 시작된 때 — 없으면 재확인 대기 */
  linkMissingAt: string | null;
  graceUntil: string | null;
  recheckRequestedAt: string | null;
};

const recheckRow = z
  .object({
    creator_id: z.string(),
    nickname: z.string().nullable(),
    login_id: z.string().nullable(),
    creator_name: z.string(),
    channel_title: z.string(),
    platform: z.string().nullable(),
    channel_url: z.string().nullable(),
    handle: z.string().nullable(),
    recheck_reason: z.enum(["handle", "days"]).nullable(),
    link_checked_at: z.string().nullable(),
    link_missing_at: z.string().nullable(),
    grace_until: z.string().nullable(),
    recheck_requested_at: z.string().nullable(),
  })
  .strict();

export function adminRechecksFromRows(rows: unknown): AdminRecheck[] | null {
  const parsed = z.array(recheckRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    creatorId: r.creator_id,
    nickname: r.nickname,
    loginId: r.login_id,
    creatorName: r.creator_name,
    channelTitle: r.channel_title,
    platform: r.platform,
    channelUrl: r.channel_url,
    handle: r.handle,
    reason: r.recheck_reason,
    linkCheckedAt: r.link_checked_at,
    linkMissingAt: r.link_missing_at,
    graceUntil: r.grace_until,
    recheckRequestedAt: r.recheck_requested_at,
  }));
}

/** 재확인 표(유예 전)와 유예 표로 나눈다. 순서는 DB 가 오래된 순으로 준다. */
export function adminRecheckTables(rows: readonly AdminRecheck[]): { recheck: AdminRecheck[]; grace: AdminRecheck[] } {
  return { recheck: rows.filter((r) => r.linkMissingAt === null), grace: rows.filter((r) => r.linkMissingAt !== null) };
}

export const RECHECK_REASON_LABEL: Record<"handle" | "days", string> = { handle: "링크 주소 바꿈", days: `${RECHECK_DAYS}일 지남` };

/** 처리 기록 한 줄의 사유 문구 — 반려는 반려 사유, 닫힘은 닫힘 사유, 승인 취소는 취소 사유. 없거나 모르는 값이면 null. */
export function eventReasonLabel(action: string, reasonCode: string | null): string | null {
  if (action === "reject") return reasonLabel("rejected", reasonCode);
  if (action === "close") return reasonLabel("closed", reasonCode);
  if (action === "revoke") return reasonLabel("approved", reasonCode);
  return null;
}
