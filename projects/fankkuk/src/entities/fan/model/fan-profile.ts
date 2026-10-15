// 팬 프로필 — 닉네임·사진·배경 사진·자기소개 네 칸 (docs/specs/my-account.md INV-A12~A14, 카드 d91).
// 누구나 보는 공개 값이다(INV-A13). 읽기 함수(fan_profile)가 주는 네 칸만 꺼내고, 다른 칸이 섞여 와도 화면에 닿지 않게 버린다.
// 사진은 공개 저장소(fan-photos)에 서버만 쓴다(INV-A14). 경로 꼴은 서버 저장 경로 하나가 만든다 — 꼴이 아니면 주소를 만들지 않는다.

export type FanProfile = { nickname: string; photoPath: string | null; bgPath: string | null; intro: string };

export type FanImageKind = "photo" | "background";

export const FAN_PHOTO_BUCKET = "fan-photos";

/** 자기소개 최대 글자 수(코드 포인트) — DB 표 제약·함수와 같은 값. */
export const FAN_INTRO_MAX = 100;

/** 파일 이름 앞머리 — {계정 ID}/p-{판}.webp · {계정 ID}/bg-{판}.webp */
export const FAN_IMAGE_PREFIX: Record<FanImageKind, string> = { photo: "p-", background: "bg-" };

const PATH_SHAPE: Record<FanImageKind, RegExp> = {
  photo: /^[0-9a-f-]{36}\/p-[1-9][0-9]{0,8}\.webp$/,
  background: /^[0-9a-f-]{36}\/bg-[1-9][0-9]{0,8}\.webp$/,
};

function pathOrNull(v: unknown, kind: FanImageKind): string | null {
  return typeof v === "string" && PATH_SHAPE[kind].test(v) ? v : null;
}

/** 읽기 함수 한 행 → 네 칸. 꼴이 틀리면 null. */
export function toFanProfile(row: unknown): FanProfile | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.nickname !== "string") return null;
  return {
    nickname: r.nickname,
    photoPath: pathOrNull(r.photo_path, "photo"),
    bgPath: pathOrNull(r.bg_path, "background"),
    intro: typeof r.intro === "string" ? r.intro : "",
  };
}

/** 공개 저장소의 팬 사진 주소. 정해진 경로 꼴(사진 또는 배경)이 아니면 null. */
export function fanImageUrl(storageBase: string, path: string | null): string | null {
  if (!path) return null;
  if (!PATH_SHAPE.photo.test(path) && !PATH_SHAPE.background.test(path)) return null;
  return `${storageBase}/storage/v1/object/public/${FAN_PHOTO_BUCKET}/${path}`;
}
