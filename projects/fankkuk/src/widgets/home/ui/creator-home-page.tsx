import Link from "next/link";
import type { ReactNode } from "react";
import { CREATOR_ACTION_CENTER_HREF, creatorActionHref, type CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
import { printLabelOf, type AddressAccessEntry } from "@/entities/address/model/access-log";
import type { CreatorColors } from "@/entities/creator/model/creator-color";

import { CREATOR_GIFT_PROGRESS_HREF } from "@/entities/gift-progress/model/progress-href";
import type { FanGiftView } from "@/entities/order/model/fan-view";

import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { formatDateTime } from "@/shared/lib/format/datetime";
import type { StatusTone } from "@/shared/ui/status-tone";
import { EmptyCard, NoticesSlot, RoleHome, SlotSection, StatusBadge, type FrontNotice, type FrontTile } from "./front-slots";
import welcome from "./creator-welcome.module.css";
import h from "./home.module.css";

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

/** 상태 이름은 기존 표시 함수를 라우트에서 적용한 값이다. tone = 뱃지 색 갈래(없으면 회색). href = 그 줄만 다른 곳으로 갈 때(없으면 묶음의 주소) */
export type HomeProgressRow = { id: string; title: string; description: string; status: string; tone?: StatusTone; href?: string };

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
  channel_create: "채널 없음", signature_link: "연결 전", approval: "승인 대기", bluetooth: "확인할 선물", tracker: "확인할 선물", unconfirmed: "내 상자 찾기",
  difference: "추가 결제", missing_box: "내 상자 찾기", return_address: "반송 주소 확인", unpaid: "결제 대기",
};
const countNote = (n: number | null) => n === null ? "" : `${n}건`;

