import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { CardLook } from "../model/card-look";
import { creatorColorVars, hasThemeVars, type CreatorColors } from "../model/creator-color";
import { CardActionIconSvg, type CardActionIcon } from "@/shared/ui/card-action-icons";
import { CreatorCardTags } from "./creator-card-tags";
import { CreatorCoverArt } from "./creator-cover-art";
import { CreatorPhoto } from "./creator-photo";
import { FandomBadge } from "./fandom-badge";
import s from "./creator-card-head.module.css";

// 크리에이터 카드 — 크리에이터 찾기·팔로우한 크리에이터·홈 새 크리에이터가 같이 쓴다(design-rules 17절 「크리에이터 카드 v28」,
// 시안 docs/design/mockups/site/v28-card-redesign/index.html, DECISIONS 2026-10-18).
// 2026-11-13 차분한 판(시안 creators-calm-20261113 B안, DECISIONS 같은 날): 테마 색 없는 배너는 기본 회색 면(크리에이터 ID 파스텔 안 씀)·고양이 없음,
// 아래 버튼은 흰 바탕 테두리(테마 색 안 씀 — INV-E13), 소개는 내용만큼(최대 두 줄) · 버튼 줄은 카드 맨 아래.
// 위에서 아래로(줄 사이 8): 배너 2:1(배경사진, 없으면 테마 색 면 그대로 또는 기본 회색 면 — 휴대폰은 사진 없는 배너만 4:1)
// → 사진 64(배너에 32 걸침, 왼쪽) + 오른쪽에 이름(600·한 줄 말줄임) 한 줄, 그 아래 팬덤 뱃지 한 줄(CreatorCardHead)
//   — 한 줄에 나란히 두면 긴 이름이 뱃지를 「하..」까지 밀어내서 두 줄로 나눴다(2026-10-18 사용자 「A로」)
// → 「소개」 최대 두 줄(CreatorCardLine) — 채널 이름은 보이지 않는다(2026-11-10 이름 통일, creator-display-name INV-CN4, 시안 name-merge-20261105)
// → 칩 줄(CreatorCardFoot): 플랫폼 칩이 카드 폭 전체(넘치면 +N). 평균 승인 시간은 카드에 없다(2026-10-18).
// → 아래 버튼 줄(CreatorCardActions, 카드 맨 아래에 붙음 · 흰 바탕 테두리 버튼): 팔로우 안 함 = 「팔로우」 하나 / 팔로우 중 = 「선물 보내기」(넓은 주) · 「팔로우 취소」(좁은 보조). 본인은 띠에 「내 페이지」 태그(CreatorCardMineRow), 운영자는 띠 없음.
// 같은 줄 카드는 격자가 높이를 맞추고 버튼 줄은 카드 맨 아래에 붙는다. 뱃지 줄은 여러 열일 때 비어도 자리를 남긴다(같은 줄 카드의 소개 시작 높이) —
// 찾기 격자가 한 열일 때(data-card-stack · 칸 443 이하)만 사진 없는 배너를 4:1 로 낮추고 빈 뱃지 줄을 접는다.
// 테마 색(INV-E13)은 배너 면·사진 테두리·팬덤 뱃지에만.
// 카드 전체가 프로필 링크다 — 이름 링크가 카드 전체를 덮고(감싸는 카드는 position: relative), 버튼은 그 위에 올라 누름이 퍼지지 않는다.
// 배너는 카드 안쪽 여백만큼 바깥으로 나가 카드 위 가장자리에 붙는다 — 카드는 안쪽 여백 24(--card-pad)·줄 사이 8·overflow: hidden 이어야 한다.

/** 카드 겉 틀(li 에 붙인다) — 찾기·팔로우·홈 카드가 같은 틀을 쓴다. 미리보기처럼 링크가 없는 카드도 같은 틀이다. */
export const creatorCardClass = s.card;

