import Link from "next/link";
import type { AddressAccessEntry } from "@/entities/address/model/access-log";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeLeftLabel } from "@/entities/order/model/approval-time-left";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { isIncomingInProgress, type IncomingGiftView } from "@/entities/order/model/incoming-gift";
import type { SendAvailability } from "@/features/gift-register/model/sender-rule";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { statusTagClass } from "@/shared/ui/status-tone";
import { BrandPanel } from "./brand-panel";
import s from "./home.module.css";
import { HomeNotices, type HomeNotice } from "./home-notices";
import { NewCreators } from "./new-creators";

// 크리에이터 메인 — 로그인하면 먼저 나오는 첫 화면. 시안: docs/design/mockups/site/v9-home/creator-a.html (카드 d40)
// 팬 메인과 같은 틀이다: 왼쪽 서비스 첫 판 + 오른쪽 내 카드, 아래 새로 들어온 크리에이터 · 공지.
// 사용자 「기본적으로 서비스 플랫폼이다. 너~~무 배송업무 중심으로만 보이면 사이트가 정나미 없을 거 같아」.
// 필수 다섯(오늘 승인할 선물 · 진행 중인 선물 · 최근 열람 기록 · 공지 · 내가 보낸 선물, 카드 d15)은 내 카드와 공지에 모두 있다.
// 이 화면에는 서명 버튼을 두지 않는다 — 승인은 승인 요청 화면에서 한 건씩 서명한다.
// 「진행 중인 선물」은 받은 선물 읽기(my_incoming_gifts, office-workflow INV-W9)로 센다 — 결제 완료부터 배송중까지.
// 헤더·푸터는 라우트(app)가 붙인다.

type Props = {
  nickname: string;
  /** 승인 대기 요청, 오래 기다린 것부터(= 남은 기간이 짧은 순). */
  requests: readonly ApprovalRequestView[];
  /** 최근 열람 기록, 최근 순. 첫 줄만 쓴다. */
  accessLog: readonly AddressAccessEntry[];
  notices: readonly HomeNotice[];
  /** 나에게 온 선물의 진행 단계(끝난 것 포함 — 진행 중인 것만 이 화면이 센다). */
  incoming: readonly IncomingGiftView[];
  /** 내가(로그인한 사람이) 보낸 선물. */
  sentGifts: readonly FanGiftView[];
  /** 찾기에 나오는 크리에이터, 최근에 들어온 순. */
  /** 자기 자신은 뺀 목록. */
  newest: readonly CreatorCard[];
  /** 카드마다 「선물 보내기」 자리 — 라우트가 sendAvailabilityOf 로 정한다. */
  sendOf: Readonly<Record<string, SendAvailability>>;
  /** 승인 대기의 남은 기간을 세는 기준 시각 — 화면을 그리는 서버가 넘긴다 */
  now: string;
};

/** 내 카드에 보이는 승인 대기 줄 수 */
const MAX_REQUESTS = 2;

/** 「최근 열람 기록」은 한 줄만 쓴다 — 라우트가 이만큼만 읽는다. */
export const CREATOR_HOME_LOG_ROWS = 1;

function MyCard({ nickname, requests, accessLog, incoming, sentGifts, now }: Omit<Props, "notices" | "newest" | "sendOf">) {
  const waiting = requests.length;
  const ongoing = incoming.filter(isIncomingInProgress).length;
  const lastLog = accessLog[0];
  return (
    <aside className={s["me-card"]} aria-labelledby="me-title">
      <div className={s.hi}>
        <h2 id="me-title">{nickname}님</h2>
        <span className={s.sub}>크리에이터</span>
      </div>
      <p className={s["wait-big"]}>
        <span className={s.n}>승인 대기</span>
        <b>{waiting}</b>
        <span className={s.n}>건</span>
      </p>
      {waiting === 0 ? (
        <p className={`${s.sub} ${s["me-empty"]}`}>기다리는 승인 요청이 없어요.</p>
      ) : (
        <ul className={s["me-gifts"]} aria-label="승인 대기 선물 중 남은 기간이 짧은 순서">
          {requests.slice(0, MAX_REQUESTS).map((r, i) => (
            <li key={r.orderNo}>
              <Link href="/creator/requests" aria-label={`${r.fanNickname}님의 선물 · ${approvalTimeLeftLabel(r.registeredAt, now)} · 승인하러 가기`}>
                <FaceAvatar index={i} className={`face ${s["face-sm"]}`} />
                <span className={s.w}>{r.fanNickname}님의 선물</span>
                <span className={statusTagClass("warn")}>{approvalTimeLeftLabel(r.registeredAt, now)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link className={waiting === 0 ? "btn btn--soft" : "btn"} href="/creator/requests">
        {waiting === 0 ? "승인 요청 보기" : "승인하러 가기"}
      </Link>
      <ul className={s["me-links"]}>
        {/* 받은 선물을 한 건씩 보는 화면이 아직 없어 승인 요청 화면(대기·결정한 요청)으로 잇는다 — BACKLOG */}
        <li>
          <Link href="/creator/requests">
            <span>진행 중인 선물</span>
            <b>{ongoing}개</b>
            <span className={s.accent} aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
        <li>
          <Link href="/gifts">
            <span>내가 보낸 선물</span>
            <b>{sentGifts.length}개</b>
            <span className={s.accent} aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
        <li>
          <Link href="/creator/log">
            <span>{lastLog ? `최근 열람 ${formatDateTime(lastLog.at)}` : "아직 주소가 열린 적이 없어요"}</span>
            <span className={s.accent} aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
      </ul>
    </aside>
  );
}

export function CreatorHomePage({ notices, newest, sendOf, ...mine }: Props) {
  return (
    <main id="main">
      <section className={s["hero-wrap"]} aria-labelledby="hero-title">
        <div className="container">
          <div className={s.hero}>
            <BrandPanel />
            <MyCard {...mine} />
          </div>
        </div>
      </section>

      <section className="block" aria-labelledby="new-title">
        <div className="container">
          <div className="block-head">
            <h2 id="new-title">새로 들어온 크리에이터</h2>
            <Link className="link-arrow" href="/creators">
              전체 보기 ›
            </Link>
          </div>
          <NewCreators creators={newest} sendOf={sendOf} />
        </div>
      </section>

      <HomeNotices notices={notices} />
      <div className="page-end" />
    </main>
  );
}
