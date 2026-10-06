import { z } from "zod";
import { CHANNEL_PLATFORM_LABEL, isChannelPlatform } from "./channel-url";

// 크리에이터 본인 확인 신청의 모양과 화면 판단 (creator-verification INV-V4·V5·V9·V11·V13·V15·V16).
// DB 읽기 함수(my_creator_verifications · admin_creator_verifications)가 돌려준 줄을 이 모양으로 바꾼다.
// 꼴이 다른 줄이 하나라도 있으면 null — 신청이 몰래 빠지지 않게.
// 화면이 정하는 것은 「무엇을 보여 주고 어느 버튼을 열어 둘지」뿐이다. 거부·허용은 DB 함수가 다시 판정한다.

export const VERIFICATION_STATUSES = ["issued", "posted", "approved", "rejected", "withdrawn", "closed", "expired"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUS_LABEL: Record<VerificationStatus, string> = {
  issued: "코드 받음",
  posted: "확인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  withdrawn: "거둠",
  closed: "닫힘",
  expired: "기간 지남",
};

/** INV-V13: 「인증 코드」(운영자 확인) · 「코드 자동 확인」 · 「플랫폼 로그인」. 읽기 함수는 승인된 신청이면 승인 기록의 방법을 준다. */
export const VERIFICATION_METHODS = ["code", "auto_code", "login"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];
export const VERIFICATION_METHOD_LABEL: Record<VerificationMethod, string> = { code: "인증 코드", auto_code: "코드 자동 확인", login: "플랫폼 로그인" };

/** 인증 코드 신청인가 — 운영자 확인이든 자동 확인이든 코드를 받은 신청이다(INV-V15 횟수도 이것으로 센다). */
export function isCodeApplication(method: VerificationMethod): boolean {
  return method !== "login";
}

/** INV-V9: 반려 사유 목록 — DB 의 admin_reject_creator_verification 이 받는 값과 같다. */
export const REJECT_REASONS = ["code_not_found", "channel_unreachable", "profile_mismatch", "other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];
/**
 * INV-V9: 승인 취소 사유 목록 — DB 의 admin_revoke_creator 가 받는 값과 같다.
 * 2026-10-06 「채널에서 코드가 사라짐」(code_removed)을 뺐다 — 확인된 뒤 소개란 코드는 지워도 된다(INV-V16).
 */
export const REVOKE_REASONS = ["channel_gone", "not_owner_confirmed", "policy_violation", "other"] as const;
export type RevokeReason = (typeof REVOKE_REASONS)[number];
/** INV-V14: 닫힘 사유 — 서버가 정한다. */
export const CLOSE_REASON = "owner_confirmed_elsewhere";

export const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  code_not_found: "코드를 찾지 못함",
  channel_unreachable: "채널 주소가 열리지 않음",
  profile_mismatch: "채널과 가입 정보가 맞지 않음",
  other: "그 밖",
};
export const REVOKE_REASON_LABEL: Record<RevokeReason, string> = {
  channel_gone: "채널이 없어졌거나 다른 사람에게 넘어감",
  not_owner_confirmed: "채널 주인이 아니라는 문의가 확인됨",
  policy_violation: "이용 규칙 위반",
  other: "그 밖",
};
export const CLOSE_REASON_LABEL = "다른 계정이 채널 주인 확인을 마쳤어요";
/** 지금은 고를 수 없지만 예전 기록에 남아 있을 수 있는 취소 사유 — 읽을 때만 쓴다. */
const LEGACY_REVOKE_REASON_LABEL: Record<string, string> = { code_removed: "채널에서 코드가 사라짐" };

/** 운영자 메모 한도(INV-V9) — DB 와 같은 기준(글자 수). */
export const VERIFICATION_MEMO_MAX = 200;
/** INV-V15: 한 계정·한 채널의 코드 신청 횟수. */
export const VERIFICATION_TRIES = 3;

/**
 * INV-V15: 진행 중인 코드 신청이 이 채널로 몇 번째인지. 남은 횟수는 끝난 신청만 빼서 오므로(진행 중인 신청은 아직 안 빠짐)
 * 화면에 「남은 3번」을 그대로 쓰면 이번 신청이 안 됐을 때 한 번 더 있는 것처럼 읽힌다.
 */
export function attemptNumber(remainingCount: number): number {
  return Math.min(VERIFICATION_TRIES, VERIFICATION_TRIES - remainingCount + 1);
}

/** INV-V15: 코드를 다시 받으면 지금 신청이 한 번으로 세어지므로, 새 신청은 그다음 번째다. */
export function attemptNumberAfterRegenerate(remainingCount: number): number {
  return attemptNumber(remainingCount - 1);
}

/** INV-V4: 코드 신청의 확인 기한(DB 의 cv_post_window 와 같은 기준). */
export const VERIFICATION_CODE_DAYS = 7;

/** 인스타그램은 프로페셔널 계정만 플랫폼 API 로 확인된다 — 그 플랫폼이면 화면이 덧붙일 안내 대상인지. */
export function needsProfessionalAccountNote(platform: string): boolean {
  return platform === "instagram";
}

export function platformLabel(platform: string): string {
  return isChannelPlatform(platform) ? CHANNEL_PLATFORM_LABEL[platform] : platform;
}

/**
 * 사유 목록 값의 화면 문구. 상태가 사유의 종류를 정한다 — 반려됨은 반려 사유, 닫힘은 닫힘 사유,
 * 승인됨에 사유가 있으면 승인이 취소된 것(취소 사유). 모르는 값이면 null(화면에 지어낸 문구를 쓰지 않는다).
 */
export function reasonLabel(status: VerificationStatus, reasonCode: string | null): string | null {
  if (reasonCode === null) return null;
  if (status === "rejected") return (REJECT_REASON_LABEL as Record<string, string>)[reasonCode] ?? null;
  if (status === "closed") return reasonCode === CLOSE_REASON ? CLOSE_REASON_LABEL : null;
  if (status === "approved") return (REVOKE_REASON_LABEL as Record<string, string>)[reasonCode] ?? LEGACY_REVOKE_REASON_LABEL[reasonCode] ?? null;
  return null;
}

// ── 크리에이터 자신의 신청 (my_creator_verifications) ─────────

export type MyVerification = {
  id: string;
  platform: string;
  channelUrl: string;
  code: string | null;
  method: VerificationMethod;
  status: VerificationStatus;
  issuedAt: string;
  postDeadline: string | null;
  reasonCode: string | null;
  /** 그 채널로 남은 코드 신청 횟수(INV-V15) */
  remainingCount: number;
};

const myRow = z
  .object({
    id: z.string(),
    platform: z.string(),
    channel_url: z.string(),
    code: z.string().nullable(),
    method: z.enum(VERIFICATION_METHODS),
    status: z.enum(VERIFICATION_STATUSES),
    issued_at: z.string(),
    post_deadline: z.string().nullable(),
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
    code: r.code,
    method: r.method,
    status: r.status,
    issuedAt: r.issued_at,
    postDeadline: r.post_deadline,
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
  };
}

/** 살아 있는 신청 = 코드 받음(기간 안 — 기간 지남은 서버가 expired 로 돌려준다) 또는 확인 대기(INV-V5). */
export function isLive(v: Pick<MyVerification, "status">): boolean {
  return v.status === "issued" || v.status === "posted";
}

/**
 * 크리에이터 화면의 확인 칸이 보여 줄 것 (INV-V4·V5·V12·V15).
 * - live: 지금 살아 있는 신청(많아야 하나 — INV-V4). 있으면 그 신청의 코드·기한·버튼을 보인다.
 * - last: 살아 있는 신청이 없을 때 가장 최근에 끝난 신청 — 반려·닫힘·기간 지남·거둠·승인 취소 사유를 알린다.
 * - mode: 확인 전이면 「확인 신청」, 확인됐으면 새 채널로 옮기는 「채널 이사 신청」.
 * - 버튼: 확인 요청(운영자 확인)·다시 받기는 코드 받음일 때만, 거두기는 살아 있는 동안. 다시 받기는 남은 횟수가 2 이상일 때만
 *   (지금 신청을 버리면 하나를 더 쓰고, 새 신청에 하나가 더 있어야 한다 — INV-V15).
 *   「확인」(코드 자동 확인)은 코드 받음이고 그 플랫폼이 「API 확인」 있음일 때만(INV-V16).
 */
export type MyVerificationPanel = {
  mode: "verify" | "move";
  live: MyVerification | null;
  last: MyVerification | null;
  canRequest: boolean;
  canMarkPosted: boolean;
  canRegenerate: boolean;
  canWithdraw: boolean;
  canAutoCheck: boolean;
};

export function myVerificationPanel(
  state: Pick<MyVerificationState, "verified">,
  rows: readonly MyVerification[],
  apiPlatforms: ReadonlySet<string> = new Set(),
): MyVerificationPanel {
  const live = rows.find(isLive) ?? null;
  // 줄은 발급 시각이 늦은 순서로 온다. 플랫폼 로그인으로 승인된 줄도 보여 줄 「지난 신청」이 될 수 있다.
  const last = live ? null : (rows[0] ?? null);
  return {
    mode: state.verified ? "move" : "verify",
    live,
    last,
    canRequest: live === null,
    canMarkPosted: live?.status === "issued",
    canRegenerate: live?.status === "issued" && live.remainingCount >= 2,
    canWithdraw: live !== null,
    canAutoCheck: live?.status === "issued" && apiPlatforms.has(live.platform),
  };
}

/**
 * 그 플랫폼에서 쓸 수 있는 확인 길, 보여 줄 순서대로 (INV-V2 「API 확인」·V14·V16).
 * API 가 있으면 플랫폼 로그인(기본) → 코드 자동 확인(보조) → 운영자 확인(그래도 안 될 때). 없으면 운영자 확인뿐.
 * 화면 안내일 뿐이다 — 로그인 확인·자동 확인 함수가 같은 표로 다시 판정한다.
 */
export type VerifyRoute = "login" | "auto_code" | "operator";

/**
 * INV-V10(d32): 이 크리에이터가 스스로(플랫폼 로그인·코드 자동 확인) 확인할 수 있는 플랫폼.
 * 운영자 확인만이면 빈 집합 — 확인 길과 패널 판단이 모두 운영자 길만 남긴다. 거부는 DB 가 다시 한다.
 */
export function selfCheckPlatforms(state: Pick<MyVerificationState, "operatorOnly">, apiPlatforms: ReadonlySet<string>): ReadonlySet<string> {
  return state.operatorOnly ? new Set() : apiPlatforms;
}

export function verifyRoutes(platform: string, apiPlatforms: ReadonlySet<string>): VerifyRoute[] {
  return isChannelPlatform(platform) && apiPlatforms.has(platform) ? ["login", "auto_code", "operator"] : ["operator"];
}

/**
 * 확인 칸 맨 위 한 줄. 운영자 확인만이고 아직 확인 전이면(INV-V10, d32) 지난 신청보다 위반 취소를 먼저 알린다 —
 * 지난 신청은 발급 순서로 골라서, 취소 전에 거둔 신청이 있으면 그 줄이 대신 보이기 때문이다.
 */
export function panelOutcomeText(state: Pick<MyVerificationState, "verified" | "operatorOnly">, last: MyVerification | null): string | null {
  if (!state.verified && state.operatorOnly) return "이용 규칙 위반으로 승인이 취소됐어요. 다시 확인은 운영자가 해요.";
  return last ? lastOutcomeText(last) : null;
}

/** 지난 신청이 화면에 알릴 한 줄 — 승인 취소·반려·닫힘·기간 지남·거둠. 승인됐고 취소되지 않았으면 null. */
export function lastOutcomeText(v: MyVerification): string | null {
  const reason = reasonLabel(v.status, v.reasonCode);
  if (v.status === "approved") return reason ? `승인이 취소됐어요 — ${reason}` : null;
  if (v.status === "rejected") return reason ? `반려됐어요 — ${reason}` : "반려됐어요";
  if (v.status === "closed") return `신청이 닫혔어요 — ${reason ?? CLOSE_REASON_LABEL}`;
  if (v.status === "expired") return `${VERIFICATION_CODE_DAYS}일 안에 확인을 마치지 않아 기간이 지났어요`;
  if (v.status === "withdrawn") return "신청을 거뒀어요";
  return null;
}

// ── 운영자 신청 목록 (admin_creator_verifications) ──────────

export type AdminVerification = {
  id: string;
  nickname: string;
  loginId: string;
  creatorName: string | null;
  channelTitle: string | null;
  platform: string;
  channelUrl: string;
  code: string | null;
  method: VerificationMethod;
  status: VerificationStatus;
  issuedAt: string;
  postedAt: string | null;
  /** 그 계정이 그 채널로 쓴 코드 신청 횟수(INV-V15 — 승인되지 않고 끝난 것, 마지막 풀기 뒤) */
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
    code: z.string().nullable(),
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
    code: r.code,
    method: r.method,
    status: r.status,
    issuedAt: r.issued_at,
    postedAt: r.posted_at,
    usedCount: r.used_count,
  }));
}

