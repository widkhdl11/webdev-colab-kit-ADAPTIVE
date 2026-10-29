import Link from "next/link";
import { CREATOR_ACTION_CENTER_HREF, daysLeftOf, type ApprovalItem, type CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
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
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./gift-progress.module.css";

// 크리에이터 선물 현황 (action-center INV-J9~J11, design-rules 23-3절, 시안 v37-part2/progress.html · 배송 조회 창은 v21-addendum3/cre-action-center-c.html 창 A).
// 승인 대기는 하늘 판 하나(건수·팬 얼굴·「지금 할 일」), 받는 선물은 같은 모양 카드(5칸 막대 + n/5), 보내는 선물은 보낸 날별 촘촘한 줄.
// 읽기 전용 — 줄·카드는 DB 읽기 한 번의 결과 그대로다.
// 카드·줄마다 다섯 칸 막대 + 단계 이름(단계는 기존 읽기에서 — J9). 늦거나 손이 필요한 줄은 단계 이름을 강조색.
// 버튼은 필요한 줄에만: 배송 조회(보내는 선물의 늦은 입고 전 몫 — J11, 받는 선물에는 없다 카드 d93 ④) ·
// 「내 상자 찾기」(보내는 선물의 입고 전 몫마다, 늦지 않아도 — J10 카드 d96 ①) · 「처리할 일」(처리할 일 읽기 결과에 있는 줄만 — J11).
// 상태를 바꾸는 처리는 여기 없다 — 「내 상자 찾기」 창이 정해진 찾기 처리를 부를 뿐이다(inbound-address-code INV-C4 ②-나).

type Props = {
  progress: GiftProgress;
  /** 크리에이터 처리할 일 읽기 결과 — 사이드바 숫자와 같은 한 번의 읽기(INV-J6). 「처리할 일」 버튼은 이것으로만 정한다 */
  items: readonly CreatorActionItem[];
  /** 「내 상자 찾기」 창의 팬 고르기 후보(결제 끝·입고 전·닫히지 않은 내 몫) */
  candidates: readonly SentBoxCandidate[];
  /** 승인 대기 판의 「가장 가까운 기한」 남은 날을 셀 기준 시각(라우트가 그린 때) */
  now: string;
};

// 단계 이름 — 용어집 4절 표기(출고·배송 중·반송·검수). 「팬꾹 도착 대기」는 입고 전 상태다.
export const PROGRESS_STEP_LABEL: Record<ProgressStepKey, string> = {
  approval_waiting: "승인 대기",
  to_office: "팬꾹 도착 대기",
  inspecting: "검수 중",
  inspected: "검수 완료",
  shipped: "출고",
  in_transit: "배송 중",
  reply_waiting: "수락 대기",
  not_received: "받지 않음",
  late: "미도착",
  returning: "반송",
  // 용어집 dispose_due 행 팬·크리에이터 열
  dispose_due: "처분 예정",
};

/** 단계 이름 앞 숨은 글자 + 보이는 단계 이름 — 막대는 낭독하지 않는다(화면 리뷰 U1) */
function StepLabel({ step, alert }: { step: ProgressStep; alert: boolean }) {
  return (
    <>
      <span className="sr-only">{`5단계 중 ${step.cells}단계, `}</span>
      <b className={alert ? s.plLate : undefined} data-step="" data-late={alert ? "" : undefined}>
        {PROGRESS_STEP_LABEL[step.key]}
      </b>
    </>
  );
}

function Cells({ step, className }: { step: ProgressStep; className: string }) {
  return (
    <span className={className} aria-hidden="true" data-bar="">
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} className={n <= step.cells ? "on" : undefined} data-on={n <= step.cells ? "" : undefined} />
      ))}
    </span>
  );
}

const goActions = (
  <Link className="btn btn--sm btn--line" href={CREATOR_ACTION_CENTER_HREF}>
    지금 할 일
  </Link>
);

