"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
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
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { ApprovalWindowWithAddress } from "./approval-window-with-address";
import { CreatorReturnAddressButton } from "./creator-return-address-button";
import s from "./creator-action-center.module.css";

// 크리에이터 처리할 일 (action-center INV-J5~J8, design-rules 13절, 시안 v21-addendum3/cre-action-center-d.html 가안 · 창은 cre-action-center-c.html).
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

const PATHS = {
  alert: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
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
  card: (
    <>
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <path d="M2 10h20" />
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
  check: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m16 9-5.5 5.5L8 12" />
    </>
  ),
} as const;

function Ico({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className={s.ico} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 줄 아래 작은 글씨 — 「종류 · 남은 날 · 나머지」, 사이에 점 */
function Sub({ kind, due, rest }: { kind: string; due?: { text: string; soon: boolean } | null; rest: readonly string[] }) {
  const parts: ReactNode[] = [
    <span key="k" className={s.k}>
      {kind}
    </span>,
  ];
  if (due) {
    parts.push(
      <span key="d" className={`${s.d} ${due.soon ? s.soon : ""}`}>
        <Ico name="clock" />
        {due.text}
      </span>,
    );
  }
  rest.forEach((r, i) => parts.push(<span key={`r${i}`}>{r}</span>));
  return (
    <span className={s.sub}>
      {parts.flatMap((p, i) => (i === 0 ? [p] : [<span key={`s${i}`} className={s.sep} aria-hidden="true" />, p]))}
    </span>
  );
}

function Row({ tone, icon, title, sub, action }: { tone?: "alert" | "appr"; icon: keyof typeof PATHS; title: string; sub: ReactNode; action: ReactNode }) {
  return (
    <li className={`${s.task} ${tone ? s[tone] : ""}`} data-row="">
      <span className={s.ti} aria-hidden="true">
        <Ico name={icon} />
      </span>
      <div className={s.tb}>
        <span className={s.tt}>{title}</span>
        {sub}
      </div>
      <div className={s.ta}>{action}</div>
    </li>
  );
}

type Open =
  | { kind: "tracker"; item: TrackerItem }
  | { kind: "bluetooth"; item: BluetoothItem }
  | { kind: "approval"; item: ApprovalItem }
  | { kind: "missing_box"; item: Extract<SentGiftItem, { kind: "missing_box" }> }
  | null;

const keyOf = (it: CreatorActionItem) => `${it.kind}:${it.orderNo}:${"boxSeq" in it ? it.boxSeq : "-"}`;

export function CreatorActionCenterPage({ items, now, candidates, address, sealingKeyPem }: Props) {
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const { received, sent } = splitBoards(items);

  function receivedRow(it: TrackerItem | BluetoothItem | ApprovalItem) {
    const due = daysLeftOf(it.dueAt, now);
    if (it.kind === "tracker") {
      return (
        <Row
          key={keyOf(it)}
          tone="alert"
          icon="alert"
          title={`${it.nickname}님 선물에서 추적 장치가 나왔어요`}
          sub={<Sub kind="추적 장치 발견" due={due} rest={[`${it.itemKind} · ${boxPlace(it)}`]} />}
          action={
            it.choice ? (
              <>
                <span className={s.picked}>
                  <Ico name="check" />
                  {trackerChoiceText(it.choice)}
                </span>
                <CancelChoiceButton item={it} label={trackerChoiceText(it.choice)} />
              </>
            ) : (
              <button className="btn" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "tracker", item: it })}>
                신고할지 정하기
              </button>
            )
          }
        />
      );
    }
    if (it.kind === "bluetooth") {
      const title = `${it.nickname}님 선물에서 ${signalThing(it)}가 나왔어요`;
      return (
        <Row
          key={keyOf(it)}
          tone="alert"
          icon="alert"
          title={title}
          sub={<Sub kind="블루투스 발견" due={due} rest={[`${it.itemKind} · ${boxPlace(it)} · 추적 장치 아님`]} />}
          action={
            it.choice ? (
              <>
                <span className={s.picked}>
                  <Ico name="check" />
                  {choiceText(it.choice)}
                </span>
                <CancelChoiceButton item={it} label={choiceText(it.choice)} />
              </>
            ) : (
              <button className="btn" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "bluetooth", item: it })}>
                받을지 정하기
              </button>
            )
          }
        />
      );
    }
    return (
      <Row
        key={keyOf(it)}
        tone="appr"
        icon="inbox"
        title={`${it.nickname}님이 선물을 보내려고 해요`}
        sub={<Sub kind="승인 요청" due={due} rest={[`${it.itemKind} · 상자 ${it.boxCount}개`]} />}
        action={
          <button className="btn" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "approval", item: it })}>
            승인하기
          </button>
        }
      />
    );
  }

  function sentRow(it: UnconfirmedItem | SentGiftItem | ReturnAddressItem) {
    if (it.kind === "return_address") {
      // 보낸 역조공 몫(상자 순번 없음) 또는 보낸 팬 선물의 상자 — 용어집 return_address·dispose_due 행
      const title = it.boxSeq === null ? `${it.nickname}님께 보낸 역조공` : `${it.nickname}님께 보낸 선물 · 상자 ${it.boxSeq}`;
      return (
        <Row
          key={keyOf(it)}
          icon="truck"
          title={title}
          sub={<Sub kind="돌려받을 주소 확인" rest={[disposeDueText(it.dueAt)]} />}
          action={<CreatorReturnAddressButton target={{ orderNo: it.orderNo, boxSeq: it.boxSeq }} meta={title} address={address} sealingKeyPem={sealingKeyPem} />}
        />
      );
    }
    if (it.kind === "unconfirmed") {
      return (
        <Row
          key={keyOf(it)}
          icon="search"
          title={`${it.nickname}님 상자가 아직 안 왔어요`}
          // 14일이면 받는 주소 없이 온 보류 상자는 이미 반송된 뒤라 찾기를 권하지 않는다 — 「아직 도착하지 않은 상자」로만(카드 d96 ②)
          sub={<Sub kind="아직 도착하지 않은 상자" rest={[`${formatMonthDayKo(it.sentAt)} 보낸 역조공`]} />}
          action={
            <FindSentBoxButton
              candidates={candidates}
              shareId={it.shareId}
              meta={`${formatMonthDayKo(it.sentAt)} 보냄`}
              label={`내 상자 찾기(${it.nickname}님)`}
            />
          }
        />
      );
    }
    const due = daysLeftOf(it.dueAt, now);
    const title = `${it.creatorName}님께 보낸 선물 · 상자 ${it.boxSeq}`;
    if (it.kind === "difference") {
      return (
        <Row
          key={keyOf(it)}
          icon="card"
          title={title}
          sub={<Sub kind="추가 결제" due={due} rest={[won(it.amountKrw)]} />}
          action={
            <Link className="btn" href={`/gifts/${encodeURIComponent(it.orderNo)}`}>
              추가 결제
            </Link>
          }
        />
      );
    }
    return (
      <Row
        key={keyOf(it)}
        icon="truck"
        title={title}
        sub={<Sub kind="아직 도착하지 않은 상자" due={due} rest={[tierName(it.declaredTier)]} />}
        action={
          <button className="btn" type="button" aria-haspopup="dialog" onClick={() => setOpen({ kind: "missing_box", item: it })}>
            찾기
          </button>
        }
      />
    );
  }

  return (
    <div className={s.root}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            처리할 일{items.length > 0 ? <span className="ph-count">{items.length}건</span> : null}
          </h1>
        </div>
      </header>

      {items.length === 0 ? (
        <section className={s.empty} aria-labelledby="ca-empty">
          <span className={s.emptyIco} aria-hidden="true">
            <Ico name="check" />
          </span>
          <h2 id="ca-empty">지금 처리할 일이 없어요</h2>
          <Link className="btn btn--line" href="/creator">
            홈으로
          </Link>
        </section>
      ) : null}

      {received.length > 0 ? (
        <section className={s.panel} aria-labelledby="ca-in">
          <div className={s.panelH}>
            <Ico name="inbox" />
            <h2 id="ca-in">받은 선물</h2>
            <span className={s.cnt} aria-hidden="true">
              {received.length}
            </span>
            <span className="sr-only">{received.length}건</span>
          </div>
          <ul className={s.tasks} aria-label="받은 선물">
            {received.map(receivedRow)}
          </ul>
        </section>
      ) : null}

      {sent.length > 0 ? (
        <section className={s.panel} aria-labelledby="ca-out">
          <div className={s.panelH}>
            <Ico name="send" />
            <h2 id="ca-out">보낸 선물</h2>
            <span className={s.cnt} aria-hidden="true">
              {sent.length}
            </span>
            <span className="sr-only">{sent.length}건</span>
          </div>
          <ul className={s.tasks} aria-label="보낸 선물">
            {sent.map(sentRow)}
          </ul>
        </section>
      ) : null}

      {open?.kind === "tracker" ? <TrackerWindow key={keyOf(open.item)} item={open.item} now={now} open onClose={close} /> : null}
      {open?.kind === "bluetooth" ? <BluetoothWindow key={keyOf(open.item)} item={open.item} now={now} open onClose={close} /> : null}
      {open?.kind === "approval" ? (
        <ApprovalWindowWithAddress
          key={keyOf(open.item)}
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
        />
      ) : null}
      {open?.kind === "missing_box" ? (
        <BottomSheet open title="아직 도착하지 않은 상자" meta={`${open.item.creatorName}님께 보낸 선물 · 상자 ${open.item.boxSeq}`} onClose={close}>
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
