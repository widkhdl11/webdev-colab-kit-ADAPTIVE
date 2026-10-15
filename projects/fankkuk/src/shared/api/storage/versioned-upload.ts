import type { SupabaseClient } from "@supabase/supabase-js";

// 판 번호로 파일을 올리고 붙이는 공용 흐름 — 사진을 판 번호로 저장하는 기능들이 같이 쓴다(버킷·판 함수·거부 문구는 부른 쪽이 넘긴다).
// - 판 번호는 DB 가 정한다(「다음 판」 함수 → 그 판으로 올림 → 「붙이기」 함수). 같은 판으로 두 번 올리면 저장소가 덮어쓰지 않고 거부한다(upsert 끔).
// - 「이미 있음」으로 거부됐는데 그 파일이 STALE_MS 보다 오래됐으면, 앞서 붙이지 못하고 지우지도 못한 채 남은 파일이다 — 지우고 한 번 다시 올린다.
//   방금 생긴 파일이면 다른 요청이 같은 판을 올리는 중이다 — 건드리지 않고 busy 로 돌려준다(그 요청이 붙이거나 스스로 지운다).
//   이것이 없으면 남은 파일 하나 때문에 그 사람은 사진을 영영 못 바꾼다(다음 판이 늘 같은 번호라서).
// - 「이미 있음」이 아닌 올리기 오류는 던진다 — 부른 쪽 라우트가 500 일반 문구로 답한다.
// - 붙이지 못하면 방금 올린 파일을 지운다. 그것도 못 지우면 기록만 남긴다 — 다음 올리기가 위의 「오래된 남은 파일」로 치운다.
// 거부 문구(busy·주인 없음·붙이기 거부)는 부른 쪽이 정해 넘긴다 — 이 파일은 사람 말(도메인 문구)을 갖지 않는다.

type Storage = Pick<SupabaseClient, "storage">["storage"];

export type RpcReply = { data: unknown; error: { code: string } | null };

/** 남은 파일로 보는 나이 — 이보다 오래된 「이미 있음」 파일은 붙지 못한 채 남은 것이다. 올리기·붙이기 한 번은 이보다 훨씬 짧다. */
export const STALE_MS = 60_000;

export type VersionedUpload<F> = {
  bucket: string;
  /** 던지는 오류 문장에 쓰는 이름 */
  label: string;
  /** 다음 판 번호와 주인 ID — 주인이 아니면 null */
  next: () => Promise<{ ownerId: string; version: number } | null>;
  /** 판으로 저장소 경로를 만든다 */
  pathOf: (ownerId: string, version: number) => string;
  /** 그 판을 붙이는 DB 함수 호출 */
  attach: (version: number) => PromiseLike<RpcReply>;
  /** 다른 요청이 먼저 바꿈(40001)·같은 판을 올리는 중 */
  busy: F;
  /** 다음 판 함수가 주인을 못 찾음 */
  noOwner: F;
  /** 붙이기 오류 코드 가운데 사용자에게 알릴 것 */
  refusals?: Readonly<Record<string, F>>;
  /** 지금 시각(밀리초) — 시험이 바꾼다 */
  now?: () => number;
};

export type VersionedUploadResult<F> = { ok: true; path: string; version: number; attached: unknown } | F;

/** 저장소의 「이미 있음」 거부인가. 저장소 서버는 HTTP 400 에 statusCode "409"(Duplicate)로 답한다. */
export function isAlreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { statusCode?: unknown; status?: unknown; message?: unknown };
  if (e.statusCode === "409" || e.statusCode === 409 || e.status === 409) return true;
  return typeof e.message === "string" && /already exists|duplicate/i.test(e.message);
}

function splitPath(path: string): { folder: string; name: string } {
  const at = path.lastIndexOf("/");
  return at < 0 ? { folder: "", name: path } : { folder: path.slice(0, at), name: path.slice(at + 1) };
}

