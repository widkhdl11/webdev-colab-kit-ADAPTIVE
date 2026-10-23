import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { MESSAGE_LOGIN_ID, shapeLoginId } from "./login-id";

// 회원 탈퇴 처리 (my-account INV-A15, approval-signature INV-S14·S15). 탈퇴 신청은 1:1 문의로 받고 대표가 아이디로 처리한다.
// 대표 판정·진행 중인 일 판정·가명 처리는 DB 함수(withdraw_account)가 한 처리로 한다. 여기서는 어긋난 입력을 DB 까지 보내지 않고,
// DB 가 돌려준 사진 경로를 저장소에서 지운다(공개 저장소라 남으면 누구나 연다).

export const MESSAGE_WITHDRAW_OWNER_ONLY = "회원 탈퇴는 대표만 처리할 수 있어요.";
export { MESSAGE_LOGIN_ID } from "./login-id";
export const MESSAGE_NOT_MEMBER = "탈퇴할 수 있는 회원이 아니에요. 아이디를 확인해 주세요.";
export const MESSAGE_OPEN_WORK = "진행 중인 선물·역조공이 있거나 환불이 끝나지 않아 탈퇴할 수 없어요. 먼저 끝내 주세요.";
export const MESSAGE_KAKAO_SIGNATURE = "카카오 서명 기록이 있어 아직 탈퇴를 처리할 수 없어요.";
export const MESSAGE_PHOTOS_LEFT = "탈퇴는 처리됐지만 사진을 지우지 못했어요. 개발 담당에게 알려 주세요.";
const MESSAGE_FAILED = "탈퇴를 처리하지 못했어요. 잠시 뒤 다시 해 주세요.";

const bodyShape = z.object({ loginId: z.string() }).strict();
export type WithdrawWrite = z.input<typeof bodyShape>;

const resultShape = z.object({
  pseudonym: z.string(),
  fan_photo_paths: z.array(z.string()),
  creator_photo_paths: z.array(z.string()),
});

/** 저장소에서 지울 사진 — 팬 사진과 크리에이터 사진은 저장소가 다르다. 실패하면 false */
export type RemovePhotos = (paths: { fan: string[]; creator: string[] }) => Promise<boolean>;

/** client = 로그인한 사람의 세션 클라이언트. 대표 판정과 기록의 「누가」는 DB 가 그 토큰의 사람으로 한다 — 관리자 키를 쓰지 않는다. */
export async function withdrawAccount(client: Pick<SupabaseClient, "rpc">, removePhotos: RemovePhotos, body: unknown): Promise<JsonReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_WITHDRAW_OWNER_ONLY } };
  const shaped = bodyShape.safeParse(body);
  const loginId = shaped.success ? shapeLoginId(shaped.data.loginId) : null;
  if (!loginId) return { status: 400, body: { message: MESSAGE_LOGIN_ID } };

  const { data, error } = await client.rpc("withdraw_account", { p_login_id: loginId });
  if (error?.code === "42501") return { status: 403, body: { message: MESSAGE_WITHDRAW_OWNER_ONLY } };
  if (error?.code === "P0002") return { status: 404, body: { message: MESSAGE_NOT_MEMBER } };
  if (error?.code === "55000") return { status: 409, body: { message: MESSAGE_OPEN_WORK } };
  if (error?.code === "0A000") return { status: 409, body: { message: MESSAGE_KAKAO_SIGNATURE } };
  if (error) return { status: 500, body: { message: MESSAGE_FAILED } };

  const result = resultShape.safeParse(data);
  if (!result.success) return { status: 200, body: { ok: true, message: MESSAGE_PHOTOS_LEFT } };
  const { fan_photo_paths: fan, creator_photo_paths: creator } = result.data;
  if (fan.length + creator.length > 0 && !(await removePhotos({ fan, creator }))) {
    return { status: 200, body: { ok: true, message: MESSAGE_PHOTOS_LEFT } };
  }
  return { status: 200, body: { ok: true } };
}
