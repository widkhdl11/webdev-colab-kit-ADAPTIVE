// 프로필 사진 크기 상한 (creator-link INV-E9, S9). 사진 처리·사진 라우트·Next 설정(프록시 본문 상한)이 같은 값을 쓴다 —
// 프록시가 이 값보다 작게 본문을 자르면 10MB 이하 정상 사진이 잘린 채 라우트에 와서 「이미지가 아니에요」로 거부된다.
// next.config.ts 가 읽으므로 이 파일은 다른 모듈을 불러오지 않는다.

/** 올릴 수 있는 사진 크기 — 10MB. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** 라우트가 받는 본문 상한 — 사진에 양식 경계·머리줄 몫(64KB)을 더한 값. 넘으면 본문을 읽지 않고 413. */
export const PHOTO_BODY_LIMIT = PHOTO_MAX_BYTES + 64 * 1024;
