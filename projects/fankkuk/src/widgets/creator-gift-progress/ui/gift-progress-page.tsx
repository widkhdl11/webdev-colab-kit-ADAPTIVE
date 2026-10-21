import Link from "next/link";
import type { ReactNode } from "react";
import { CREATOR_ACTION_CENTER_HREF, type CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
import { actionTargetsOf, hasActionButton } from "../model/action-targets";
import {
  canFind,
  canTrack,
  countProgress,
  receivedStepOf,
  sentStepOf,
  type GiftProgress,
  type ProgressStep,
  type ProgressStepKey,
  type ReceivedProgress,
  type SentProgress,
} from "../model/gift-progress";
import { tierName } from "@/entities/parcel/model/size-tier";
import type { SentBoxCandidate } from "@/features/box-waybill/ui/find-sent-box";
import { FindSentBoxButton } from "@/features/box-waybill/ui/find-sent-box-button";
import { TrackBoxButton } from "@/features/box-waybill/ui/track-box-button";
import { formatDateTime, formatMonthDayKo } from "@/shared/lib/format/datetime";
import s from "./gift-progress.module.css";

// 크리에이터 선물 현황 (action-center INV-J9~J11, design-rules 13절, 시안 v21-addendum3/cre-progress.html · 배송 조회 창은 cre-action-center-c.html 창 A).
// 읽기 전용 — 판 둘: 「받는 선물」(선물마다 한 줄) · 「보내는 선물」(역조공은 보낸 날별 소제목 아래 팬마다 한 줄). 줄은 DB 읽기 한 번의 결과 그대로다.
// 줄 오른쪽에 다섯 칸 막대 + 단계 이름(단계는 기존 읽기에서 — J9). 늦거나 손이 필요한 줄은 단계 이름을 강조색.
// 버튼은 필요한 줄에만: 배송 조회(보내는 선물의 늦은 입고 전 몫 — J11, 받는 선물에는 없다 카드 d93 ④) ·
// 「내 상자 찾기」(보내는 선물의 입고 전 몫마다, 늦지 않아도 — J10 카드 d96 ①) · 「처리할 일」(처리할 일 읽기 결과에 있는 줄만 — J11).
// 상태를 바꾸는 처리는 여기 없다 — 「내 상자 찾기」 창이 정해진 찾기 처리를 부를 뿐이다(inbound-address-code INV-C4 ②-나).

type Props = {
  progress: GiftProgress;
  /** 크리에이터 처리할 일 읽기 결과 — 사이드바 숫자와 같은 한 번의 읽기(INV-J6). 「처리할 일」 버튼은 이것으로만 정한다 */
  items: readonly CreatorActionItem[];
  /** 「내 상자 찾기」 창의 팬 고르기 후보(결제 끝·입고 전·닫히지 않은 내 몫) */
  candidates: readonly SentBoxCandidate[];
};

// 단계 이름 — 용어집 4절 표기(출고·배송 중·반송·검수). 「사무실로 오는 중」은 용어집에 행이 없어 시안 표기를 임시로 쓴다.
export const PROGRESS_STEP_LABEL: Record<ProgressStepKey, string> = {
  approval_waiting: "승인 대기",
  to_office: "사무실로 오는 중",
  inspecting: "검수 중",
  inspected: "검수 완료",
  shipped: "출고",
  in_transit: "배송 중",
  reply_waiting: "수락 대기",
  not_received: "받지 않음",
  late: "아직 도착하지 않았어요",
  returning: "반송",
  // 용어집 dispose_due 행 팬·크리에이터 열
  dispose_due: "처분 예정",
};

const PATHS = {
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  send: (
    <>
      <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
      <path d="m21.854 2.147-10.94 10.939" />
    </>
  ),
  package: (
    <>
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <path d="m7.5 4.27 9 5.15" />
    </>
  ),
  search: (
    <>
      <path d="M12 22V12" />
      <path d="M20.27 18.27 22 20" />
      <path d="M21 10.498V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.729l7 4a2 2 0 0 0 2 .001l.98-.559" />
      <path d="M3.29 7 12 12l8.71-5" />
      <path d="m7.5 4.27 8.997 5.148" />
      <circle cx="18.5" cy="16.5" r="2.5" />
    </>
  ),
  truck: (
    <>
      <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
} as const;
type IconKey = keyof typeof PATHS;

const STEP_ICON: Record<ProgressStepKey, IconKey> = {
  approval_waiting: "inbox",
  to_office: "package",
  late: "package",
  not_received: "package",
  inspecting: "search",
  inspected: "search",
  returning: "search",
  dispose_due: "search",
  shipped: "truck",
  in_transit: "truck",
  reply_waiting: "clock",
};

function Ico({ name }: { name: IconKey }) {
  return (
    <svg className={s.ico} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

/** 줄 아래 작은 글씨 — 사이 점은 낭독하지 않는다 */
function Sub({ parts }: { parts: readonly string[] }) {
  return (
    <span className={s.sub} data-sub="">
      {parts.flatMap((p, i) => [
        ...(i === 0
          ? []
          : [
              <span key={`s${i}`} className={s.sep} aria-hidden="true">
                ·
              </span>,
            ]),
        <span key={`p${i}`}>{p}</span>,
      ])}
    </span>
  );
}

function Progress({ step, alert }: { step: ProgressStep; alert: boolean }) {
  const label = PROGRESS_STEP_LABEL[step.key];
  return (
    <div className={s.prog}>
      <span className={s.bar} aria-hidden="true" data-bar="">
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} className={n <= step.cells ? s.on : undefined} data-on={n <= step.cells ? "" : undefined} />
        ))}
      </span>
      <span className="sr-only">{`5단계 중 ${step.cells}단계, `}</span>
      <span className={`${s.pl} ${alert ? s.plLate : ""}`} data-step="" data-late={alert ? "" : undefined}>
        {label}
      </span>
    </div>
  );
}

