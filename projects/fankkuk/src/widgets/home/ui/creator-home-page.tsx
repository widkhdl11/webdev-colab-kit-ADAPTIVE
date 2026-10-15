import Link from "next/link";
import type { ReactNode } from "react";
import type { AddressAccessEntry } from "@/entities/address/model/access-log";
import type { CreatorColors } from "@/entities/creator/model/creator-color";
import { CreatorHead } from "@/entities/creator/ui/creator-head";
import { approvalTimeLeftLabel } from "@/entities/order/model/approval-time-left";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { isIncomingInProgress, type IncomingGiftView } from "@/entities/order/model/incoming-gift";
import { CREATOR_PROFILE_EDIT } from "@/entities/session/model/home-path";
import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { formatDateTime } from "@/shared/lib/format/datetime";
import s from "./home.module.css";
import { HomeNotices, type HomeNotice } from "./home-notices";

// 크리에이터 홈 — 로그인하면 먼저 나오는 첫 화면. 시안: docs/design/mockups/site/v21-addendum3/cre-home.html(design-rules 12절 「홈」), 본문 틀 기본 880.
// 12절: 제목 「홈」 없이 프로필 구간이 본문 맨 앞이고 h1 은 공개 이름. 프로필 구간 = 배경 띠(배경 사진, 없으면 퍼스널 컬러)·사진(테두리 퍼스널 컬러)·
// 팬덤 뱃지(면 팬컬러)·한 줄 소개·「프로필 수정」·「계정 설정」(creator-link INV-E13·E14). 그 아래 바로가기 한 줄 목록(0000절 — 카드 좌우 나열 대신) · 공지.
// 필수 다섯(오늘 승인할 선물 · 진행 중인 선물 · 최근 열람 기록 · 공지 · 내가 보낸 선물, 카드 d15)은 바로가기와 공지에 모두 있다.
// 이 화면에는 서명 버튼을 두지 않는다 — 승인은 승인 요청 화면에서 한 건씩 서명한다.
// 「진행 중인 선물」은 받은 선물 읽기(my_incoming_gifts, office-workflow INV-W9)로 센다 — 결제 완료부터 배송중까지.
// 「해야 할 일」 한 줄은 아직 두지 않는다(크리에이터 쪽은 정하지 않음). 헤더·푸터는 라우트(app)가 붙인다.

export type CreatorHomeProfile = {
  /** 공개 이름(크리에이터 페이지에 보이는 이름) — h1 */
  name: string;
  intro: string;
  photoUrl: string | null;
  initial: string;
  backgroundUrl: string | null;
  colors: CreatorColors;
  fanName: string;
  symbolUrl: string | null;
};

type Props = {
  profile: CreatorHomeProfile;
  /** 아래 이름 메뉴와 같은 계정 설정 주소 */
  accountHref: string;
  /** 승인 대기 요청, 오래 기다린 것부터(= 남은 기간이 짧은 순). */
  requests: readonly ApprovalRequestView[];
  /** 최근 열람 기록, 최근 순. 첫 줄만 쓴다. */
  accessLog: readonly AddressAccessEntry[];
  notices: readonly HomeNotice[];
  /** 나에게 온 선물의 진행 단계(끝난 것 포함 — 진행 중인 것만 이 화면이 센다). */
  incoming: readonly IncomingGiftView[];
  /** 내가(로그인한 사람이) 보낸 선물. */
  sentGifts: readonly FanGiftView[];
  /** 승인 대기의 남은 기간을 세는 기준 시각 — 화면을 그리는 서버가 넘긴다 */
  now: string;
};

/** 「최근 열람 기록」은 한 줄만 쓴다 — 라우트가 이만큼만 읽는다. */
export const CREATOR_HOME_LOG_ROWS = 1;

function Ico({ d }: { d: string }) {
  return (
    <span className={s.ri} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d={d} />
      </svg>
    </span>
  );
}

const ICON = {
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  truck: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14M17 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  gift: "M12 7v14M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8M7.5 7a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5M3 7h18v4H3z",
  eye: "M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
} as const;

function Row({ href, icon, title, meta, value }: { href: string; icon: keyof typeof ICON; title: string; meta?: string; value: ReactNode }) {
  return (
    <li>
      <Link className={s.row} href={href}>
        <Ico d={ICON[icon]} />
        <span className={s.w}>
          <b>{title}</b>
          {meta ? <span>{meta}</span> : null}
        </span>
        <span className={s.rv}>{value}</span>
        <svg className={s.chev} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </Link>
    </li>
  );
}

export function CreatorHomePage({ profile, accountHref, notices, requests, accessLog, incoming, sentGifts, now }: Props) {
  const waiting = requests.length;
  const ongoing = incoming.filter(isIncomingInProgress).length;
  const lastLog = accessLog[0];
  const urgent = requests[0];
  return (
    <main id="main" className={`page-pane ${s.pane}`}>
      <div className={s.stack}>
        <CreatorHead
          label="내 프로필"
          nameAs="h1"
          name={profile.name}
          intro={profile.intro}
          photoUrl={profile.photoUrl}
          initial={profile.initial}
          backgroundUrl={profile.backgroundUrl}
          colors={profile.colors}
          fanName={profile.fanName}
          symbolUrl={profile.symbolUrl}
          actions={
            <>
              <Link className="btn btn--sm" href={CREATOR_PROFILE_EDIT}>
                프로필 수정
              </Link>
              <Link className={s.pfLink} href={accountHref}>
                계정 설정
              </Link>
            </>
          }
        />

        <section aria-labelledby="sc-t">
          <h2 className={s.secT} id="sc-t">
            바로가기
          </h2>
          <ul className={`${s.rows} ${s.secBody}`} aria-label="바로가기">
            <Row
              href="/creator/requests"
              icon="inbox"
              title="승인 대기"
              meta={urgent ? `${urgent.fanNickname}님의 선물이 남은 기간 ${approvalTimeLeftLabel(urgent.registeredAt, now)}로 가장 급해요` : undefined}
              value={
                <>
                  {waiting}
                  <small>건</small>
                </>
              }
            />
            {/* 받은 선물을 한 건씩 보는 화면이 아직 없어 승인 요청 화면(대기·결정한 요청)으로 잇는다 — BACKLOG */}
            <Row
              href="/creator/requests"
              icon="truck"
              title="진행 중인 선물"
              value={
                <>
                  {ongoing}
                  <small>개</small>
                </>
              }
            />
            <Row
              href="/gifts"
              icon="gift"
              title="내가 보낸 선물"
              value={
                <>
                  {sentGifts.length}
                  <small>개</small>
                </>
              }
            />
            <Row
              href="/creator/log"
              icon="eye"
              title="최근 열람 기록"
              meta={lastLog ? undefined : "아직 주소가 열린 적이 없어요"}
              value={lastLog ? <small>{formatDateTime(lastLog.at)}</small> : null}
            />
          </ul>
          <p className={`t-meta ${s.secFoot}`}>{NO_ADDRESS_ASK}</p>
        </section>

        <HomeNotices notices={notices} />
      </div>
    </main>
  );
}
