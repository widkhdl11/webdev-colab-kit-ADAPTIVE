import s from "./creator-profile.module.css";

// 배경 사진 면 — 화면(로그인 후는 본문 칸) 폭 전체, 상단 바에 붙임(시안 e판 「배경 사진이 최대한 많이 나오게, 넓게」).
// 높이 = 폭의 절반(올리는 칸 권장 1200×600, 2:1 — design-prompt 8-15), 최대 520. 사진이 없으면 테마 색 면, 그것도 없으면
// 크리에이터 카드와 같은 옅은 하늘 세로 그라데이션(2026-11-13). 크리에이터마다 다른 파스텔·흐린 고양이는 쓰지 않는다. 꾸밈이라 읽지 않는다.
export function ProfileCover({ imageUrl }: { imageUrl: string | null }) {
  return <div className={s.cover} aria-hidden="true">{imageUrl ? <img src={imageUrl} alt="" width={1200} height={600} /> : null}</div>;
}
