import { NO_CREATOR, photoGate, removeOldFile, uploadVersioned, type PhotoDeps, type PhotoFailure } from "./photo-slot";
import { processProfilePhoto } from "./process-photo";

// 프로필 사진 저장·지우기 (creator-link INV-E1·E9). 사진 저장소에 쓰는 길은 이것과 배경사진·심볼(save-creator-image) 둘이다.
// 사람 확인·판 번호·올리기·붙이기·옛 파일 지우기는 공용 흐름(photo-slot)을 따른다. 경로는 {크리에이터 ID}/{판}.webp —
// 판은 DB 가 정한다(creator_photo_next · set_creator_photo — 비밀 키로만 부른다).

export type PhotoResult = { ok: true; photoPath: string | null } | PhotoFailure;

export async function saveCreatorPhoto(deps: PhotoDeps, file: Blob | null): Promise<PhotoResult> {
  const denied = photoGate(deps.viewer, "프로필 사진");
  if (denied) return denied;
  if (!file) return { ok: false, status: 400, message: "사진 파일을 선택해 주세요." };
  const processed = await processProfilePhoto(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return { ok: false, status: 400, message: processed.message };

  const userId = deps.viewer!.userId;
  const r = await uploadVersioned(deps.admin, processed.webp, {
    what: "프로필 사진",
    next: () => deps.admin.rpc("creator_photo_next", { p_profile_id: userId }),
    pathOf: (creatorId, version) => `${creatorId}/${version}.webp`,
    attach: (version) => deps.admin.rpc("set_creator_photo", { p_profile_id: userId, p_version: version }),
  }, deps.now);
  if (!r.ok) return r;
  await removeOldFile(deps.admin, r.attached);
  return { ok: true, photoPath: r.path };
}

export async function removeCreatorPhoto(deps: PhotoDeps): Promise<PhotoResult> {
  const denied = photoGate(deps.viewer, "프로필 사진");
  if (denied) return denied;
  const set = await deps.admin.rpc("set_creator_photo", { p_profile_id: deps.viewer!.userId, p_version: null });
  if (set.error) {
    if (set.error.code === "P0002") return NO_CREATOR;
    throw new Error(`사진을 지우지 못했다: ${set.error.code}`);
  }
  await removeOldFile(deps.admin, set.data);
  return { ok: true, photoPath: null };
}
