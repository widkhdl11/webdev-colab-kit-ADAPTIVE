// 폼과 서버 본체가 **함께 보는 값**. 서버 전용 모듈에 두지 않는다 — 클라이언트 폼이
// 그것을 import 하는 순간 서버 전용 코드(`next/headers` 등)가 브라우저 번들로 딸려
// 들어가 빌드가 죽는다. 같은 자리가 2026-09-06 까지 네 번 났다.

/** 이름 길이. 데이터베이스의 `profiles_username_length` 와 같은 값이다 */
export const USERNAME_MAX = 20;

/**
 * 아바타로 받는 형식. **버킷의 `allowed_mime_types` 와 같은 목록이어야 한다** —
 * 강제 위치는 버킷이고 여기는 미리 걸러 주는 자리다. 두 벌이 어긋나면, 버킷에 형식을
 * 하나 더해도 이 목록이 강제 위치에 닿기도 전에 먼저 거부한다.
 */
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** 아바타 크기 상한. 버킷의 `file_size_limit` 과 같은 값이다 */
export const AVATAR_MAX_BYTES = 1_048_576;

/** 화면 문구가 쓰는 표기. 숫자를 카피에 손으로 적으면 상한을 올릴 때 문구만 낡는다 */
export const AVATAR_MAX_LABEL = `${AVATAR_MAX_BYTES / 1_048_576}MB`;

/** 형식별 확장자. 저장 경로를 만들 때 쓴다 */
export const AVATAR_EXTENSION: Readonly<Record<(typeof AVATAR_TYPES)[number], string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function isAvatarType(type: string): type is (typeof AVATAR_TYPES)[number] {
  return (AVATAR_TYPES as readonly string[]).includes(type);
}

/**
 * 이름에 제어문자가 섞였나. 데이터베이스의 `profiles_username_no_control` 과 같은 판정이고,
 * **강제 위치는 그쪽이다** — 여기는 사용자가 읽을 수 있는 문구를 주기 위한 자리다.
 * 제약이 거부하면 나오는 것은 영어 원문이라 화면에 그대로 내보낼 수 없다.
 */
export function hasControlChars(name: string): boolean {
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    // 정규식 대신 코드 포인트로 센다 — 제어문자를 정규식 리터럴에 적으면 그 글자가 소스에
    // 그대로 박혀서, 파일을 옮기거나 붙여 넣는 과정에 조용히 사라진다(2026-09-06 실측).
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
