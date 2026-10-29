"use client";

import { giftDetailHref } from "@/entities/action-item/model/action-items";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { priorHistoryLabel } from "@/entities/order/model/prior-history";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import {
  daysLeftOf,
  splitBoards,
  type ApprovalItem,
  type BluetoothItem,
  type CreatorActionItem,
  type ReturnAddressItem,
  type SentGiftItem,
  type TrackerItem,
  type UnconfirmedItem,
} from "@/entities/action-item/model/creator-action-items";
import { disposeDueText } from "@/entities/action-item/model/action-items";
import { tierName } from "@/entities/parcel/model/size-tier";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import type { SentBoxCandidate } from "@/features/box-waybill/ui/find-sent-box";
import { FindSentBoxButton } from "@/features/box-waybill/ui/find-sent-box-button";
import { BluetoothWindow, boxPlace, CancelChoiceButton, choiceText, signalThing } from "@/features/creator-check/ui/bluetooth-window";
import { TrackerWindow, trackerChoiceText } from "@/features/creator-check/ui/tracker-window";
import { formatDateTime, formatMonthDayKo, seoulDaysUntil } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { ApprovalWindowWithAddress } from "./approval-window-with-address";
import { CreatorReturnAddressButton } from "./creator-return-address-button";
import s from "./creator-action-center.module.css";

// 크리에이터 처리할 일 (action-center INV-J5~J8, design-rules 23-3절 A안, 시안 v37-part2/actions-a.html · 창은 v21-addendum3/cre-action-center-c.html).
// 가장 급한 승인 요청 하나는 하늘 판(받지 않기·승인하기 — 둘 다 지금의 승인 창을 연다), 나머지 승인 요청은 카드 2열, 확인할 상자·보낸 선물 쪽 일은 촘촘한 줄.
// 줄은 처리할 일 읽기 한 번의 결과 그대로 — 판·순서도 DB 가 정했다. 제목 옆 숫자·판 머리 숫자는 그 줄 수이고 사이드바 숫자와 같은 결과다(J6).
// 버튼은 새 처리 길을 만들지 않고 정해진 처리를 부른다(J8): 추적 장치 = 신고하기·신고하지 않기 고르기와 취소(블루투스와 같은 고르기 함수, office-workflow INV-W14),
// 블루투스 = 받기·거절 고르기와 취소, 승인 = 카카오톡 서명 승인·받지 않기, 반송 주소 = 반송 주소 확인 창(office-workflow INV-W15),
// 미확인 상자 = 송장번호·택배사와 팬 고르기를 한 번에(창 B), 보낸 팬 선물 = 팬 처리할 일과 같은 처리(차액은 선물 상세의 결제, 늦은 상자는 「받는 주소 없이 보냈어요」).
// 처리가 끝나면 다음 읽기에서 줄이 없다 — 블루투스는 고르기만 한 동안 남는다(고른 쪽 + 취소).

type Props = {
  items: readonly CreatorActionItem[];
  /** 남은 날을 셀 기준 시각(라우트가 그린 때) */
  now: string;
  /** 미확인 상자 창의 팬 고르기 후보(로그인한 크리에이터의 결제 끝·입고 전 몫) */
  candidates: readonly SentBoxCandidate[];
  address: MyAddressStatus | null;
  sealingKeyPem: string | null;
};

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 줄 설명 — 「종류 · 남은 날 · 나머지」 */
function metaOf(kind: string, due: { text: string } | null, rest: readonly string[]): string {
  return [kind, ...(due ? [due.text] : []), ...rest].join(" · ");
}

/** 촘촘한 줄(시안 v37 .drow — 공통 .lrow). 얼굴 없는 줄: 제목 + 설명, 오른쪽 버튼 */
function Row({ title, meta, action }: { title: string; meta: string; action: ReactNode }) {
  return (
    <li className={`lrow ${s.row}`} data-row="">
      <p className="lrow-txt">
        <strong data-title="">{title}</strong>
        <span className="meta">{meta}</span>
      </p>
      <div className={`lrow-side ${s.side}`}>{action}</div>
    </li>
  );
}

