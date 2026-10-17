import type { CSSProperties, ReactNode } from "react";
import { creatorColorOrNull, creatorColorVars, type CreatorColors } from "../model/creator-color";
import { CreatorCoverArt } from "./creator-cover-art";
import { FandomBadge } from "./fandom-badge";
import s from "./creator-head.module.css";

// 크리에이터 프로필 머리 — 배경 띠 · 프로필 사진 · 공개 이름 · 팬덤 뱃지 · 한 줄 소개 · 오른쪽 버튼(design-rules 12절, 시안 v21-addendum3 cre-home · cre-profile-edit · cre-detail-settings 미리보기).
// 크리에이터 홈(h1 = 공개 이름)·프로필 수정 미리보기·상세 설정 미리보기가 같은 머리를 쓴다.
// 퍼스널 컬러(INV-E13)는 띠와 사진 테두리에만, 팬컬러는 뱃지 면에만. 배경 사진이 있으면 띠 자리에 사진이 보인다(시안 cre-profile-edit — 「사진이 없으면 퍼스널 컬러 띠」).
// 띠는 공개 프로필 머리와 같은 2.5:1(시안 v24-creator-card, DECISIONS d102)이고, 사진이 없으면 퍼스널 컬러 30% 면 + 흐린 고양이(d101).
// 퍼스널 컬러가 없을 때의 파스텔은 크리에이터 ID 로 정하는데 이 머리를 쓰는 본인 화면들은 ID 를 받지 않아 옅은 하늘 면이다.
// 색은 creatorColorVars 가 꼴을 한 번 더 본 뒤에만 스타일 변수로 들어가고, 없으면 사이트 기본 모양이다.

export type CreatorHeadProps = {
  name: string;
  /** 홈에서는 h1(공개 이름이 페이지 제목), 미리보기에서는 글자만 */
  nameAs?: "h1" | "span";
  intro?: string;
  photoUrl: string | null;
  /** 사진이 없을 때 동그라미 안 글자 */
  initial: string;
  backgroundUrl: string | null;
  colors: CreatorColors;
  fanName: string;
  symbolUrl: string | null;
  actions?: ReactNode;
  /** 미리보기 상자 안의 작은 머리 */
  compact?: boolean;
  /** 구간 이름(화면 읽기용) */
  label: string;
};

export function CreatorHead(p: CreatorHeadProps) {
  const vars = creatorColorVars({ personal: p.colors.personal, fan: null });
  const Name = p.nameAs ?? "span";
  const tinted = creatorColorOrNull(p.colors.personal) !== null;
  return (
    <section className={`${s.pf} ${p.compact ? s.compact : ""} ${tinted ? s.tinted : ""}`} style={vars as CSSProperties} aria-label={p.label} data-creator-head="">
      <div className={s.band} aria-hidden="true" data-band="">
        <CreatorCoverArt imageUrl={p.backgroundUrl} lazy={false} />
      </div>
      <div className={`${s.body} ${p.actions ? s.withAct : ""}`}>
        <span className={s.av} aria-hidden="true" data-avatar="">
          {p.photoUrl ? <img src={p.photoUrl} alt="" width={512} height={512} /> : p.initial}
        </span>
        <div className={s.id}>
          <div className={s.line}>
            <Name className={s.name}>{p.name}</Name>
            {p.fanName ? <FandomBadge name={p.fanName} symbolUrl={p.symbolUrl} fanColor={p.colors.fan} size="medium" /> : null}
          </div>
          {p.intro ? <p className={s.intro}>{p.intro}</p> : null}
        </div>
        {p.actions ? <div className={s.act}>{p.actions}</div> : null}
      </div>
    </section>
  );
}
