import type { CSSProperties } from "react";
import { coverPastel } from "../lib/cover-pastel";
import s from "./creator-cover-art.module.css";

// 배너(배경사진 칸) 안쪽 — 크리에이터 카드·공개 프로필 머리·크리에이터 홈 머리가 같이 쓴다(design-rules 「크리에이터 카드·공개 프로필 머리」, 시안 v24-creator-card).
// 사진이 있으면 사진, 없으면 오른쪽 아래에 흐린 고양이. 배너 면 색은 감싸는 칸의 CSS 가 정한다:
// 퍼스널 컬러가 있으면 퍼스널 컬러 30% 면, 없으면 --pastel(크리에이터 ID 로 정한 파스텔 8색 중 하나, coverPastelVar).
// 감싸는 칸은 position: relative · overflow: hidden 이어야 고양이가 칸 안에서 잘린다.

/** 배너 칸에 붙일 스타일 변수 — 크리에이터 ID 가 없으면(본인 미리보기 등) 변수 없이 감싸는 칸의 기본 면. */
export function coverPastelVar(creatorId: string | null | undefined): CSSProperties {
  return creatorId ? ({ "--pastel": coverPastel(creatorId) } as CSSProperties) : {};
}

/** lazy: 첫 화면 맨 위 머리(공개 프로필·크리에이터 홈)는 false — 바로 불러온다. 카드 목록은 기본 true. */
export function CreatorCoverArt({ imageUrl, lazy = true }: { imageUrl: string | null | undefined; lazy?: boolean }) {
  if (imageUrl) {
    return <img className={s.img} src={imageUrl} alt="" width={1200} height={480} loading={lazy ? "lazy" : undefined} />;
  }
  return <img className={s.cat} src="/images/logo-mark-clear.png" alt="" />;
}