/** 남은 날 큰 숫자 — 「2일 남음」·「오늘까지」(서울 날짜, INV-J5) */
function DueBig({ dueAt, now }: { dueAt: string; now: string }) {
  const days = seoulDaysUntil(dueAt, now);
  return (
    <p className={`num-big ${s.dueBig}`}>
      {days > 0 ? `${days}일` : "오늘"} <small>{days > 0 ? "남음" : "까지"}</small>
    </p>
  );
}

type Open =
  | { kind: "tracker"; item: TrackerItem }
  | { kind: "bluetooth"; item: BluetoothItem }
  | { kind: "approval"; item: ApprovalItem; start: "ask" | "no" }
  | { kind: "missing_box"; item: Extract<SentGiftItem, { kind: "missing_box" }> }
  | null;

const keyOf = (it: CreatorActionItem) => `${it.kind}:${it.orderNo}:${"boxSeq" in it ? it.boxSeq : "-"}`;

export function CreatorActionCenterPage({ items, now, candidates, address, sealingKeyPem }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const { received, sent } = splitBoards(items);

  const checks = received.filter((it): it is TrackerItem | BluetoothItem => it.kind !== "approval");
  const approvals = received.filter((it): it is ApprovalItem => it.kind === "approval");
  // 가장 급한 승인 요청 하나만 하늘 판(design-rules 23-3 A안) — 읽기가 기한이 짧은 순으로 준다(INV-J5), 나머지는 카드
  const [top, ...restApprovals] = approvals;

  function checkRow(it: TrackerItem | BluetoothItem) {
    const due = daysLeftOf(it.dueAt, now);
    if (it.kind === "tracker") {
      return (
        <Row
          key={keyOf(it)}
          title={`${it.nickname}님 선물 · 추적 장치 발견`}
          meta={metaOf("추적 장치 발견", due, [`${it.itemKind} · ${boxPlace(it)}`])}
          action={
            it.choice ? (
              <>
                <span className={s.picked}>{trackerChoiceText(it.choice)}</span>
                <CancelChoiceButton item={it} label={trackerChoiceText(it.choice)} />
              </>
            ) : (
              <button className="btn btn--sm btn--line" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "tracker", item: it })}>
                신고할지 정하기
              </button>
            )
          }
        />
      );
    }
    return (
      <Row
        key={keyOf(it)}
        title={`${it.nickname}님 선물 · ${signalThing(it)} 발견`}
        meta={metaOf("기기 발견", due, [`${it.itemKind} · ${boxPlace(it)} · 추적 장치 아님`])}
        action={
          it.choice ? (
            <>
              <span className={s.picked}>{choiceText(it.choice)}</span>
              <CancelChoiceButton item={it} label={choiceText(it.choice)} />
            </>
          ) : (
            <button className="btn btn--sm btn--line" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "bluetooth", item: it })}>
              받을지 정하기
            </button>
          )
        }
      />
    );
  }

  function approvalCard(it: ApprovalItem, i: number) {
    const due = daysLeftOf(it.dueAt, now);
    return (
      <li key={keyOf(it)} className={`card ${s.acard}`} data-row="">
        <div className={s.atop}>
          <FaceAvatar index={i + 1} className="face face--sm" />
          <div>
            <strong data-title="">{`${it.nickname}님의 선물 승인 요청`}</strong>
            <span>{`${it.itemKind} · 상자 ${it.boxCount}개`}</span>
          </div>
        </div>
        <div className={s.afoot}>
          <span>{`${due.text} · ${formatMonthDayKo(it.dueAt)}까지`}</span>
          <button className="btn btn--sm btn--line" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "approval", item: it, start: "ask" })}>
            승인하기
          </button>
        </div>
      </li>
    );
  }

  function sentRow(it: UnconfirmedItem | SentGiftItem | ReturnAddressItem) {
    if (it.kind === "return_address") {
      // 보낸 역조공 몫(상자 순번 없음) 또는 보낸 팬 선물의 상자 — 용어집 return_address·dispose_due 행
      const title = it.boxSeq === null ? `${it.nickname}님께 보낸 역조공` : `${it.nickname}님께 보낸 선물 · 상자 ${it.boxSeq}`;
      return (
        <Row
          key={keyOf(it)}
          title={title}
          meta={metaOf("반송 주소 확인", null, [disposeDueText(it.dueAt)])}
          action={<CreatorReturnAddressButton target={{ orderNo: it.orderNo, boxSeq: it.boxSeq }} meta={title} address={address} sealingKeyPem={sealingKeyPem} />}
        />
      );
    }
    if (it.kind === "unconfirmed") {
      return (
        <Row
          key={keyOf(it)}
          title={`${it.nickname}님께 보낸 상자 미도착`}
          // 14일이면 받는 주소 없이 온 보류 상자는 이미 반송된 뒤라 찾기를 권하지 않는다 — 「미도착 상자 찾기」로만(카드 d96 ②)
          meta={metaOf("미도착 상자", null, [`${formatMonthDayKo(it.sentAt)} 결제 완료`])}
          action={
            <FindSentBoxButton
              className="btn btn--sm btn--line"
              candidates={candidates}
              shareId={it.shareId}
              meta={`${formatMonthDayKo(it.sentAt)} 결제 완료`}
              label={`내 상자 찾기(${it.nickname}님)`}
            />
          }
        />
      );
    }
    const due = daysLeftOf(it.dueAt, now);
    if (it.kind === "unpaid") {
      // 결제 대기(payment INV-M22 ⑤) — 결제는 선물 상세 맨 위 칸의 「결제하기」에서만 시작된다(INV-J13). 이 줄은 그 칸을 펼친 상세로 간다
      return (
        <Row
          key={keyOf(it)}
          title={`${it.creatorName}님께 보낼 선물`}
          meta={metaOf("결제 대기", due, [won(it.amountKrw)])}
          action={
            <Link className="btn btn--sm btn--line" href={giftDetailHref(it.orderNo, true)}>
              결제하기
            </Link>
          }
        />
      );
    }
    const title = `${it.creatorName}님께 보낸 선물 · 상자 ${it.boxSeq}`;
    if (it.kind === "difference") {
      return (
        <Row
          key={keyOf(it)}
          title={title}
          meta={metaOf("추가 결제", due, [won(it.amountKrw)])}
          action={
            <Link className="btn btn--sm btn--line" href={`/gifts/${encodeURIComponent(it.orderNo)}`}>
              추가 결제
            </Link>
          }
        />
      );
    }
    return (
      <Row
        key={keyOf(it)}
        title={title}
        meta={metaOf("미도착 상자", due, [tierName(it.declaredTier)])}
        action={
          <button className="btn btn--sm btn--line" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "missing_box", item: it })}>
            상자 찾기
          </button>
        }
      />
    );
  }

  return (
    <div className={`v34 ${s.root}`}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            지금 할 일{items.length > 0 ? <span className="ph-count">{items.length}건</span> : null}
          </h1>
        </div>
      </header>

      {items.length === 0 ? (
        <section className={s.empty} aria-labelledby="ca-empty">
          <img className={s.emptyImg} src="/images/home/icon-approve.webp" alt="" width={96} height={96} />
          <h2 id="ca-empty">현재 처리할 일이 없습니다</h2>
          <Link className="btn btn--line" href="/creator">
            홈으로
          </Link>
        </section>
      ) : null}

      {/* 받은 선물 판의 순서는 읽기가 정한다(INV-J5 — 추적 장치·블루투스 발견이 승인 요청보다 앞) */}
      {checks.length > 0 ? (
        <section className={s.sec} aria-labelledby="ca-in">
          <h2 className={s.secH} id="ca-in">
            받은 선물<small>{checks.length}건</small>
          </h2>
          <ul className={`lrows ${s.rows}`}>{checks.map(checkRow)}</ul>
        </section>
      ) : null}

      {top ? (
        <section className={`feat ${s.hero}`} aria-labelledby="ca-top" data-row="">
          <img className={s.peek} src="/images/home/icon-approve.webp" alt="" width={96} height={96} />
          <div className={s.heroMain}>
            <p className={s.eyebrow}>승인 요청</p>
            <h2 className={s.heroH} id="ca-top" data-title="">
              {`${top.nickname}님의 선물 승인 요청`}
            </h2>
            <div className={s.who}>
              <FaceAvatar index={0} className={`face face--sm ${s.whoFace}`} />
              <span>{`${formatDateTime(top.sentAt)} 요청 · ${priorHistoryLabel(top.priorHistory)}`}</span>
            </div>
            <dl className={s.facts}>
              <div>
                <dt>선물 종류</dt>
                <dd>{top.itemKind}</dd>
              </div>
              <div>
                <dt>상자</dt>
                <dd>{top.boxCount}개</dd>
              </div>
              <div>
                <dt>전자기기·금속</dt>
                <dd>{top.hasElectronicsOrMetal ? "있음" : "없음"}</dd>
              </div>
            </dl>
            <div className={s.acts}>
              <button className="btn btn--line" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "approval", item: top, start: "no" })}>
                받지 않기
              </button>
              <button className="btn" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "approval", item: top, start: "ask" })}>
                승인하기
              </button>
            </div>
          </div>
          <div className={s.due}>
            <span className={s.lab}>승인 기한</span>
            <DueBig dueAt={top.dueAt} now={now} />
            <span className={s.lab}>{formatDateTime(top.dueAt)}까지</span>
          </div>
        </section>
      ) : null}

      {restApprovals.length > 0 ? (
        <section className={s.sec} aria-labelledby="ca-more">
          <h2 className={s.secH} id="ca-more">
            남은 승인 요청<small>{restApprovals.length}건</small>
          </h2>
          <ul className={s.acards}>{restApprovals.map(approvalCard)}</ul>
        </section>
      ) : null}

      {sent.length > 0 ? (
        <section className={s.sec} aria-labelledby="ca-out">
          <h2 className={s.secH} id="ca-out">
            보낸 선물<small>{sent.length}건</small>
          </h2>
          <ul className={`lrows ${s.rows}`}>{sent.map(sentRow)}</ul>
        </section>
      ) : null}

      {open?.kind === "tracker" ? <TrackerWindow key={keyOf(open.item)} item={open.item} now={now} open onClose={close} /> : null}
      {open?.kind === "bluetooth" ? <BluetoothWindow key={keyOf(open.item)} item={open.item} now={now} open onClose={close} /> : null}
      {open?.kind === "approval" ? (
        <ApprovalWindowWithAddress
          key={`${keyOf(open.item)}:${open.start}`}
          request={{
            requestId: open.item.requestId,
            orderNo: open.item.orderNo,
            fanNickname: open.item.nickname,
            itemKind: open.item.itemKind,
            boxCount: open.item.boxCount,
            hasElectronicsOrMetal: open.item.hasElectronicsOrMetal,
            registeredAt: open.item.sentAt,
            receivedAt: open.item.receivedAt,
            priorHistory: open.item.priorHistory,
          }}
          dueAt={open.item.dueAt}
          daysLeftText={daysLeftOf(open.item.dueAt, now).text}
          open
          onClose={close}
          address={address}
          sealingKeyPem={sealingKeyPem}
          start={open.start}
        />
      ) : null}
      {open?.kind === "missing_box" ? (
        <BottomSheet open title="미도착 상자 찾기" meta={`${open.item.creatorName}님께 보낸 선물 · 상자 ${open.item.boxSeq}`} onClose={close}>
          <FindMyBox
            box={{
              target: { kind: "box", id: open.item.boxId },
              label: open.item.boxLabel,
              name: `${open.item.boxLabel} · ${tierName(open.item.declaredTier)} 상자`,
            }}
          />
        </BottomSheet>
      ) : null}
    </div>
  );
}
