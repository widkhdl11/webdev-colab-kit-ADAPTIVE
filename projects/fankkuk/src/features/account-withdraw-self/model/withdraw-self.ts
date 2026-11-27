import { z } from "zod";
import { passwordMatches, type AccountPasswordDeps } from "@/entities/session/api/account-password";
import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { CURRENT_PASSWORD_EMPTY, CURRENT_PASSWORD_WRONG } from "@/entities/session/model/password-rule";
import type { Viewer } from "@/entities/session/model/viewer";

// 본인 탈퇴 (my-account INV-A17 · S17~S17e). 처리 자체는 대표용과 같은 DB 처리(INV-A15)이고, 여기서는 그 앞뒤만 한다.
// - 계정은 세션에서 확인한 사람(session-login INV-L2)뿐이다. 본문은 지금 비밀번호 하나만 받는다(다른 칸이 있으면 거부) — 계정 값을 읽지 않는다.
// - 지금 비밀번호가 맞은 뒤에만 DB 를 부른다. 틀린 횟수는 로그인·비밀번호 바꾸기와 같은 아이디별 잠금(INV-L14)에 센다.
// - 비밀번호가 맞으면 서버 키로 그 계정 앞 일회용 허가(2분)를 남긴다 — DB 는 허가가 없으면 처리하지 않는다(로그인 키만으로 데이터 API 를 바로 불러
//   비밀번호 없이 탈퇴되는 길을 막는다, 2026-11-27 보안 리뷰). 거부되면 처리 전체가 되돌아가 허가가 남으므로 서버가 거둔다.
// - DB 는 그 사람의 세션 클라이언트로 부른다(withdraw_my_account — 인자 없음, 계정은 토큰의 사람). 관리자 키는 허가·비밀번호 확인·사진 지우기에만 쓴다.
// - 거부 조건에 걸리면 아무것도 지우지 않고 이유와 링크를 돌려준다 — 팬은 진행 중인 선물 목록, 크리에이터는 운영자가 취소·환불을 정해야 해 1:1 문의.
// - 끝나면 이 요청의 로그인 쿠키를 지운다(계정이 지워져 다른 기기의 로그인도 더는 쓰이지 않는다). 유예 기간은 없다.

export const MESSAGE_LOGIN = "로그인이 필요합니다.";
export const MESSAGE_MEMBERS_ONLY = "팬·크리에이터 계정만 탈퇴할 수 있습니다.";
export const MESSAGE_FAN_OPEN_WORK = "진행 중인 선물·선물함 신청이 있거나 환불이 끝나지 않아 탈퇴할 수 없습니다. 선물이 모두 끝난 뒤 다시 탈퇴해 주세요.";
export const MESSAGE_CREATOR_OPEN_WORK = "진행 중인 주문이 있거나 환불이 끝나지 않아 탈퇴할 수 없습니다. 1:1 문의로 탈퇴를 신청해 주세요.";
export const MESSAGE_SIGNATURE = "카카오 서명 기록이 있어 이 화면에서 탈퇴할 수 없습니다. 1:1 문의로 탈퇴를 신청해 주세요.";
const MESSAGE_INPUT = "입력한 정보를 확인해 주세요.";
const MESSAGE_RETRY = "탈퇴를 처리하지 못했습니다. 다시 시도해 주세요.";
const MESSAGE_FAILED = "탈퇴를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type WithdrawLink = { href: string; label: string };

/** 팬이 막혔을 때 — 진행 중인 선물(보낸 선물)과 받는 중인 선물(받은 선물). 팬의 선물함 신청 목록 화면은 아직 없다 */
export const FAN_OPEN_WORK_LINKS: readonly WithdrawLink[] = [
  { href: "/gifts", label: "보낸 선물" },
  { href: "/me/revgifts", label: "받은 선물" },
];
export const SUPPORT_LINKS: readonly WithdrawLink[] = [{ href: "/support", label: "1:1 문의" }];

/** 저장소에서 지울 사진 — 팬 사진과 크리에이터 사진은 저장소가 다르다. 실패하면 false */
export type RemoveWithdrawnPhotos = (paths: { fan: string[]; creator: string[] }) => Promise<boolean>;

