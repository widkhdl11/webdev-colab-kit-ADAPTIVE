import Link from "next/link";
import type { ReactNode } from "react";
import { CREATOR_ACTION_CENTER_HREF, type CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
import { printLabelOf, type AddressAccessEntry } from "@/entities/address/model/access-log";
import type { CreatorColors } from "@/entities/creator/model/creator-color";
import { FandomBadge } from "@/entities/creator/ui/fandom-badge";
import { CREATOR_GIFT_PROGRESS_HREF } from "@/entities/gift-progress/model/progress-href";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { CREATOR_PROFILE_EDIT } from "@/entities/session/model/home-path";
import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { HeroBand, NoticesSlot, RoleHome, SlotSection, type FrontNotice, type FrontTile } from "./front-slots";
import s from "./front.module.css";

export type CreatorHomeProfile = {
  name: string;
  intro: string;
  photoUrl: string | null;
  initial: string;
  backgroundUrl: string | null;
  colors: CreatorColors;
  fanName: string;
  symbolUrl: string | null;
};

/** 상태 이름은 기존 표시 함수를 라우트에서 적용한 값이다. */
export type HomeProgressRow = { id: string; title: string; description: string; status: string };

type Props = {
  profile: CreatorHomeProfile;
  accountHref: string;
  publicHref?: string | null;
  actionCount: number | null;
  actions?: readonly CreatorActionItem[] | null;
  accessLog: readonly AddressAccessEntry[];
  notices: readonly FrontNotice[];
  ongoingCount: number | null;
  progressRows?: readonly HomeProgressRow[];
  sentGifts: readonly FanGiftView[];
  banner?: ReactNode;
};

export const CREATOR_HOME_LOG_ROWS = 1;
const ACTION_LABEL: Record<CreatorActionItem["kind"], string> = {
  approval: "승인 대기", bluetooth: "확인할 선물", tracker: "확인할 선물", unconfirmed: "내 상자 찾기",
  difference: "추가 결제", missing_box: "내 상자 찾기", return_address: "반송 주소 확인", unpaid: "결제 대기",
};
const countNote = (n: number | null) => n === null ? "" : `${n}건`;

function SummaryRows({ rows, href }: { rows: readonly HomeProgressRow[]; href: string }) {
  return (
    <ul className={s.summaryRows}>
      {rows.slice(0, 3).map((row) => (
        <li key={row.id}>
          <Link href={href} className={s.summaryRow}>
            <span className={s.summaryText}><strong>{row.title}</strong><span>{row.description}</span></span>
            <span className={s.summaryStatus}>{row.status}</span>
            <span aria-hidden="true">›</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CreatorHomePage({ profile, publicHref = null, actionCount, actions, accessLog, notices, ongoingCount, progressRows = [], sentGifts, banner = null }: Props) {
  const tiles: FrontTile[] = [
    { href: CREATOR_ACTION_CENTER_HREF, label: "지금 할 일", note: countNote(actionCount), icon: "icon-approve" },
    { href: CREATOR_GIFT_PROGRESS_HREF, label: "선물 현황", note: ongoingCount === null ? "" : `진행 중 ${ongoingCount}건`, icon: "icon-gift" },
    { href: "/gifts", label: "보낸 선물", note: `${sentGifts.length}개`, icon: "icon-truck" },
    { href: "/creator/log", label: "주소 열람 기록", note: "배송지 열람 내역", icon: "icon-help" },
  ];
  const actionRows: HomeProgressRow[] = (actions ?? []).map((item) => ({
    id: `${item.kind}-${item.orderNo}-${"boxId" in item ? item.boxId ?? "" : "shareId" in item ? item.shareId ?? "" : "boxSeq" in item ? item.boxSeq : ""}`,
    title: `${"nickname" in item ? item.nickname : item.creatorName}님`,
    description: "itemKind" in item ? item.itemKind : item.orderNo,
    status: ACTION_LABEL[item.kind],
  }));
  const control = (
    <div className={s.heroProfile} aria-label="내 프로필">
      <span className={s.heroAvatar} aria-hidden="true">{profile.photoUrl ? <img src={profile.photoUrl} width={40} height={40} alt="" /> : profile.initial}</span>
      <span className={s.heroProfileName}>{profile.name}</span>
      {profile.fanName ? <FandomBadge name={profile.fanName} symbolUrl={profile.symbolUrl} themeColor={profile.colors.personal} size="medium" /> : null}
    </div>
  );
  const heroActions = (
    <div className="hero-actions">
      {publicHref ? <Link className="btn" href={publicHref}>내 페이지 보기</Link> : null}
      <Link className={`btn ${publicHref ? "btn--line" : ""}`} href={CREATOR_PROFILE_EDIT}>프로필 수정</Link>
    </div>
  );
  return (
    <RoleHome hero={<HeroBand title={`${profile.name}님, 반가워요`} eyebrow="팬들이 보낸 선물과 승인 요청을 확인해 주세요" control={control} actions={heroActions} />} tiles={tiles} tilesLabel="내 바로가기" banner={banner}>
      <SlotSection id="creator-actions" title="지금 할 일" meta={countNote(actionCount)} more={{ href: CREATOR_ACTION_CENTER_HREF, label: "지금 할 일 모두 보기" }}>
        {actionRows.length > 0 ? <SummaryRows rows={actionRows} href={CREATOR_ACTION_CENTER_HREF} /> : <p className="t-meta">{actionCount === null ? "지금 할 일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "현재 처리할 일이 없습니다."}</p>}
      </SlotSection>
      <SlotSection id="creator-progress" title="진행 중인 선물" meta={countNote(ongoingCount)} more={{ href: CREATOR_GIFT_PROGRESS_HREF, label: "선물 현황 모두 보기" }}>
        {progressRows.length > 0 ? <SummaryRows rows={progressRows} href={CREATOR_GIFT_PROGRESS_HREF} /> : <p className="t-meta">{ongoingCount === null ? "선물 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "진행 중인 선물이 없습니다."}</p>}
      </SlotSection>
      <SlotSection id="creator-log" title="최근 열람 기록" more={{ href: "/creator/log", label: "열람 기록 모두 보기" }}>
        {accessLog.length > 0 ? <SummaryRows href="/creator/log" rows={accessLog.map((entry) => ({ id: `${entry.orderNo}-${entry.at}-${entry.printNo}`, title: "배송지 열람 기록", description: `${entry.orderNo} · ${formatDateTime(entry.at)}`, status: printLabelOf(entry.printNo, entry.released).text }))} /> : <p className="t-meta">주소 열람 기록이 없습니다.</p>}
        <p className="t-meta">{NO_ADDRESS_ASK}</p>
      </SlotSection>
      <NoticesSlot notices={notices} />
    </RoleHome>
  );
}