export function CreatorCardHead({
  name,
  href,
  look,
  colors,
  faceTone,
}: {
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
      {/* 사진이 없으면 비운 면(테마 색 또는 기본 회색) — 공개 프로필 머리와 달리 흐린 고양이를 두지 않는다(2026-11-13) */}
      <div className={s.cover} aria-hidden="true" data-card-cover="">
        {look.backgroundUrl ? <CreatorCoverArt imageUrl={look.backgroundUrl} /> : null}
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

/** 「소개」 최대 두 줄 — 넘치면 둘째 줄 끝에서 말줄임. 전체 소개는 카드를 눌러 가는 크리에이터 페이지에서 본다
 *  (카드 전체를 덮는 이름 링크 때문에 이 줄의 title 은 뜨지 않는다 — 글자는 다 들어 있어 화면 낭독기는 전체를 읽는다).
 *  내용만큼만 차지하고, 비면 CSS 가 접는다(2026-11-13 — 버튼 줄이 카드 맨 아래에 붙어 같은 줄 카드 높이는 격자가 맞춘다). */
export function CreatorCardLine({ intro }: { intro: string }) {
  return <p className={s.line}>{creatorLineText(intro)}</p>;
}

/** 「소개」 글자 — 카드와 팔로우 목록 줄이 같은 규칙으로 만든다. 없으면 빈 글자 */
export function creatorLineText(intro: string): string {
  return intro.trim();
}

/** 칩 줄 — 플랫폼 칩이 카드 폭을 다 쓰고, 넘치면 「+N」. 칩이 없어도 줄 자리는 남는다.
 *  2026-10-18 사용자 「추천대로」 — 칩 줄 오른쪽에 있던 「팔로우」를 아래 버튼 줄(CreatorCardActions)로 내렸다. */
export function CreatorCardFoot({ tags }: { tags: readonly string[] }) {
  return (
    <div className={s.foot} data-card-foot="">
      <CreatorCardTags tags={tags} />
    </div>
  );
}

/** 아래 버튼 줄 — 카드 맨 아래에 붙는다. 버튼은 흰 바탕 테두리이고 크리에이터 색을 쓰지 않는다(2026-11-13, INV-E13).
 *  안에 놓는 버튼은 부르는 쪽이 팔로우 상태에 따라 정한다(2026-10-18 「팔로우가 안 돼 있을 땐 팔로우 버튼만, 팔로우 상태에서만 선물 보내기와 팔로우 취소」):
 *  안 함 = 「팔로우」 하나(주, 띠 폭 전체) / 팔로우 중 = 왼쪽 「선물 보내기」(주, 남은 폭) + 오른쪽 「팔로우 취소」(보조, 글자 폭만큼) — 2026-10-18 「순서 반대로」.
 *  버튼 모양은 data-card-btn="main"(넓은 버튼) | "sub"(아이콘만 44)로 고른다 — 둘 다 흰 바탕 테두리. 카드의 마지막 자식으로 둔다.
 *  카드를 덮는 이름 링크보다 위에 있어 눌러도 카드로 이동하지 않는다. 운영자 화면처럼 버튼이 없으면 부르는 쪽이 띠를 그리지 않는다. */
export function CreatorCardActions({ children }: { children: ReactNode }) {
  return (
    <div className={s.acts} data-card-actions="" data-card-band="">
      {children}
    </div>
  );
}

/** 띠 버튼 안쪽 — 아이콘 16 + 글자(넘치면 말줄임). hideText = 아이콘만 보이고 글자는 화면 낭독기용(「팔로우 취소」 — 2026-10-18 「로그인 후 팔로우 취소는 아이콘만」).
 *  띠 버튼(팔로우·선물 보내기·팔로우 취소)은 팔로우 상태를 아는 FollowButton(features)이 그린다. */
export function CardButtonLabel({ icon, hideText = false, children }: { icon: CardActionIcon; hideText?: boolean; children: ReactNode }) {
  return (
    <>
      <CardActionIconSvg name={icon} />
      <span className={hideText ? "sr-only" : s.btnText}>{children}</span>
    </>
  );
}

/** 본인 카드 — 아래 띠는 그대로 두고(위 배너와 세트·카드 높이 같게) 버튼 대신 「내 페이지」 태그 하나. */
export function CreatorCardMineRow() {
  return (
    <div className={`${s.acts} ${s.mine}`} data-card-actions="" data-card-band="">
      <span className="tag">내 페이지</span>
    </div>
  );
}