function Row({ tone, icon, title, sub, progress, actions }: { tone?: "alert" | "appr"; icon: IconKey; title: string; sub: ReactNode; progress: ReactNode; actions: ReactNode }) {
  return (
    <li className={`${s.task} ${tone ? s[tone] : ""}`}>
      <span className={s.ti} aria-hidden="true">
        <Ico name={icon} />
      </span>
      <div className={s.tb}>
        <span className={s.tt} data-title="">
          {title}
        </span>
        {sub}
      </div>
      <div className={s.ta}>
        {progress}
        {actions}
      </div>
    </li>
  );
}

const goActions = (
  <Link className="btn" href={CREATOR_ACTION_CENTER_HREF}>
    지금 할 일
  </Link>
);

export function GiftProgressPage({ progress, items, candidates }: Props) {
  const targets = actionTargetsOf(items);
  const findable = new Set(candidates.map((c) => c.shareId));
  const total = countProgress(progress);
  const sentCount = progress.sent.reduce((n, g) => n + g.rows.length, 0);

  function receivedRow(r: ReceivedProgress) {
    const step = receivedStepOf(r);
    const action = hasActionButton(r, targets);
    const when = r.approvedAt ? `${formatMonthDayKo(r.approvedAt)} 승인` : `${formatMonthDayKo(r.requestedAt)} 요청`;
    return (
      <Row
        key={r.orderNo}
        tone={step.key === "approval_waiting" ? "appr" : action ? "alert" : undefined}
        icon={STEP_ICON[step.key]}
        title={`${r.nickname}님의 선물`}
        sub={<Sub parts={[r.itemKind, `상자 ${r.boxCount}개`, when]} />}
        progress={<Progress step={step} alert={action} />}
        actions={action ? goActions : null}
      />
    );
  }

  function sentRow(r: SentProgress, sentAt: string) {
    const step = sentStepOf(r);
    const action = hasActionButton(r, targets);
    const meta = `${r.nickname}님 · ${tierName(r.tier)} 상자 · ${formatMonthDayKo(sentAt)} 보냄`;
    return (
      <Row
        key={r.orderNo}
        icon={STEP_ICON[step.key]}
        title={`${r.nickname}님`}
        sub={<Sub parts={[`${tierName(r.tier)} 상자`]} />}
        progress={<Progress step={step} alert={step.key === "late" || action} />}
        actions={
          <>
            {canTrack(r) ? <TrackBoxButton meta={meta} label={`배송 조회(${r.nickname}님)`} /> : null}
            {canFind(r, findable) ? (
              <FindSentBoxButton className="btn btn--line" candidates={candidates} shareId={r.shareId} meta={`${formatMonthDayKo(sentAt)} 보냄`} label={`내 상자 찾기(${r.nickname}님)`} />
            ) : null}
            {action ? goActions : null}
          </>
        }
      />
    );
  }

  return (
    <div className={s.root}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            선물 현황<span className="ph-count">진행 중 {total}건</span>
          </h1>
        </div>
      </header>

      <section className={s.panel} aria-labelledby="gp-in">
        <div className={s.panelH}>
          <Ico name="inbox" />
          <h2 id="gp-in">받는 선물</h2>
          <span className={s.cnt} aria-hidden="true">
            {progress.received.length}
          </span>
          <span className="sr-only">{progress.received.length}건</span>
          <Link className={s.more} href="/creator/boxes">
            받은 선물 전체
          </Link>
        </div>
        {progress.received.length > 0 ? (
          <ul className={s.tasks} aria-label="받는 선물">
            {progress.received.map(receivedRow)}
          </ul>
        ) : (
          <p className={s.none}>진행 중인 선물이 없어요</p>
        )}
      </section>

      <section className={s.panel} aria-labelledby="gp-out">
        <div className={s.panelH}>
          <Ico name="send" />
          <h2 id="gp-out">보내는 선물</h2>
          <span className={s.cnt} aria-hidden="true">
            {sentCount}
          </span>
          <span className="sr-only">{sentCount}건</span>
          <Link className={s.more} href="/creator/revgifts">
            보낸 내역 전체
          </Link>
        </div>
        {progress.sent.length > 0 ? (
          progress.sent.map((g) => (
            <div key={g.sentAt}>
              <p className={s.subH} data-subhead="">
                {formatDateTime(g.sentAt)} 보낸 역조공 <span className={s.subMeta}>· 팬 {g.rows.length}명</span>
              </p>
              <ul className={s.tasks} aria-label={`${formatDateTime(g.sentAt)} 보낸 역조공`}>
                {g.rows.map((r) => sentRow(r, g.sentAt))}
              </ul>
            </div>
          ))
        ) : (
          <p className={s.none}>진행 중인 선물이 없어요</p>
        )}
      </section>
    </div>
  );
}
