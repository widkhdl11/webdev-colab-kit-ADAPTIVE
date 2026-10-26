import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PHOTO_BUCKET } from "@/entities/creator/model/link-images";
import type { Viewer } from "@/entities/session/model/viewer";
import { uploadVersioned as uploadVersionedFile, type RpcReply } from "@/shared/api/storage/versioned-upload";

// 크리에이터 사진 파일(프로필 사진·배경사진·팬덤 심볼)을 판 번호로 올리고 붙이는 흐름 (creator-link INV-E1·E9).
// - 사람은 세션에서 확인한 사람(viewer — 로그인 토큰을 Auth 서버가 확인한 ID)이고, 크리에이터만.
// - 저장소 쓰기는 서버의 비밀 키 클라이언트로만 한다 — 저장소에는 쓰기 정책이 없어 화면 쪽 키로는 못 쓴다.
// - 판 번호·올리기·붙이기·남은 파일 치우기는 공용 흐름(shared/api/storage/versioned-upload)을 따른다 — 팬 프로필 사진과 같다.
//   「이미 있음」은 409(다른 곳에서 바꾸는 중), 그 밖의 올리기 오류는 던져서 라우트가 500 으로 답한다.
// - 새 파일이 붙은 뒤에 옛 파일을 지운다. 붙이지 못하면 방금 올린 파일을 지운다.

export type PhotoDeps = { admin: Pick<SupabaseClient, "rpc" | "storage">; viewer: Viewer | null; now?: () => number };

export type PhotoFailure = { ok: false; status: 400 | 401 | 403 | 409; message: string };

/** 무엇을 바꾸는지 — 거부 문구에 쓴다. */
export type PhotoWhat = "프로필 사진" | "배경사진" | "팬마크";

export const PHOTO_BUSY = "다른 화면에서 사진 변경을 진행 중입니다. 잠시 후 다시 시도해 주세요.";
export const NO_CREATOR: PhotoFailure = { ok: false, status: 403, message: "크리에이터 정보를 찾을 수 없습니다." };
const BUSY: PhotoFailure = { ok: false, status: 409, message: PHOTO_BUSY };

const nextSchema = z.array(z.object({ creator_id: z.guid(), next_version: z.number().int().positive() }));

/** 사진을 바꿀 수 있는 사람인가 — 로그인한 크리에이터만. 라우트가 본문(파일)을 읽기 전에 먼저 부르고, 저장·지우기도 다시 부른다. */
export function photoGate(viewer: Viewer | null, what: PhotoWhat): PhotoFailure | null {
  if (!viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (viewer.role !== "creator") return { ok: false, status: 403, message: `크리에이터 계정만 ${what}${what === "팬마크" ? "를" : "을"} 변경할 수 있습니다.` };
  return null;
}

/** 옛 파일을 지운다. 지우지 못해도 새 파일은 이미 붙었다 — 남은 파일은 공개 화면이 가리키지 않는다. 기록만 남긴다(경로에 개인정보 없음). */
export async function removeOldFile(admin: PhotoDeps["admin"], oldPath: unknown): Promise<void> {
  if (typeof oldPath !== "string" || oldPath === "") return;
  const { error } = await admin.storage.from(PHOTO_BUCKET).remove([oldPath]);
  if (error) console.error("creator-photo: 옛 파일을 지우지 못했다", oldPath);
}

export type VersionedUpload = {
  what: PhotoWhat;
  /** 다음 판 번호와 크리에이터 ID 를 읽는 DB 함수 호출 */
  next: () => PromiseLike<RpcReply>;
  /** 판으로 저장소 경로를 만든다 */
  pathOf: (creatorId: string, version: number) => string;
  /** 그 판을 붙이는 DB 함수 호출 */
  attach: (version: number) => PromiseLike<RpcReply>;
  /** 붙이기 오류 코드 가운데 사용자에게 알릴 것(40001 = 다른 요청이 먼저 바꿈은 기본으로 들어 있다) */
  refusals?: Readonly<Record<string, PhotoFailure>>;
};

/** 다시 구운 webp 를 새 판으로 올리고 붙인다. 붙인 뒤 DB 가 돌려준 값(data)과 새 경로를 준다 — 옛 파일 지우기는 부른 쪽이 그 값으로 한다. */
export async function uploadVersioned(
  admin: PhotoDeps["admin"],
  webp: Buffer,
  u: VersionedUpload,
  now?: () => number,
): Promise<{ ok: true; path: string; attached: unknown } | PhotoFailure> {
  const r = await uploadVersionedFile<PhotoFailure>(admin.storage, webp, {
    bucket: PHOTO_BUCKET,
    label: u.what,
    next: async () => {
      const next = await u.next();
      if (next.error) throw new Error(`${u.what} 판을 읽지 못했다: ${next.error.code}`);
      const slot = nextSchema.parse(next.data)[0];
      return slot ? { ownerId: slot.creator_id, version: slot.next_version } : null;
    },
    pathOf: u.pathOf,
    attach: u.attach,
    busy: BUSY,
    noOwner: NO_CREATOR,
    refusals: u.refusals,
    now,
  });
  return r.ok ? { ok: true, path: r.path, attached: r.attached } : r;
}
