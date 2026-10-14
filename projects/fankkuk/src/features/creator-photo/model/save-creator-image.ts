import { z } from "zod";
import { PHOTO_BUCKET } from "@/entities/creator/model/link-images";
import { PHOTO_PROBLEM_MESSAGE } from "@/shared/lib/image/photo-problem";
import { reencodePhoto, type Reencode } from "@/shared/lib/image/reencode-photo";
import { PHOTO_SIDE } from "./process-photo";
import { photoGate, type PhotoDeps } from "./save-creator-photo";

// 프로필 배경사진·팬덤 심볼 저장·지우기 (creator-link INV-E1·E9·E12, 「내 팬꾹 꾸미기」). 프로필 사진(save-creator-photo)과 같은 경로를 따른다.
// - 사람은 세션에서 확인한 사람(viewer)이고, 크리에이터만. 저장소 쓰기는 서버의 비밀 키 클라이언트로만 한다(저장소에 쓰기 정책 없음).
// - 받은 바이트를 열어 보고 사진 정보를 지운 뒤 다시 굽는다(reencodePhoto). 배경사진은 비율을 두고 긴 변만 줄이고, 심볼은 가운데 정사각으로 자른다.
//   원본은 저장하지 않는다.
// - 판 번호와 경로({크리에이터 ID}/bg-{판}.webp · /sym-{판}.webp)는 DB 가 정한다(creator_image_next · set_creator_image — 비밀 키로만 부른다).
//   같은 판으로 두 번 올리면 저장소가 덮어쓰지 않고 거부한다(upsert 끔).
// - 심볼은 권리 확인 체크가 있는 요청만 받는다(INV-E12) — 여기서 먼저 거르고, DB 함수도 체크 없이는 붙이지 않는다(체크 시각은 DB 가 남긴다).
// - 새 파일이 붙은 뒤에 옛 파일을 지운다. 붙이지 못하면 방금 올린 파일을 지운다.

export type CreatorImageKind = "background" | "symbol";

/** 배경사진 긴 변 — 링크 페이지 맨 위·공지 이미지 위쪽에 쓴다. 공지 이미지 가장 큰 폭(1200)을 덮는다. */
export const BACKGROUND_LONG_SIDE = 1280;

const SIZE: Record<CreatorImageKind, Reencode> = {
  background: { kind: "fit", longSide: BACKGROUND_LONG_SIDE },
  symbol: { kind: "square", side: PHOTO_SIDE },
};

const FILE_PREFIX: Record<CreatorImageKind, string> = { background: "bg-", symbol: "sym-" };

const LABEL: Record<CreatorImageKind, string> = { background: "배경사진", symbol: "팬덤 심볼" };

export type ImageResult = { ok: true; path: string | null } | { ok: false; status: 400 | 401 | 403 | 409; message: string };

const nextSchema = z.array(z.object({ creator_id: z.guid(), next_version: z.number().int().positive() }));

const BUSY = "다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요.";

/** 심볼 권리 확인 체크가 없을 때의 문구(INV-E12). */
export const SYMBOL_RIGHTS_REQUIRED = "「내가 만들었거나 쓸 권리가 있는 이미지예요」에 체크해야 올릴 수 있어요.";

async function removeOld(admin: PhotoDeps["admin"], oldPath: unknown): Promise<void> {
  if (typeof oldPath !== "string" || oldPath === "") return;
  const { error } = await admin.storage.from(PHOTO_BUCKET).remove([oldPath]);
  // 지우지 못해도 새 사진은 이미 붙었다 — 남은 파일은 공개 화면이 가리키지 않는다. 기록만 남긴다(경로에 개인정보 없음)
  if (error) console.error("creator-image: 옛 파일을 지우지 못했다", oldPath);
}

export async function saveCreatorImage(
  deps: PhotoDeps,
  kind: CreatorImageKind,
  file: Blob | null,
  opts: { rightsChecked: boolean },
): Promise<ImageResult> {
  const denied = photoGate(deps.viewer);
  if (denied) return denied;
  if (kind === "symbol" && !opts.rightsChecked) return { ok: false, status: 400, message: SYMBOL_RIGHTS_REQUIRED };
  if (!file) return { ok: false, status: 400, message: "사진 파일을 골라 주세요." };
  const processed = await reencodePhoto(new Uint8Array(await file.arrayBuffer()), SIZE[kind]);
  if (!processed.ok) return { ok: false, status: 400, message: PHOTO_PROBLEM_MESSAGE[processed.problem] };

  const next = await deps.admin.rpc("creator_image_next", { p_profile_id: deps.viewer!.userId, p_kind: kind });
  if (next.error) throw new Error(`${LABEL[kind]} 판을 읽지 못했다: ${next.error.code}`);
  const slot = nextSchema.parse(next.data)[0];
  if (!slot) return { ok: false, status: 403, message: "크리에이터 정보를 찾지 못했어요." };

  const path = `${slot.creator_id}/${FILE_PREFIX[kind]}${slot.next_version}.webp`;
  const up = await deps.admin.storage
    .from(PHOTO_BUCKET)
    .upload(path, processed.webp, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (up.error) return { ok: false, status: 409, message: BUSY };

  const set = await deps.admin.rpc("set_creator_image", {
    p_profile_id: deps.viewer!.userId,
    p_kind: kind,
    p_version: slot.next_version,
    p_rights_checked: opts.rightsChecked,
  });
  if (set.error) {
    await deps.admin.storage.from(PHOTO_BUCKET).remove([path]);
    if (set.error.code === "40001") return { ok: false, status: 409, message: BUSY };
    if (set.error.code === "P0095") return { ok: false, status: 400, message: SYMBOL_RIGHTS_REQUIRED };
    throw new Error(`${LABEL[kind]} 판을 저장하지 못했다: ${set.error.code}`);
  }
  await removeOld(deps.admin, set.data);
  return { ok: true, path };
}

export async function removeCreatorImage(deps: PhotoDeps, kind: CreatorImageKind): Promise<ImageResult> {
  const denied = photoGate(deps.viewer);
  if (denied) return denied;
  const set = await deps.admin.rpc("set_creator_image", { p_profile_id: deps.viewer!.userId, p_kind: kind, p_version: null, p_rights_checked: false });
  if (set.error) {
    if (set.error.code === "P0002") return { ok: false, status: 403, message: "크리에이터 정보를 찾지 못했어요." };
    throw new Error(`${LABEL[kind]}을(를) 지우지 못했다: ${set.error.code}`);
  }
  await removeOld(deps.admin, set.data);
  return { ok: true, path: null };
}

/** 주소로 들어온 사진 종류 — 두 값 밖이면 null. */
export function parseImageKind(raw: string): CreatorImageKind | null {
  return raw === "background" || raw === "symbol" ? raw : null;
}
