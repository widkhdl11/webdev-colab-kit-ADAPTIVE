import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BANNER_BUCKET } from "@/entities/banner/model/banner";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { reencodePhoto } from "@/shared/lib/image/reencode-photo";
import { BANNER_IMAGE_MAX_BYTES, BANNER_IMAGE_MESSAGE } from "./banner-image";
import { bannerInputProblem } from "./banner-input";
import { BANNER_MESSAGES } from "./banner-messages";

// 광고 배너 만들기·고치기·그림 바꾸기·순서·내리기 (docs/specs/banners.md INV-Y1·Y3·Y4·Y6·Y10). 운영자(대표·직원)면 누구나 한다.
// - INV-Y1: 운영자 확인을 맨 먼저 한다(올린 파일을 열기 전에). 아니면 404. DB 함수도 같은 토큰의 사람으로 다시 판정한다.
// - DB 쓰기는 로그인한 운영자의 세션 클라이언트로 — 기록(INV-Y10)에 그 사람이 남는다. 저장소 쓰기만 서버의 비밀 키로(INV-Y4 —
//   저장소에 화면 쪽 키의 쓰기 정책이 없다).
// - INV-Y3·Y6: 링크·글자 수를 여기서 먼저 보고(entities 의 같은 검사), DB 제약이 저장 경계에서 다시 본다.
// - INV-Y4: 그림은 열어 보고(PNG·JPG, 5MB) 사진 정보를 지운 뒤 긴 변 512 로 다시 그려 WebP 로만 저장한다. 이름은 서버가 정한다 —
//   b- + 짐작할 수 없는 32자(crypto 난수). 그림 검사는 DB 를 바꾸기 전에 끝낸다 — 거부되면 배너는 그대로다.
//   그림을 바꾸면 옛 파일을, 내리면 그 파일을 지운다. 지우기가 실패하면 기록만 남긴다(이름을 짐작할 수 없어 열리지 않는다).

export type BannerDeps = { session: Pick<SupabaseClient, "rpc">; storage: Pick<SupabaseClient["storage"], "from"> };

/** 다시 그릴 크기 — 긴 변(화면에서 가장 크게 180 으로 보인다. 선명한 화면의 두 배 넘게) */
export const BANNER_IMAGE_LONG_SIDE = 512;

const NOT_FOUND: JsonReply = { status: 404, body: { message: MESSAGE_NOT_FOUND } };

const inputShape = z
  .object({
    id: z.string().uuid().nullable(),
    title: z.string().transform((v) => v.trim()),
    description: z.string().transform((v) => v.trim()),
    link: z.string().transform((v) => v.trim()),
    isAd: z.boolean(),
    startsOn: z.string(),
    endsOn: z.string().nullable(),
  })
  .strict();

export type BannerInput = z.input<typeof inputShape>;

/** 운영자가 아니면 404 응답, 맞으면 null. 라우트가 본문(파일)을 읽기 전에 부른다. */
export async function bannerGate(session: Pick<SupabaseClient, "rpc">): Promise<JsonReply | null> {
  return (await readAdminAccess(session)) === "not_found" ? NOT_FOUND : null;
}

function newImagePath(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `b-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}.webp`;
}

async function removeFiles(deps: BannerDeps, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const r = await deps.storage.from(BANNER_BUCKET).remove([...paths]);
  if (r.error) console.error("banner: 그림 파일을 지우지 못했다", r.error.name);
}

/** 그림을 열어 보고 다시 그린다. 실패면 400 응답 */
async function processImage(image: Blob): Promise<{ ok: true; webp: Buffer } | { ok: false; reply: JsonReply }> {
  if (image.size > BANNER_IMAGE_MAX_BYTES) return { ok: false, reply: { status: 400, body: { message: BANNER_IMAGE_MESSAGE.too_large_file, field: "image" } } };
  const r = await reencodePhoto(new Uint8Array(await image.arrayBuffer()), { kind: "fit", longSide: BANNER_IMAGE_LONG_SIDE }, { maxBytes: BANNER_IMAGE_MAX_BYTES, formats: ["jpeg", "png"] });
  return r.ok ? { ok: true, webp: r.webp } : { ok: false, reply: { status: 400, body: { message: BANNER_IMAGE_MESSAGE[r.problem], field: "image" } } };
}

