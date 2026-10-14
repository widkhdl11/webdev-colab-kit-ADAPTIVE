import { z } from "zod";
import type { PreviewPick } from "@/entities/creator/model/link-images";
import { PHOTO_PROBLEM_MESSAGE } from "@/shared/lib/image/photo-problem";
import { reencodePhoto, type Reencode } from "@/shared/lib/image/reencode-photo";
import { NO_CREATOR, photoGate, removeOldFile, uploadVersioned, type PhotoDeps, type PhotoFailure, type PhotoWhat } from "./photo-slot";
import { PHOTO_SIDE } from "./process-photo";

// 프로필 배경사진·팬덤 심볼 저장·지우기 (creator-link INV-E1·E9·E12, 「내 팬꾹 꾸미기」). 사람 확인·판 번호·올리기·붙이기·옛 파일 지우기는
// 프로필 사진과 같은 공용 흐름(photo-slot)을 따른다.
// - 받은 바이트를 열어 보고 사진 정보를 지운 뒤 다시 굽는다(reencodePhoto). 배경사진은 비율을 두고 긴 변만 줄이고, 심볼은 가운데 정사각으로 자른다.
//   원본은 저장하지 않는다.
// - 경로({크리에이터 ID}/bg-{판}.webp · /sym-{판}.webp)의 판은 DB 가 정한다(creator_image_next · set_creator_image — 비밀 키로만 부른다).
// - 심볼은 권리 확인 체크가 있는 요청만 받는다(INV-E12) — 여기서 먼저 거르고, DB 함수도 체크 없이는 붙이지 않는다(체크 시각은 DB 가 남긴다).
// - 붙이거나 뗀 뒤의 미리보기 고르기를 DB 가 돌려준다 — 심볼을 떼면 DB 가 프로필 사진으로 되돌리므로 화면은 이 값을 받아 쓴다(INV-E10).

export type CreatorImageKind = "background" | "symbol";

/** 배경사진 긴 변 — 링크 페이지 맨 위·공지 이미지 위쪽에 쓴다. 공지 이미지 가장 큰 폭(1200)을 덮는다. */
export const BACKGROUND_LONG_SIDE = 1280;

const SIZE: Record<CreatorImageKind, Reencode> = {
  background: { kind: "fit", longSide: BACKGROUND_LONG_SIDE },
  symbol: { kind: "square", side: PHOTO_SIDE },
};

const FILE_PREFIX: Record<CreatorImageKind, string> = { background: "bg-", symbol: "sym-" };

/** 사진 종류의 이름 — 거부 문구에 쓴다. */
export const IMAGE_LABEL: Record<CreatorImageKind, PhotoWhat> = { background: "배경사진", symbol: "팬덤 심볼" };

export type ImageResult = { ok: true; path: string | null; previewPick: PreviewPick } | PhotoFailure;

/** 심볼 권리 확인 체크가 없을 때의 문구(INV-E12). */
export const SYMBOL_RIGHTS_REQUIRED = "「내가 만들었거나 쓸 권리가 있는 이미지예요」에 체크해야 올릴 수 있어요.";

const RIGHTS_REFUSED: PhotoFailure = { ok: false, status: 400, message: SYMBOL_RIGHTS_REQUIRED };

const attachedSchema = z.array(z.object({ old_path: z.string().nullable(), preview_pick: z.enum(["photo", "symbol"]) })).length(1);

function readAttached(data: unknown): { oldPath: string | null; previewPick: PreviewPick } {
  const [row] = attachedSchema.parse(data);
  return { oldPath: row!.old_path, previewPick: row!.preview_pick };
}

export async function saveCreatorImage(
  deps: PhotoDeps,
  kind: CreatorImageKind,
  file: Blob | null,
  opts: { rightsChecked: boolean },
): Promise<ImageResult> {
  const denied = photoGate(deps.viewer, IMAGE_LABEL[kind]);
  if (denied) return denied;
  if (kind === "symbol" && !opts.rightsChecked) return RIGHTS_REFUSED;
  if (!file) return { ok: false, status: 400, message: "사진 파일을 골라 주세요." };
  const processed = await reencodePhoto(new Uint8Array(await file.arrayBuffer()), SIZE[kind]);
  if (!processed.ok) return { ok: false, status: 400, message: PHOTO_PROBLEM_MESSAGE[processed.problem] };

  const userId = deps.viewer!.userId;
  const r = await uploadVersioned(deps.admin, processed.webp, {
    what: IMAGE_LABEL[kind],
    next: () => deps.admin.rpc("creator_image_next", { p_profile_id: userId, p_kind: kind }),
    pathOf: (creatorId, version) => `${creatorId}/${FILE_PREFIX[kind]}${version}.webp`,
    attach: (version) => deps.admin.rpc("set_creator_image", { p_profile_id: userId, p_kind: kind, p_version: version, p_rights_checked: opts.rightsChecked }),
    refusals: { P0095: RIGHTS_REFUSED },
  });
  if (!r.ok) return r;
  const after = readAttached(r.attached);
  await removeOldFile(deps.admin, after.oldPath);
  return { ok: true, path: r.path, previewPick: after.previewPick };
}

export async function removeCreatorImage(deps: PhotoDeps, kind: CreatorImageKind): Promise<ImageResult> {
  const denied = photoGate(deps.viewer, IMAGE_LABEL[kind]);
  if (denied) return denied;
  const set = await deps.admin.rpc("set_creator_image", { p_profile_id: deps.viewer!.userId, p_kind: kind, p_version: null, p_rights_checked: false });
  if (set.error) {
    if (set.error.code === "P0002") return NO_CREATOR;
    throw new Error(`${IMAGE_LABEL[kind]}을 지우지 못했다: ${set.error.code}`);
  }
  const after = readAttached(set.data);
  await removeOldFile(deps.admin, after.oldPath);
  return { ok: true, path: null, previewPick: after.previewPick };
}

/** 주소로 들어온 사진 종류 — 두 값 밖이면 null. */
export function parseImageKind(raw: string): CreatorImageKind | null {
  return raw === "background" || raw === "symbol" ? raw : null;
}
