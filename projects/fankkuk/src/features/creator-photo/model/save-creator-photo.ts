import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PHOTO_BUCKET } from "@/entities/creator/model/link-images";
import type { Viewer } from "@/entities/session/model/viewer";
import { processProfilePhoto } from "./process-photo";

// 프로필 사진 저장·지우기 (creator-link INV-E1·E9). 사진 저장소에 쓰는 길은 이것 하나다.
// - 사람은 세션에서 확인한 사람(viewer — 로그인 토큰을 Auth 서버가 확인한 ID)이고, 크리에이터만.
// - 저장소 쓰기는 서버의 비밀 키 클라이언트로만 한다 — 저장소에는 쓰기 정책이 없어 화면 쪽 키로는 못 쓴다.
// - 판 번호와 경로({크리에이터 ID}/{판}.webp)는 DB 가 정한다(creator_photo_next · set_creator_photo — 비밀 키로만 부른다).
//   같은 판으로 두 번 올리면 저장소가 덮어쓰지 않고 거부한다(upsert 끔) — 동시에 올려도 한쪽만 붙는다.
// - 새 파일이 붙은 뒤에 옛 파일을 지운다. 붙이지 못하면 방금 올린 파일을 지운다.

export type PhotoDeps = { admin: Pick<SupabaseClient, "rpc" | "storage">; viewer: Viewer | null };

export type PhotoResult = { ok: true; photoPath: string | null } | { ok: false; status: 400 | 401 | 403 | 409; message: string };

const nextSchema = z.array(z.object({ creator_id: z.guid(), next_version: z.number().int().positive() }));

/** 사진을 바꿀 수 있는 사람인가 — 로그인한 크리에이터만. 라우트가 본문(파일)을 읽기 전에 먼저 부르고, 저장·지우기도 다시 부른다. */
export function photoGate(viewer: Viewer | null): Extract<PhotoResult, { ok: false }> | null {
  if (!viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 프로필 사진을 바꿀 수 있어요." };
  return null;
}

async function removeOld(admin: PhotoDeps["admin"], oldPath: unknown): Promise<void> {
  if (typeof oldPath !== "string" || oldPath === "") return;
  const { error } = await admin.storage.from(PHOTO_BUCKET).remove([oldPath]);
  // 지우지 못해도 새 사진은 이미 붙었다 — 남은 파일은 공개 화면이 가리키지 않는다. 기록만 남긴다(경로에 개인정보 없음)
  if (error) console.error("creator-photo: 옛 사진을 지우지 못했다", oldPath);
}

export async function saveCreatorPhoto(deps: PhotoDeps, file: Blob | null): Promise<PhotoResult> {
  const denied = photoGate(deps.viewer);
  if (denied) return denied;
  if (!file) return { ok: false, status: 400, message: "사진 파일을 골라 주세요." };
  const processed = await processProfilePhoto(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return { ok: false, status: 400, message: processed.message };

  const next = await deps.admin.rpc("creator_photo_next", { p_profile_id: deps.viewer!.userId });
  if (next.error) throw new Error(`사진 판을 읽지 못했다: ${next.error.code}`);
  const slot = nextSchema.parse(next.data)[0];
  if (!slot) return { ok: false, status: 403, message: "크리에이터 정보를 찾지 못했어요." };

  const path = `${slot.creator_id}/${slot.next_version}.webp`;
  const up = await deps.admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, processed.webp, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up.error) return { ok: false, status: 409, message: "다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요." };

  const set = await deps.admin.rpc("set_creator_photo", { p_profile_id: deps.viewer!.userId, p_version: slot.next_version });
  if (set.error) {
    await deps.admin.storage.from(PHOTO_BUCKET).remove([path]);
    if (set.error.code === "40001") return { ok: false, status: 409, message: "다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요." };
    throw new Error(`사진 판을 저장하지 못했다: ${set.error.code}`);
  }
  await removeOld(deps.admin, set.data);
  return { ok: true, photoPath: path };
}

export async function removeCreatorPhoto(deps: PhotoDeps): Promise<PhotoResult> {
  const denied = photoGate(deps.viewer);
  if (denied) return denied;
  const set = await deps.admin.rpc("set_creator_photo", { p_profile_id: deps.viewer!.userId, p_version: null });
  if (set.error) {
    if (set.error.code === "P0002") return { ok: false, status: 403, message: "크리에이터 정보를 찾지 못했어요." };
    throw new Error(`사진을 지우지 못했다: ${set.error.code}`);
  }
  await removeOld(deps.admin, set.data);
  return { ok: true, photoPath: null };
}