export type WithdrawSelfDeps = AccountPasswordDeps & {
  viewer: Viewer | null;
  /** 요청한 사람의 세션 클라이언트 — 관리자 키가 아니다 */
  session: { rpc(fn: "withdraw_my_account"): PromiseLike<{ data: unknown; error: { code?: string } | null }> };
  /** 서버 키로 남기고 거두는 일회용 허가 — DB 는 이것이 없으면 본인 탈퇴를 처리하지 않는다 */
  grant: { give(userId: string): Promise<void>; drop(userId: string): Promise<void> };
  removePhotos: RemoveWithdrawnPhotos;
  /** 이 요청의 로그인 쿠키를 지운다 */
  endSession: () => Promise<void>;
};

export type WithdrawSelfResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 500; field?: "currentPassword"; message: string; links?: readonly WithdrawLink[] };

const inputSchema = z.object({ currentPassword: z.string().max(200) }).strict();

const resultShape = z.object({
  pseudonym: z.string(),
  fan_photo_paths: z.array(z.string()),
  creator_photo_paths: z.array(z.string()),
});

export async function withdrawSelf(deps: WithdrawSelfDeps, body: unknown): Promise<WithdrawSelfResult> {
  const viewer = deps.viewer;
  if (!viewer) return { ok: false, status: 401, message: MESSAGE_LOGIN };
  if (viewer.role !== "fan" && viewer.role !== "creator") return { ok: false, status: 403, message: MESSAGE_MEMBERS_ONLY };
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: MESSAGE_INPUT };
  const { currentPassword } = parsed.data;
  if (currentPassword === "") return { ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_EMPTY };

  const check = await passwordMatches(deps, viewer.userId, currentPassword);
  if (check === "locked") return { ok: false, status: 429, field: "currentPassword", message: PASSWORD_LOCKED_MESSAGE };
  if (check === "wrong") return { ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_WRONG };

  // 허가는 비밀번호가 맞은 뒤에만 남긴다. 남기지 못하면 예외 — 부르는 쪽이 500 으로 답한다
  await deps.grant.give(viewer.userId);
  const { data, error } = await deps.session.rpc("withdraw_my_account");
  if (error) await deps.grant.drop(viewer.userId).catch(() => console.error("withdraw-self: 허가를 거두지 못했다(2분 뒤 만료)"));
  if (error?.code === "55000") {
    return viewer.role === "fan"
      ? { ok: false, status: 409, message: MESSAGE_FAN_OPEN_WORK, links: FAN_OPEN_WORK_LINKS }
      : { ok: false, status: 409, message: MESSAGE_CREATOR_OPEN_WORK, links: SUPPORT_LINKS };
  }
  if (error?.code === "0A000") return { ok: false, status: 409, message: MESSAGE_SIGNATURE, links: SUPPORT_LINKS };
  if (error?.code === "42501") return { ok: false, status: 403, message: MESSAGE_MEMBERS_ONLY };
  if (error?.code === "P0002") return { ok: false, status: 401, message: MESSAGE_LOGIN };
  // 허가가 없거나 기한이 지났다 — 서버가 방금 남겼으므로 보통은 오지 않는다. 다시 누르면 새 허가로 처리된다
  if (error?.code === "28000") return { ok: false, status: 409, message: MESSAGE_RETRY };
  if (error) {
    console.error("withdraw-self: DB 처리 실패", error.code ?? "코드 없음");
    return { ok: false, status: 500, message: MESSAGE_FAILED };
  }

  // 여기부터 계정은 이미 지워졌다 — 뒤 일이 실패해도 성공으로 답한다(다시 누르면 「로그인이 필요합니다」만 나온다)
  const result = resultShape.safeParse(data);
  if (!result.success) {
    console.error("withdraw-self: 처리 결과의 꼴이 다르다 — 사진을 지우지 못했다");
  } else {
    const { fan_photo_paths: fan, creator_photo_paths: creator } = result.data;
    if (fan.length + creator.length > 0) {
      const removed = await deps.removePhotos({ fan, creator }).catch(() => false);
      if (!removed) console.error("withdraw-self: 탈퇴한 계정의 사진을 저장소에서 지우지 못했다", fan.length + creator.length);
    }
  }
  await deps.endSession().catch(() => console.error("withdraw-self: 로그인 쿠키를 지우지 못했다"));
  return { ok: true };
}