async function upload(deps: BannerDeps, webp: Buffer): Promise<string> {
  const path = newImagePath();
  const r = await deps.storage.from(BANNER_BUCKET).upload(path, webp, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
  if (r.error) throw new Error(`배너 그림을 올리지 못했다: ${r.error.name}`);
  return path;
}

/** 만들기(id null — 그림 필수) · 고치기(id — 그림은 고를 때만 바꾼다). */
export async function saveBanner(deps: BannerDeps, input: unknown, image: Blob | null): Promise<JsonReply> {
  const denied = await bannerGate(deps.session);
  if (denied) return denied;
  const shaped = inputShape.safeParse(input);
  if (!shaped.success) return { status: 400, body: { message: BANNER_MESSAGES.text } };
  const v = shaped.data;
  const problem = bannerInputProblem(v);
  if (problem) return { status: 400, body: problem };
  if (v.id === null && !image) return { status: 400, body: { message: BANNER_IMAGE_MESSAGE.empty, field: "image" } };

  // 그림 검사는 DB 를 바꾸기 전에 — 거부되면 배너는 그대로
  let webp: Buffer | null = null;
  if (image) {
    const processed = await processImage(image);
    if (!processed.ok) return processed.reply;
    webp = processed.webp;
  }

  const fields = { p_title: v.title, p_description: v.description, p_link: v.link, p_is_ad: v.isAd, p_starts_on: v.startsOn, p_ends_on: v.endsOn };

  if (v.id === null) {
    const path = await upload(deps, webp!);
    const { data, error } = await deps.session.rpc("admin_save_banner", { p_id: null, ...fields, p_image_path: path });
    if (error) {
      await removeFiles(deps, [path]);
      return pgErrorReply(error.code, BANNER_MESSAGES);
    }
    return { status: 200, body: { ok: true, id: typeof data === "string" ? data : null } };
  }

  const saved = await deps.session.rpc("admin_save_banner", { p_id: v.id, ...fields, p_image_path: null });
  if (saved.error) return pgErrorReply(saved.error.code, BANNER_MESSAGES);
  if (webp) {
    const path = await upload(deps, webp);
    const swapped = await deps.session.rpc("admin_set_banner_image", { p_id: v.id, p_image_path: path });
    if (swapped.error) {
      await removeFiles(deps, [path]);
      return pgErrorReply(swapped.error.code, BANNER_MESSAGES);
    }
    if (typeof swapped.data === "string") await removeFiles(deps, [swapped.data]);
  }
  return { status: 200, body: { ok: true, id: v.id } };
}

const idShape = z.object({ id: z.string().uuid() }).strict();

/** 내리기 — 배너를 지우고 그 그림 파일도 지운다. 기록은 DB 가 남긴다. */
export async function removeBanner(deps: BannerDeps, body: unknown): Promise<JsonReply> {
  const denied = await bannerGate(deps.session);
  if (denied) return denied;
  const shaped = idShape.safeParse(body);
  if (!shaped.success) return NOT_FOUND;
  const { data, error } = await deps.session.rpc("admin_remove_banner", { p_id: shaped.data.id });
  if (error) return pgErrorReply(error.code, BANNER_MESSAGES);
  if (typeof data === "string") await removeFiles(deps, [data]);
  return { status: 200, body: { ok: true } };
}

const orderShape = z
  .object({ ids: z.array(z.string().uuid()).min(1).max(200) })
  .strict()
  .refine((v) => new Set(v.ids).size === v.ids.length);

/** 순서 정하기 — 받은 id 순서대로 1, 2, 3 … (INV-Y8) */
export async function orderBanners(session: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const denied = await bannerGate(session);
  if (denied) return denied;
  const shaped = orderShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: BANNER_MESSAGES.failed } };
  const { error } = await session.rpc("admin_set_banner_order", { p_ids: shaped.data.ids });
  if (error) return pgErrorReply(error.code, BANNER_MESSAGES);
  return { status: 200, body: { ok: true } };
}
