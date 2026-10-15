import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { FAN_IMAGE_PREFIX, FAN_PHOTO_BUCKET, type FanImageKind } from "@/entities/fan/model/fan-profile";
import type { Viewer } from "@/entities/session/model/viewer";
import { PHOTO_PROBLEM_MESSAGE } from "@/shared/lib/image/photo-problem";
import { reencodePhoto, type Reencode } from "@/shared/lib/image/reencode-photo";
import { sweepOlderVersions, uploadVersioned } from "@/shared/api/storage/versioned-upload";

// 팬 프로필 사진·배경 사진 저장·지우기 (my-account INV-A14). 팬 사진 저장소에 쓰는 길은 이것 하나다.
// - 사람은 세션에서 확인한 사람(viewer)이고, 팬만. 저장소 쓰기는 서버의 비밀 키 클라이언트로만 한다 —
//   저장소(fan-photos, 공개 읽기)에는 화면 쪽 키의 쓰기·고치기·지우기 정책이 없다.
// - 받은 바이트를 열어 보고(JPG·PNG·WebP, 10MB, 4천만 화소) 사진 정보를 모두 지운 뒤 정해진 크기로 다시 그려 webp 로만 저장한다(reencodePhoto).
//   원본은 저장하지 않는다. 사진은 가운데 정사각 512, 배경 사진은 긴 변 1280(작은 사진은 키우지 않음).
// - 판 번호는 DB 가 정한다(fan_image_next → 그 판으로 올림 → set_fan_image, 둘 다 비밀 키로만). 경로 {세션의 계정 ID}/p-{판}.webp · /bg-{판}.webp.
//   올리기·붙이기는 크리에이터 사진과 같은 공용 흐름(shared/api/storage/versioned-upload)이다 — 「이미 있음」은 409, 그 밖의 올리기 오류는 500.
//   붙지 못하고 남은 오래된 파일이 다음 판 자리를 막고 있으면 지우고 한 번 다시 올린다.
// - 붙인 뒤(또는 뗀 뒤) 그 사람 폴더에서 붙은 판보다 작은 판의 파일을 모두 지운다 — 옛 파일 지우기가 한 번 실패해도
//   다음 저장·지우기 때 다시 걸려 지워진다(실패는 기록으로 남긴다).

export type FanImageDeps = { admin: Pick<SupabaseClient, "rpc" | "storage">; viewer: Viewer | null; now?: () => number };

type FanImageFailure = { ok: false; status: 400 | 401 | 403 | 409; message: string };
export type FanImageResult = { ok: true; path: string | null } | FanImageFailure;

const LABEL: Record<FanImageKind, string> = { photo: "프로필 사진", background: "배경 사진" };

/** 저장 크기 — 프로필 사진 한 변·배경 사진 긴 변. */
export const FAN_PHOTO_SIDE = 512;
export const FAN_BACKGROUND_LONG_SIDE = 1280;

const SIZE: Record<FanImageKind, Reencode> = {
  photo: { kind: "square", side: FAN_PHOTO_SIDE },
  background: { kind: "fit", longSide: FAN_BACKGROUND_LONG_SIDE },
};

const BUSY: FanImageFailure = { ok: false, status: 409, message: "다른 곳에서 사진을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요." };
const NO_FAN: FanImageFailure = { ok: false, status: 403, message: "팬 정보를 찾지 못했어요." };

/** 다음 판 번호 — 팬 계정이 아니면 null. */
const nextSchema = z.number().int().positive().nullable();

/** 팬 사진을 바꿀 수 있는 사람인가 — 로그인한 팬만. 라우트가 본문(파일)을 읽기 전에 먼저 부르고, 저장·지우기도 다시 부른다. */
export function fanImageGate(viewer: Viewer | null): FanImageResult | null {
  if (!viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (viewer.role !== "fan") return { ok: false, status: 403, message: "팬 계정만 팬 프로필 사진을 바꿀 수 있어요." };
  return null;
}

async function nextVersion(deps: FanImageDeps, userId: string, kind: FanImageKind): Promise<number | null> {
  const next = await deps.admin.rpc("fan_image_next", { p_profile_id: userId, p_kind: kind });
  if (next.error) throw new Error(`${LABEL[kind]} 판을 읽지 못했다: ${next.error.code}`);
  return nextSchema.parse(next.data);
}

/** 그 사람 폴더에서 keepFrom 보다 작은 판의 파일(과 DB 가 돌려준 옛 경로)을 지운다. 실패는 기록만 — 다음에 다시 걸린다. */
function sweep(deps: FanImageDeps, userId: string, kind: FanImageKind, keepFrom: number, oldPath: unknown): Promise<void> {
  return sweepOlderVersions(deps.admin.storage, FAN_PHOTO_BUCKET, { folder: userId, prefix: FAN_IMAGE_PREFIX[kind], keepFrom, alsoRemove: oldPath });
}

export async function saveFanImage(deps: FanImageDeps, kind: FanImageKind, file: Blob | null): Promise<FanImageResult> {
  const denied = fanImageGate(deps.viewer);
  if (denied) return denied;
  if (!file) return { ok: false, status: 400, message: PHOTO_PROBLEM_MESSAGE.empty };
  const processed = await reencodePhoto(new Uint8Array(await file.arrayBuffer()), SIZE[kind]);
  if (!processed.ok) return { ok: false, status: 400, message: PHOTO_PROBLEM_MESSAGE[processed.problem] };

  // 파일 자리는 세션의 계정 ID 로 정한다 — 본인 파일만 바뀐다
  const userId = deps.viewer!.userId;
  const r = await uploadVersioned<FanImageFailure>(deps.admin.storage, processed.webp, {
    bucket: FAN_PHOTO_BUCKET,
    label: LABEL[kind],
    next: async () => {
      const version = await nextVersion(deps, userId, kind);
      return version === null ? null : { ownerId: userId, version };
    },
    pathOf: (ownerId, version) => `${ownerId}/${FAN_IMAGE_PREFIX[kind]}${version}.webp`,
    attach: (version) => deps.admin.rpc("set_fan_image", { p_profile_id: userId, p_kind: kind, p_version: version }),
    busy: BUSY,
    noOwner: NO_FAN,
    refusals: { P0002: NO_FAN },
    now: deps.now,
  });
  if (!r.ok) return r;
  await sweep(deps, userId, kind, r.version, r.attached);
  return { ok: true, path: r.path };
}

export async function removeFanImage(deps: FanImageDeps, kind: FanImageKind): Promise<FanImageResult> {
  const denied = fanImageGate(deps.viewer);
  if (denied) return denied;
  const userId = deps.viewer!.userId;
  const set = await deps.admin.rpc("set_fan_image", { p_profile_id: userId, p_kind: kind, p_version: null });
  if (set.error) {
    if (set.error.code === "P0002") return NO_FAN;
    throw new Error(`${LABEL[kind]}을 지우지 못했다: ${set.error.code}`);
  }
  // 뗀 뒤의 다음 판보다 작은 판은 모두 쓸 일이 없다 — 이보다 늦게 시작한 저장은 더 큰 판을 쓴다
  const keepFrom = await nextVersion(deps, userId, kind);
  await sweep(deps, userId, kind, keepFrom ?? 0, set.data);
  return { ok: true, path: null };
}

/** 주소로 들어온 사진 종류 — 두 값 밖이면 null. */
export function parseFanImageKind(raw: string): FanImageKind | null {
  return raw === "photo" || raw === "background" ? raw : null;
}