/**
 * 운영자 화면의 세 표 (INV-V5·V6·V15).
 * - posted: 확인 대기 — 승인·반려. 올린 순서가 오래된 것부터(먼저 기다린 사람 먼저).
 * - issued: 코드 받음(아직 안 올림) — 반려만(승인은 올림 상태만, INV-V6).
 * - ended: 끝난 신청 — 읽기 전용. 그 계정·그 채널의 가장 최근 코드 신청 줄에만 「횟수 풀기」를 둔다(같은 쌍에 버튼이 여러 개 생기지 않게).
 */
export type AdminVerificationTables = {
  posted: AdminVerification[];
  issued: AdminVerification[];
  ended: Array<AdminVerification & { unlockable: boolean }>;
};

export function adminVerificationTables(rows: readonly AdminVerification[]): AdminVerificationTables {
  const posted = rows.filter((r) => r.status === "posted").toSorted((a, b) => (a.postedAt ?? "").localeCompare(b.postedAt ?? ""));
  const issued = rows.filter((r) => r.status === "issued");
  // 살아 있는 신청이 있는 쌍은 그 줄(확인 대기·코드 받음 표)이 가장 최근이라 끝난 표에서 풀기 버튼을 두지 않는다
  const seen = new Set(rows.filter(isLive).map((r) => `${r.loginId}\n${r.channelUrl}`));
  const ended = rows
    .filter((r) => !isLive(r))
    .map((r) => {
      const pair = `${r.loginId}\n${r.channelUrl}`;
      const first = isCodeApplication(r.method) && !seen.has(pair);
      if (isCodeApplication(r.method)) seen.add(pair);
      return { ...r, unlockable: first && r.usedCount > 0 };
    });
  return { posted, issued, ended };
}

/** 처리 기록 한 줄의 사유 문구 — 반려는 반려 사유, 닫힘은 닫힘 사유, 승인 취소는 취소 사유. 없거나 모르는 값이면 null. */
export function eventReasonLabel(action: "approve" | "reject" | "close" | "revoke", reasonCode: string | null): string | null {
  if (action === "reject") return reasonLabel("rejected", reasonCode);
  if (action === "close") return reasonLabel("closed", reasonCode);
  if (action === "revoke") return reasonLabel("approved", reasonCode);
  return null;
}
