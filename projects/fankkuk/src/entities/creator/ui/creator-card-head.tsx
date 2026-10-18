import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { CardLook } from "../model/card-look";
import { creatorColorVars, hasThemeVars, type CreatorColors } from "../model/creator-color";
import { CreatorCardTags } from "./creator-card-tags";
import { CreatorCoverArt, coverPastelVar } from "./creator-cover-art";
import { CreatorPhoto } from "./creator-photo";
import { FandomBadge } from "./fandom-badge";
import s from "./creator-card-head.module.css";

// 크리에이터 카드 — 크리에이터 찾기·팔로우한 크리에이터·홈 새 크리에이터가 같이 쓴다(design-rules 17절 「크리에이터 카드 v28」,
// 시안 docs/design/mockups/site/v28-card-redesign/index.html, DECISIONS 2026-10-18).
// 위에서 아래로(줄 사이 8): 배너 2:1(배경사진, 없으면 테마 색 면 그대로 또는 파스텔 + 오른쪽 흐린 고양이)
// → 사진 64(배너에 32 걸침, 왼쪽) + 오른쪽에 이름(600·한 줄 말줄임) 한 줄, 그 아래 팬덤 뱃지 한 줄(CreatorCardHead)
//   — 한 줄에 나란히 두면 긴 이름이 뱃지를 「하..」까지 밀어내서 두 줄로 나눴다(2026-10-18 사용자 「A로」)
// → 「채널 이름 · 소개」 최대 두 줄(CreatorCardLine)
// → 하단 줄(CreatorCardFoot): 왼쪽 플랫폼 칩(넘치면 +N) · 오른쪽 버튼(팔로우·팔로우 중·내 페이지). 평균 승인 시간은 카드에 없다(2026-10-18).
// 줄마다 자리가 고정이다 — 소개·칩이 없어도 빈칸으로 남아 카드 높이가 같다.
// 테마 색(INV-E13)은 배너 면·사진 테두리·팬덤 뱃지에만.
// 카드 전체가 프로필 링크다 — 이름 링크가 카드 전체를 덮고(감싸는 카드는 position: relative), 버튼은 그 위에 올라 누름이 퍼지지 않는다.
// 배너는 카드 안쪽 여백만큼 바깥으로 나가 카드 위 가장자리에 붙는다 — 카드는 안쪽 여백 24(--card-pad)·줄 사이 8·overflow: hidden 이어야 한다.

/** 카드 겉 틀(li 에 붙인다) — 찾기·팔로우·홈 카드가 같은 틀을 쓴다. 미리보기처럼 링크가 없는 카드도 같은 틀이다. */
export const creatorCardClass = s.card;

export function CreatorCardHead({
  creatorId,
  name,
  href,
  look,
  colors,
  faceTone,
}: {
  /** 사진 없는 배너의 파스텔을 정한다 — 없으면(본인 미리보기) 옅은 하늘 면 */
  creatorId: string | null;
  name: string;
  /** 프로필 주소 — null 이면 링크 없이 이름만(설정 화면 카드 미리보기) */
  href: string | null;
  look: CardLook;
  colors?: CreatorColors;
  faceTone: string;
}) {
  const theme = colors?.personal ?? null;
  const vars = creatorColorVars({ personal: theme });
  const ringed = hasThemeVars(vars);
  return (
    <div className={`${s.head} ${ringed ? s.ringed : ""}`} style={vars as CSSProperties} data-card-head="">
      {/* 배너 — 꾸밈이라 읽지 않는다 */}
      <div className={s.cover} style={coverPastelVar(creatorId)} aria-hidden="true" data-card-cover="">
        <CreatorCoverArt imageUrl={look.backgroundUrl} />
      </div>
      <div className={s.who}>
        <CreatorPhoto photoUrl={look.photoUrl} tone={faceTone} className={`face ${s.photo}`} />
        <div className={s.id}>
          <p className={s.name}>
            {href ? (
              <Link href={href} title={name}>
                {name}
              </Link>
            ) : (
              <span title={name}>{name}</span>
            )}
          </p>
          {/* 뱃지 줄 — 뱃지가 없어도 자리는 남는다(카드 높이를 같게) */}
          <p className={s.badgeRow}>
            {look.fanName ? <FandomBadge name={look.fanName} symbolUrl={look.symbolUrl} themeColor={theme} /> : null}
          </p>
        </div>
      </div>
    </div>
  );
}

/** 「채널 이름 · 소개」 최대 두 줄 — 넘치면 둘째 줄 끝에서 말줄임. 전체 소개는 카드를 눌러 가는 크리에이터 페이지에서 본다
 *  (카드 전체를 덮는 이름 링크 때문에 이 줄의 title 은 뜨지 않는다 — 글자는 다 들어 있어 화면 낭독기는 전체를 읽는다).
 *  둘 다 없어도 두 줄 자리는 남는다(카드 높이를 같게). */
export function CreatorCardLine({ channelTitle, intro }: { channelTitle: string; intro: string }) {
  const text = [channelTitle.trim(), intro.trim()].filter(Boolean).join(" · ");
  return <p className={s.line}>{text}</p>;
}

/** 하단 줄 — 왼쪽 플랫폼 칩(넘치면 「+N」), 오른쪽 버튼(팔로우·팔로우 중·내 페이지). 버튼이 없으면 칩이 줄 전체를 쓴다.
 *  2026-10-18 사용자 「평균 승인 시간을 없애고 조금 재조정」 — 승인 시간 줄을 빼고 칩 줄에 버튼을 올렸다. 이름 옆이 아니라 칩 옆인 것은
 *  칩 줄에 넘침 처리(+N)가 있어서다 — 이름·뱃지 줄은 길이가 변하는 것 둘을 나란히 두지 않는다(ui-layers 「레이아웃 안정성」). */
export function CreatorCardFoot({ tags, action }: { tags: readonly string[]; action?: ReactNode }) {
  return (
    <div className={s.foot} data-card-foot="">
      <CreatorCardTags tags={tags} />
      {action ? <div className={s.act}>{action}</div> : null}
    </div>
  );
}
