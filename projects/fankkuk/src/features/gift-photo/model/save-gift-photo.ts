import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";
import { PHOTO_PROBLEM_MESSAGE } from "@/shared/lib/image/photo-problem";
import { reencodePhoto } from "@/shared/lib/image/reencode-photo";

// 팬이 올리는 선물 사진 (together INV-F2). 사진 저장소에 쓰고 서명 주소를 내주는 길은 이것 하나다.
// - 사람은 세션에서 확인한 사람(viewer)이고, 그 주문이 그 사람의 것인지는 로그인 클라이언트로 부르는 DB 본인 읽기 함수(my_gift_photo)가 정한다 —
//   남의 주문·끝난 주문(취소·결제 실패·결제 없이 24시간)·없는 주문은 모두 404(있는지도 알리지 않는다).
// - 저장소는 비공개이고 쓰기 정책이 없다 — 쓰기·서명은 서버의 비밀 키 클라이언트로만 한다. 사진 기록(set_gift_photo·clear_gift_photo)도 비밀 키로만 부른다.
// - 경로는 {팬 ID}/{주문 ID}/{무작위}.webp — 기록 함수가 그 주문의 팬·주문 폴더가 아닌 경로를 거부한다. 같은 이름으로 덮어쓰지 않는다(upsert 끔).
// - 받은 사진은 열어 보고 사진 정보를 지운 뒤 긴 변 1280 webp 로 다시 만든다(reencodePhoto). 원본은 저장하지 않는다.
// - 주문당 한 장: 새 파일이 붙은 뒤에 옛 파일을 지운다. 붙이지 못하면 방금 올린 파일을 지운다.

export const GIFT_PHOTO_BUCKET = "gift-photos";
/** 저장하는 사진의 긴 변. */
export const GIFT_PHOTO_LONG_SIDE = 1280;
/** 서명 주소가 유효한 초 — 화면이 사진을 그리는 동안만. */
export const GIFT_PHOTO_SIGN_SECONDS = 60;

export type GiftPhotoDeps = {
  admin: Pick<SupabaseClient, "rpc" | "storage">;
  /** 요청한 사람의 로그인 클라이언트 — 본인 주문 확인에 쓴다 */
  client: Pick<SupabaseClient, "rpc">;
  viewer: Viewer | null;
};

type Refusal = { ok: false; status: 400 | 401 | 404 | 409; message: string };
export type GiftPhotoResult = { ok: true; version: number | null } | Refusal;

const LOGIN: Refusal = { ok: false, status: 401, message: "로그인이 필요합니다." };
const NOT_FOUND: Refusal = { ok: false, status: 404, message: "선물을 찾지 못했어요." };
const BUSY: Refusal = { ok: false, status: 409, message: "다른 화면에서 사진 변경을 진행 중입니다. 잠시 후 다시 시도해 주세요." };

const slotSchema = z.array(z.object({ order_id: z.guid(), photo_path: z.string().nullable(), photo_version: z.number().int().nonnegative() }).strict()).max(1);
const versionSchema = z.array(z.object({ old_path: z.string().nullable(), version: z.number().int().positive() }).strict()).length(1);

type Slot = { orderId: string; photoPath: string | null };

/** 로그인한 사람 본인의(취소되지 않은) 주문이면 그 주문 ID 와 지금 사진 경로. 아니면 null. */
async function mySlot(client: GiftPhotoDeps["client"], orderNo: string): Promise<Slot | null> {
  const { data, error } = await client.rpc("my_gift_photo", { p_order_no: orderNo });
  if (error) throw new Error(`사진 자리를 읽지 못했다: ${error.code}`);
  const [r] = slotSchema.parse(data);
  return r ? { orderId: r.order_id, photoPath: r.photo_path } : null;
}

async function removeFile(admin: GiftPhotoDeps["admin"], path: string | null): Promise<void> {
  if (!path) return;
  const { error } = await admin.storage.from(GIFT_PHOTO_BUCKET).remove([path]);
  // 지우지 못해도 기록은 이미 바뀌었다 — 남은 파일은 어느 화면도 가리키지 않는다. 기록만 남긴다(경로에 개인정보 없음)
  if (error) console.error("gift-photo: 옛 사진을 지우지 못했다", path);
}

/** 본문을 읽기 전에 거를 것 — 로그인. 라우트가 먼저 부르고, 저장·지우기도 다시 부른다. */
export function giftPhotoGate(viewer: Viewer | null): Refusal | null {
  return viewer ? null : LOGIN;
}

export async function saveGiftPhoto(deps: GiftPhotoDeps, orderNo: string, file: Blob | null): Promise<GiftPhotoResult> {
  const denied = giftPhotoGate(deps.viewer);
  if (denied) return denied;
  const slot = await mySlot(deps.client, orderNo);
  if (!slot) return NOT_FOUND;
  if (!file) return { ok: false, status: 400, message: PHOTO_PROBLEM_MESSAGE.empty };
  const processed = await reencodePhoto(new Uint8Array(await file.arrayBuffer()), { kind: "fit", longSide: GIFT_PHOTO_LONG_SIDE });
  if (!processed.ok) return { ok: false, status: 400, message: PHOTO_PROBLEM_MESSAGE[processed.problem] };

  const path = `${deps.viewer!.userId}/${slot.orderId}/${randomUUID()}.webp`;
  const up = await deps.admin.storage.from(GIFT_PHOTO_BUCKET).upload(path, processed.webp, { contentType: "image/webp", upsert: false });
  if (up.error) return BUSY;

  const set = await deps.admin.rpc("set_gift_photo", { p_order_id: slot.orderId, p_path: path });
  if (set.error) {
    await removeFile(deps.admin, path);
    if (set.error.code === "P0002") return NOT_FOUND;
    throw new Error(`사진 기록을 저장하지 못했다: ${set.error.code}`);
  }
  const [saved] = versionSchema.parse(set.data);
  await removeFile(deps.admin, saved!.old_path);
  return { ok: true, version: saved!.version };
}

export async function removeGiftPhoto(deps: GiftPhotoDeps, orderNo: string): Promise<GiftPhotoResult> {
  const denied = giftPhotoGate(deps.viewer);
  if (denied) return denied;
  const slot = await mySlot(deps.client, orderNo);
  if (!slot) return NOT_FOUND;
  const cleared = await deps.admin.rpc("clear_gift_photo", { p_order_id: slot.orderId });
  if (cleared.error) throw new Error(`사진 기록을 지우지 못했다: ${cleared.error.code}`);
  await removeFile(deps.admin, z.string().nullable().parse(cleared.data));
  return { ok: true, version: null };
}

/** 본인 주문의 사진이면 짧게 유효한 서명 주소. 로그인 안 함 401, 남의 주문·사진 없음 404. */
export async function signGiftPhoto(deps: GiftPhotoDeps, orderNo: string): Promise<{ ok: true; url: string } | { ok: false; status: 401 | 404 }> {
  if (!deps.viewer) return { ok: false, status: 401 };
  const slot = await mySlot(deps.client, orderNo);
  if (!slot?.photoPath) return { ok: false, status: 404 };
  const { data, error } = await deps.admin.storage.from(GIFT_PHOTO_BUCKET).createSignedUrl(slot.photoPath, GIFT_PHOTO_SIGN_SECONDS);
  if (error || !data) return { ok: false, status: 404 };
  return { ok: true, url: data.signedUrl };
}
