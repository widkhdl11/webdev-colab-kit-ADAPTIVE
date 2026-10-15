import type { CSSProperties } from "react";
import { creatorColorVars } from "../model/creator-color";
import s from "./creator-head.module.css";

// 팬덤 뱃지 — 팬덤 이름 + 팬마크(팬덤 심볼). 면은 팬컬러, 글자는 그 면에서 그때 계산한 색(creator-link INV-E13·E14, design-rules 12절 「팬덤 색」).
// 팬컬러가 없거나 꼴이 틀리면 사이트 기본 모양(옅은 하늘 면 + 짙은 회색 글자). 색은 creatorColorVars 가 꼴을 한 번 더 본 뒤에만 스타일에 들어간다.
// 시안: docs/design/mockups/site/v21-addendum3/cre-21.css .fb · .fb-mark · .fb--lg

export function FandomBadge({
  name,
  symbolUrl,
  fanColor,
  large = false,
}: {
  name: string;
  /** 팬덤 심볼 공개 주소 — 없으면 마크 칸 없이 이름만 */
  symbolUrl: string | null;
  fanColor: string | null;
  large?: boolean;
}) {
  const vars = creatorColorVars({ personal: null, fan: fanColor });
  return (
    <span className={`${s.fb} ${large ? s.fbLg : ""}`} style={vars as CSSProperties} data-fandom-badge="">
      {symbolUrl ? (
        <span className={s.fbMark} aria-hidden="true">
          <img src={symbolUrl} alt="" width={512} height={512} />
        </span>
      ) : null}
      {name}
    </span>
  );
}