/** 그 경로의 파일이 지금 시각보다 STALE_MS 넘게 오래됐는가. 못 읽으면 false(건드리지 않는다). */
async function isStale(storage: Storage, bucket: string, path: string, now: number): Promise<boolean> {
  const { folder, name } = splitPath(path);
  const listed = await storage.from(bucket).list(folder, { search: name, limit: 10 });
  if (listed.error) return false;
  const file = (listed.data ?? []).find((f) => f.name === name);
  const created = file?.created_at ? Date.parse(file.created_at) : Number.NaN;
  return Number.isFinite(created) && now - created > STALE_MS;
}

async function put(storage: Storage, bucket: string, path: string, webp: Buffer) {
  return storage.from(bucket).upload(path, webp, { contentType: "image/webp", upsert: false, cacheControl: "31536000" });
}

export async function uploadVersioned<F>(storage: Storage, webp: Buffer, u: VersionedUpload<F>): Promise<VersionedUploadResult<F>> {
  const slot = await u.next();
  if (!slot) return u.noOwner;

  const path = u.pathOf(slot.ownerId, slot.version);
  let up = await put(storage, u.bucket, path, webp);
  if (up.error && isAlreadyExists(up.error)) {
    if (!(await isStale(storage, u.bucket, path, (u.now ?? Date.now)()))) return u.busy;
    console.error(`${u.bucket}: 붙지 못하고 남은 파일을 지우고 다시 올린다`, path);
    const cleared = await storage.from(u.bucket).remove([path]);
    if (cleared.error) throw new Error(`${u.label} 남은 파일을 지우지 못했다`);
    up = await put(storage, u.bucket, path, webp);
    if (up.error && isAlreadyExists(up.error)) return u.busy;
  }
  if (up.error) throw new Error(`${u.label}을 저장소에 올리지 못했다`);

  const set = await u.attach(slot.version);
  if (set.error) {
    const undo = await storage.from(u.bucket).remove([path]);
    if (undo.error) console.error(`${u.bucket}: 붙이지 못한 파일을 지우지 못했다 — 다음 올리기가 치운다`, path);
    if (set.error.code === "40001") return u.busy;
    const known = u.refusals && Object.hasOwn(u.refusals, set.error.code) ? u.refusals[set.error.code] : undefined;
    if (known !== undefined) return known;
    throw new Error(`${u.label} 판을 저장하지 못했다: ${set.error.code}`);
  }
  return { ok: true, path, version: slot.version, attached: set.data };
}

/**
 * 한 폴더에서 `{prefix}{판}.webp` 꼴 가운데 판이 keepFrom 보다 작은 파일과 alsoRemove 를 지운다.
 * 붙은 판보다 작은 판은 다시 쓰일 일이 없다. keepFrom 이상(다른 요청이 올리는 중일 수 있는 판)은 건드리지 않는다.
 * 지우지 못하면 기록만 남긴다 — 다음 저장·지우기 때 같은 목록에 다시 걸려 지워진다.
 */
export async function sweepOlderVersions(
  storage: Storage,
  bucket: string,
  o: { folder: string; prefix: string; keepFrom: number; alsoRemove?: unknown },
): Promise<void> {
  const doomed = new Set<string>();
  if (typeof o.alsoRemove === "string" && o.alsoRemove !== "") doomed.add(o.alsoRemove);
  const shape = new RegExp(`^${o.prefix.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}([1-9][0-9]{0,8})\\.webp$`);
  const listed = await storage.from(bucket).list(o.folder, { search: o.prefix, limit: 1000 });
  if (listed.error) {
    console.error(`${bucket}: 남은 파일 목록을 읽지 못했다`, o.folder);
  } else {
    for (const f of listed.data ?? []) {
      const m = shape.exec(f.name);
      if (m && Number(m[1]) < o.keepFrom) doomed.add(`${o.folder}/${f.name}`);
    }
  }
  if (doomed.size === 0) return;
  const { error } = await storage.from(bucket).remove([...doomed]);
  if (error) console.error(`${bucket}: 옛 파일을 지우지 못했다 — 다음 저장 때 다시 지운다`, [...doomed]);
}
