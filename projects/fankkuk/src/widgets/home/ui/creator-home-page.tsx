import Link from "next/link";
import type { AddressAccessEntry } from "@/entities/address/model/access-log";
import { approvalTimeLeftLabel } from "@/entities/order/model/approval-time-left";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { isIncomingInProgress, type IncomingGiftView } from "@/entities/order/model/incoming-gift";
import { NO_ADDRESS_ASK } from "@/shared/config/site-copy";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { statusTagClass } from "@/shared/ui/status-tone";
import s from "./home.module.css";
import { HomeNotices, type HomeNotice } from "./home-notices";

// 크리에이터 홈 — 로그인하면 먼저 나오는 첫 화면. 시안: docs/design/mockups/site/v21-addendum3/cre-home.html(design-rules 12절 「홈」), 본문 틀 기본 880.
// 12절: 제목 「홈」과 「새로 들어온 크리에이터」 격자는 없다. h1 은 공개 이름. 시안의 프로필 구간(배경 띠·소개)·팬덤 뱃지는 아직 없는 데이터라
// 두지 않는다 — 그 전까지 내 구간 머리의 공개 이름이 h1 이다. 그 아래 내 구간(승인 대기 판 + 카드 셋) · 공지.
// 필수 다섯(오늘 승인할 선물 · 진행 중인 선물 · 최근 열람 기록 · 공지 · 내가 보낸 선물, 카드 d15)은 내 카드와 공지에 모두 있다.
// 이 화면에는 서명 버튼을 두지 않는다 — 승인은 승인 요청 화면에서 한 건씩 서명한다.
// 「진행 중인 선물」은 받은 선물 읽기(my_incoming_gifts, office-workflow INV-W9)로 센다 — 결제 완료부터 배송중까지.
// 헤더·푸터는 라우트(app)가 붙인다.

type Props = {
  /** 공개 이름(크리에이터 페이지에 보이는 이름) — 시안 .pf-name 자리의 h1 */
  publicName: string;
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

/** 내 카드에 보이는 승인 대기 줄 수 */
const MAX_REQUESTS = 2;

/** 「최근 열람 기록」은 한 줄만 쓴다 — 라우트가 이만큼만 읽는다. */
export const CREATOR_HOME_LOG_ROWS = 1;

function MySection({ publicName, requests, accessLog, incoming, sentGifts, now }: Omit<Props, "notices">) {
  const waiting = requests.length;
  const ongoing = incoming.filter(isIncomingInProgress).length;
  const lastLog = accessLog[0];
  return (
    <section aria-labelledby="me-title">
      <div className={s.secHead}>
        <h1 id="me-title">
          {publicName} <span className={s.role}>크리에이터</span>
        </h1>
      </div>
      <div className={`card ${s.soft}`}>
        <h3>승인 대기</h3>
        <p className={s.big}>
          {waiting}
          <small>건</small>
        </p>
        {waiting === 0 ? (
          <p className="t-meta">기다리는 승인 요청이 없어요.</p>
        ) : (
          <ul className={s.waitList} aria-label="승인 대기 선물 중 남은 기간이 짧은 순서">
            {requests.slice(0, MAX_REQUESTS).map((r, i) => (
              <li key={r.orderNo}>
                <Link href="/creator/requests" aria-label={`${r.fanNickname}님의 선물 · ${approvalTimeLeftLabel(r.registeredAt, now)} · 승인하러 가기`}>
                  <FaceAvatar index={i} className={s.faceSm} />
                  <span className="w">{r.fanNickname}님의 선물</span>
                  <span className={statusTagClass("warn")}>{approvalTimeLeftLabel(r.registeredAt, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Link className={waiting === 0 ? "btn btn--line" : "btn"} href="/creator/requests">
            {waiting === 0 ? "승인 요청 보기" : "승인하러 가기"}
          </Link>
        </div>
      </div>
      <div className={`grid cols-3 ${s.cards3}`}>
        {/* 받은 선물을 한 건씩 보는 화면이 아직 없어 승인 요청 화면(대기·결정한 요청)으로 잇는다 — BACKLOG */}
        <Link className={`card ${s.linkCard}`} href="/creator/requests">
          <h3>진행 중인 선물</h3>
          <p className={s.big}>
            {ongoing}
            <small>개</small>
          </p>
        </Link>
        <Link className={`card ${s.linkCard}`} href="/gifts">
          <h3>내가 보낸 선물</h3>
          <p className={s.big}>
            {sentGifts.length}
            <small>개</small>
          </p>
        </Link>
        <Link className={`card ${s.linkCard}`} href="/creator/log">
          <h3>최근 열람 기록</h3>
          <p>{lastLog ? `최근 열람 ${formatDateTime(lastLog.at)}` : "아직 주소가 열린 적이 없어요"}</p>
        </Link>
      </div>
      {/* 링크 카드 밖 — 카드 안에 두면 안내문이 링크 이름에 섞이고 이 카드만 높아진다(ui 리뷰 2026-10-14) */}
      <p className="t-meta">{NO_ADDRESS_ASK}</p>
    </section>
  );
}

export function CreatorHomePage({ notices, ...mine }: Props) {
  return (
    <main id="main" className={`page-pane ${s.pane}`}>
      <div className={s.stack}>
        <MySection {...mine} />
        <HomeNotices notices={notices} />
      </div>
    </main>
  );
}