export function GiftProgressPage({ progress, items, candidates, now }: Props) {
  const targets = actionTargetsOf(items);
  const findable = new Set(candidates.map((c) => c.shareId));
  const total = countProgress(progress);
  const sentCount = progress.sent.reduce((n, g) => n + g.rows.length, 0);
  // 승인 대기는 하늘 판 하나로 모은다(design-rules 23-3) — 나머지 받는 선물은 같은 모양 카드
  const waiting = progress.received.filter((r) => receivedStepOf(r).key === "approval_waiting");
  const moving = progress.received.filter((r) => receivedStepOf(r).key !== "approval_waiting");
  // 판의 「지금 할 일」도 줄 버튼과 같은 판정 — 처리할 일 읽기에 그 주문이 있을 때만(INV-J11)
  const waitingAction = waiting.some((r) => hasActionButton(r, targets));
  const waitingNos = new Set(waiting.map((r) => r.orderNo));
  const nearest = items
    .filter((it): it is ApprovalItem => it.kind === "approval" && waitingNos.has(it.orderNo))
    .reduce<ApprovalItem | null>((m, it) => (m === null || it.dueAt < m.dueAt ? it : m), null);

  function receivedCard(r: ReceivedProgress, i: number) {
    const step = receivedStepOf(r);
    const action = hasActionButton(r, targets);
    const when = r.approvedAt ? `${formatMonthDayKo(r.approvedAt)} 승인` : `${formatMonthDayKo(r.requestedAt)} 요청`;
    return (
      <li key={r.orderNo} className={action ? `${s.gcard} ${s.hi}` : `card ${s.gcard}`} data-row="">
        <div className={s.top}>
          <FaceAvatar index={i} className="face face--sm" />
          <strong data-title="">{`${r.nickname}님`}</strong>
        </div>
        <div>
          <h3 className={s.name}>{r.itemKind}</h3>
          <p className={s.what} data-sub="">{`상자 ${r.boxCount}개 · ${when}`}</p>
        </div>
        <div className={s.prog}>
          <Cells step={step} className={s.pbar} />
          <p className={s.pfoot}>
            <StepLabel step={step} alert={action} />
            <span aria-hidden="true">{`${step.cells}/5`}</span>
          </p>
        </div>
        {action ? <div className={s.cardAct}>{goActions}</div> : null}
      </li>
    );
  }

  function sentRow(r: SentProgress, sentAt: string, i: number) {
    const step = sentStepOf(r);
    const action = hasActionButton(r, targets);
    const meta = `${r.nickname}님 · ${tierName(r.tier)} 상자 · ${formatMonthDayKo(sentAt)} 결제 완료`;
    return (
      <li key={r.orderNo} className={`lrow ${s.row}`} data-row="">
        <FaceAvatar index={i} className="face face--sm" />
        <p className="lrow-txt">
          <strong data-title="">{`${r.nickname}님`}</strong>
          <span className="meta" data-sub="">{`${tierName(r.tier)} 상자`}</span>
        </p>
        <div className={`lrow-side ${s.side}`}>
          <span className={`mini-steps ${s.mini}`}>
            <Cells step={step} className="segs" />
            <StepLabel step={step} alert={step.key === "late" || action} />
          </span>
          {canTrack(r) ? <TrackBoxButton className="btn btn--sm btn--line" meta={meta} label={`배송 조회(${r.nickname}님)`} /> : null}
          {canFind(r, findable) ? (
            <FindSentBoxButton className="btn btn--sm btn--line" candidates={candidates} shareId={r.shareId} meta={`${formatMonthDayKo(sentAt)} 결제 완료`} label={`내 상자 찾기(${r.nickname}님)`} />
          ) : null}
          {action ? goActions : null}
        </div>
      </li>
    );
  }

  let face = 0;
  return (
    <div className={`v34 ${s.root}`}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            선물 현황<span className="ph-count">· 진행 중 {total}건</span>
          </h1>
        </div>
      </header>

      {waiting.length > 0 ? (
        <section className={`feat ${s.pfeat}`} aria-labelledby="gp-wait" data-waiting="">
          <img className={s.peek} src="/images/home/icon-approve.webp" alt="" width={80} height={80} />
          <div>
            <p className="num-big">
              {waiting.length}
              <small>건</small>
            </p>
            <span className={s.lab}>승인 대기</span>
          </div>
          <div className={s.mid}>
            <h2 id="gp-wait">승인 대기 선물</h2>
            {nearest ? (
              <p>
                가장 빠른 승인 기한: <span className={s.soon}>{daysLeftOf(nearest.dueAt, now).text}</span> · {nearest.nickname}님의 선물
              </p>
            ) : null}
            <span className={s.faces} aria-hidden="true">
              {waiting.slice(0, 5).map((r) => (
                <FaceAvatar key={r.orderNo} index={face++} className="face face--sm" />
              ))}
            </span>
          </div>
          {waitingAction ? (
            <Link className="btn" href={CREATOR_ACTION_CENTER_HREF}>
              지금 할 일
            </Link>
          ) : null}
        </section>
      ) : null}

      <section className={s.sec} aria-labelledby="gp-in">
        <div className={s.secbar}>
          <h2 id="gp-in">
            받는 선물<small>{moving.length}건</small>
          </h2>
          <Link href="/creator/boxes">받은 선물 전체 ›</Link>
        </div>
        {moving.length > 0 ? (
          <ul className={s.gcards} aria-label="받는 선물">
            {moving.map((r) => receivedCard(r, face++))}
          </ul>
        ) : (
          <p className={s.none}>진행 중인 선물이 없습니다.</p>
        )}
      </section>

      <section className={s.sec} aria-labelledby="gp-out">
        <div className={s.secbar}>
          <h2 id="gp-out">
            보내는 선물<small>{sentCount}건</small>
          </h2>
          <Link href="/creator/revgifts">보낸 내역 전체 ›</Link>
        </div>
        {progress.sent.length > 0 ? (
          progress.sent.map((g) => (
            <div key={g.sentAt}>
              <p className={s.ghead} data-subhead="">
                {formatDateTime(g.sentAt)} 결제 완료<span> · 팬 {g.rows.length}명</span>
              </p>
              <ul className={`lrows ${s.rows}`} aria-label={`${formatDateTime(g.sentAt)} 결제 완료`}>
                {g.rows.map((r) => sentRow(r, g.sentAt, face++))}
              </ul>
            </div>
          ))
        ) : (
          <p className={s.none}>진행 중인 선물이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