function Chev() {
  return (
    <svg className={h.chev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** 한 줄 목록 — 팬 홈 진행 중인 선물과 같은 흰 카드 묶음. 줄 전체가 누르는 칸, 상태는 색 뱃지(점 + 글자, 35절) */
function SummaryRows({ rows, href, label }: { rows: readonly HomeProgressRow[]; href: string; label: string }) {
  return (
    <ul className={h.rows} aria-label={label}>
      {rows.slice(0, 3).map((row) => (
        <li key={row.id}>
          <Link href={row.href ?? href} className={h.row}>
            <span className={h.w}>
              <b>{row.title}</b>
              <span>{row.description}</span>
            </span>
            <StatusBadge tone={row.tone ?? "plain"} text={row.status} />
            <Chev />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 홈 「지금 할 일」 한 줄 — 승인 서명 연결 줄(signup INV-U20)은 연결 화면으로, 나머지는 처리할 일 화면으로 간다 */
export function creatorActionRows(actions: readonly CreatorActionItem[]): HomeProgressRow[] {
  return actions.map((item): HomeProgressRow => {
    // signup INV-U21: 채널을 만들기 전 — 가입 4단계(채널 만들기)로
    if (item.kind === "channel_create") {
      return { id: item.kind, title: "채널 만들기", description: "선물함과 팬꾹 링크를 만들려면 채널이 필요합니다", status: ACTION_LABEL[item.kind], tone: "warn", href: creatorActionHref(item) };
    }
    if (item.kind === "signature_link") {
      return { id: item.kind, title: "카카오톡 인증 알림 연결", description: "선물을 받으려면 연결이 필요합니다", status: ACTION_LABEL[item.kind], tone: "warn", href: creatorActionHref(item) };
    }
    return {
      id: `${item.kind}-${item.orderNo}-${"boxId" in item ? item.boxId ?? "" : "shareId" in item ? item.shareId ?? "" : "boxSeq" in item ? item.boxSeq : ""}`,
      title: `${"nickname" in item ? item.nickname : item.creatorName}님`,
      description: "itemKind" in item ? item.itemKind : item.orderNo,
      status: ACTION_LABEL[item.kind],
      tone: "warn",
    };
  });
}

export function CreatorHomePage({ profile, actionCount, actions, accessLog, notices, ongoingCount, progressRows = [], sentGifts, banner = null }: Props) {
  const tiles: FrontTile[] = [
    { href: CREATOR_ACTION_CENTER_HREF, label: "지금 할 일", note: countNote(actionCount), icon: "icon-approve" },
    { href: CREATOR_GIFT_PROGRESS_HREF, label: "선물 현황", note: ongoingCount === null ? "" : `진행 중 ${ongoingCount}건`, icon: "icon-gift" },
    { href: "/gifts", label: "보낸 선물", note: `${sentGifts.length}개`, icon: "icon-truck" },
    { href: "/creator/log", label: "주소 열람 기록", note: "배송지 열람 내역", icon: "icon-help" },
  ];
  const actionRows: HomeProgressRow[] = creatorActionRows(actions ?? []);
  return (
    <RoleHome hero={
      <div className={welcome.col}>
        <section className={welcome.hero} aria-labelledby="hero-title">
          <div className={welcome.copy}>
            <p className={welcome.label}>나의 팬꾹</p>
            <h1 id="hero-title">{profile.name}님,<br /><span className={`accent ${welcome.accent}`}>반가워요</span></h1>
            <p className={welcome.description}>팬들이 보낸 선물과<br />승인 요청을 여기서 확인하세요.</p>
            {actionCount !== null ? <p className={welcome.state}>
              {actionCount === 0
                ? <span className={welcome.done}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>지금은 처리할 일이 없어요</span>
                : <Link className={welcome.go} href={CREATOR_ACTION_CENTER_HREF}>지금 할 일 {actionCount}건 확인하기 →</Link>}
            </p> : null}
          </div>
          <div className={profile.fanName ? welcome.fan : `${welcome.fan} ${welcome.fanOnly}`}>
            {profile.fanName ? <dl><dt>함께하는 팬덤</dt><dd>{profile.fanName}</dd></dl> : null}
            <img src="/images/home/creator-cat.webp" width={160} height={160} alt="" />
          </div>
        </section>
      </div>
    } tiles={tiles} tilesLabel="내 바로가기" tilesClassName={welcome.tiles} banner={banner}>
      <SlotSection id="creator-actions" title="지금 할 일" meta={countNote(actionCount)} more={{ href: CREATOR_ACTION_CENTER_HREF, label: "지금 할 일 모두 보기" }}>
        {actionRows.length > 0 ? <SummaryRows rows={actionRows} href={CREATOR_ACTION_CENTER_HREF} label="지금 할 일" /> : <EmptyCard icon="check" text={actionCount === null ? "지금 할 일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "현재 처리할 일이 없습니다."} />}
      </SlotSection>
      <SlotSection id="creator-progress" title="진행 중인 선물" meta={countNote(ongoingCount)} more={{ href: CREATOR_GIFT_PROGRESS_HREF, label: "선물 현황 모두 보기" }}>
        {progressRows.length > 0 ? <SummaryRows rows={progressRows} href={CREATOR_GIFT_PROGRESS_HREF} label="진행 중인 선물" /> : <EmptyCard icon="gift" text={ongoingCount === null ? "선물 현황을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "진행 중인 선물이 없습니다."} />}
      </SlotSection>
      <SlotSection id="creator-log" title="최근 열람 기록" more={{ href: "/creator/log", label: "열람 기록 모두 보기" }}>
        {accessLog.length > 0 ? (
          <>
            <SummaryRows href="/creator/log" label="최근 열람 기록" rows={accessLog.map((entry) => { const print = printLabelOf(entry.printNo, entry.released); return { id: `${entry.orderNo}-${entry.at}-${entry.printNo}`, title: "배송지 열람 기록", description: `${entry.orderNo} · ${formatDateTime(entry.at)}`, status: print.text, tone: entry.released ? "danger" : "plain" }; })} />
            <p className={`t-meta ${h.secFoot}`}>{NO_ADDRESS_ASK}</p>
          </>
        ) : (
          <EmptyCard icon="eye" text="주소 열람 기록이 없습니다.">
            <p>{NO_ADDRESS_ASK}</p>
          </EmptyCard>
        )}
      </SlotSection>
      <NoticesSlot notices={notices} cardEmpty />
    </RoleHome>
  );
}
