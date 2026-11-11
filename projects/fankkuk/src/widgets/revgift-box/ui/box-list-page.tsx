"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { MyBox, MyBoxRow, PriceTable } from "@/entities/revgift-box/api/box-reads";
import { BOX_STAGE_NAME, BOX_STATUS_NAME, isClosedEmptyRow, isFull, type BoxStatus } from "@/entities/revgift-box/model/box-status";
import { BoxCreateDialog } from "@/features/revgift-box-manage/ui/box-create-form";
import { BoxManageDialog } from "@/features/revgift-box-manage/ui/box-manage-panel";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { BoxDetail, BoxStory } from "./box-explain";
import s from "./revgift-box.module.css";

// 팬에게 보내기 — 내 선물함 목록 + 설명 (UX 명세 creator-revgifts-new 「2026-11-09 바꿀 것」·「2026-11-10 시안 승인」 · design-rules 43절).
// 선물함 0개: 설명 전체(「팬에게 보내기란?」이 h1) + 첫 화면과 끝에 「선물함 만들기」. 1개 이상: 목록이 먼저, 설명은 목록 아래(접지 않는다).
// 카드 = 흰 선물 상자(하늘 뚜껑 + 리본) · 맨 위 상태 꼬리표 · 이름(두 줄 말줄임)과 간단한 설명(있을 때만, 두 줄) 한 묶음 ·
// 「신청 인원 N / M명」 + 폭 전체 막대 · 「공개 · 날짜」(사용자 시안 2026-11-11 → 같은 날 C안, design-rules 43절). 카드 전체가 누르는 칸 —
// 신청 받는 중은 목록 위에 신청 관리 모달, 그 밖은 지금의 단계 페이지(/creator/revgift-boxes/[boxId])로 간다.
// 「선물함 만들기」는 같은 페이지 위 모달이고 주소는 바뀌지 않는다. /new · /[boxId](신청 받는 중)로 들어오면 목록 + 그 모달이 열린 채로 보인다.

export type ManageEntry = { box: MyBox; applyUrl: string };
export type OpenDialog = { kind: "create" } | { kind: "manage"; boxId: string } | null;

const LIST_PATH = "/creator/revgift-boxes";

type Tone = "info" | "warn" | "brand" | "success" | "danger" | "plain";
/** 마감 뒤 진행 단계 꼬리표의 색 — 신청 받는 중=info · 팬꾹으로 배송하기=warn · 결제 요청=brand · 발송 중=success(design-rules 43절) */
const STAGE_TONE: Partial<Record<BoxStatus, Tone>> = {
  closed: "warn",
  awaiting_box: "warn",
  arrived: "warn",
  held: "warn",
  invoiced: "brand",
  overdue: "danger",
  paid: "success",
  done: "success",
};
const TONE_CLASS: Record<Tone, string> = {
  info: "tag tag--dot tag--info",
  warn: "tag tag--dot tag--warn",
  brand: `tag tag--dot tag--brand ${s.tBrand}`,
  success: "tag tag--dot tag--success",
  danger: "tag tag--dot tag--danger",
  plain: `tag tag--dot ${s.tPlain}`,
};

function BoxCardTags({ row }: { row: MyBoxRow }) {
  if (row.status === "open") {
    return (
      <>
        <span className={TONE_CLASS.info}>{BOX_STATUS_NAME.open}</span>
        {isFull(row.activeCount, row.capacity) ? <span className={`tag tag--line ${s.tLine}`}>인원 마감</span> : null}
      </>
    );
  }
  // 0명 마감·취소는 뱃지 하나
  if (isClosedEmptyRow(row) || row.status === "cancelled") return <span className={TONE_CLASS.plain}>{BOX_STATUS_NAME[row.status]}</span>;
  // 신청자가 있는 마감 — 「마감」 + 진행 단계 뱃지(상자 고르기 전은 「상자 크기 고르기」, design-rules 43절)
  return (
    <>
      <span className={TONE_CLASS.plain}>{BOX_STATUS_NAME.closed}</span>
      <span className={TONE_CLASS[STAGE_TONE[row.status] ?? "plain"]}>{BOX_STAGE_NAME[row.status]}</span>
    </>
  );
}

function BoxCard({ row, onOpen }: { row: MyBoxRow; onOpen: (boxId: string, el: HTMLElement) => void }) {
  const off = isClosedEmptyRow(row) || row.status === "cancelled";
  const pct = Math.min(100, Math.round((row.activeCount / Math.max(1, row.capacity)) * 100));
  return (
    <li className={off ? `${s.bcard} ${s.isOff}` : s.bcard}>
      {/* 선물 상자 뚜껑 + 리본 — 꾸밈 그림이라 읽지 않는다(사용자 시안 external-material-box/선물함상자.png, 2026-11-11) */}
      <div className={s.bLid} aria-hidden="true">
        <svg className={s.bBow} viewBox="0 0 48 24" width="72" height="36" focusable="false">
          <path d="M24 13 C18 3, 6 1, 3 7 C1 12, 6 17, 24 14 Z" />
          <path d="M24 13 C30 3, 42 1, 45 7 C47 12, 42 17, 24 14 Z" />
          <rect className={s.bKnot} x="19" y="8" width="10" height="9" rx="3" />
        </svg>
      </div>
      <div className={s.bBody}>
        {/* C안(2026-11-11 사용자): 상태 뱃지는 맨 위 줄 — 카드마다 같은 높이라 줄을 따라 훑으면 단계가 바로 보인다. 그 아래 이름·설명이 한 묶음 */}
        <div className={s.bTg}>
          <BoxCardTags row={row} />
        </div>
        <div className={s.bWho}>
          <h3 className={s.bN}>
            {row.status === "open" ? (
              <button type="button" className={s.bA} title={row.name} onClick={(e) => onOpen(row.id, e.currentTarget)}>
                <span className={s.bNm}>{row.name}</span>
              </button>
            ) : (
              <Link className={s.bA} href={`${LIST_PATH}/${row.id}`} title={row.name}>
                <span className={s.bNm}>{row.name}</span>
              </Link>
            )}
          </h3>
          {row.description ? <p className={s.bDesc}>{row.description}</p> : null}
        </div>
        <div className={s.bCnt}>
          <p className={s.bNum}>
            <span>신청 인원</span>
            <span>
              <b>{row.activeCount}</b>
              {` / ${row.capacity}명`}
            </span>
          </p>
          <div
            className={s.bBar}
            role="progressbar"
            aria-label={`신청 ${row.activeCount}명 / ${row.capacity}명`}
            aria-valuemin={0}
            aria-valuemax={row.capacity}
            aria-valuenow={Math.min(row.activeCount, row.capacity)}
          >
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
        <p className={s.bM}>{`${row.isPublic ? "공개" : "비공개"} · ${formatMonthDayKo(row.createdAt)}`}</p>
      </div>
    </li>
  );
}

export function BoxListPage({
  rows,
  manage,
  price,
  initial = null,
}: {
  rows: readonly MyBoxRow[];
  /** 신청 받는 중인 선물함의 신청 관리 내용(모달용) */
  manage: readonly ManageEntry[];
  price: PriceTable | null;
  /** 들어오자마자 열 모달 — /new 는 만들기, /[boxId] 는 그 선물함의 신청 관리 */
  initial?: OpenDialog;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog>(initial);
  const [, startRefresh] = useTransition();
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const fromRoute = useRef(initial !== null);

  const byId = new Map(manage.map((m) => [m.box.id, m]));
  const active = dialog?.kind === "manage" ? byId.get(dialog.boxId) : undefined;

  const closeDialog = () => {
    setDialog(null);
    // /new · /[boxId] 로 들어와 연 모달을 닫으면 주소를 목록으로 돌린다(뒤로 가기에 같은 모달이 다시 뜨지 않게)
    if (fromRoute.current) {
      fromRoute.current = false;
      window.history.replaceState(null, "", LIST_PATH);
    }
  };
  const openManage = (boxId: string, el: HTMLElement) => {
    openerRef.current = el;
    setDialog({ kind: "manage", boxId });
  };

  const createButton = (ref?: typeof createBtnRef) => (
    <button
      ref={ref}
      className="btn"
      type="button"
      onClick={(e) => {
        openerRef.current = e.currentTarget;
        setDialog({ kind: "create" });
      }}
    >
      선물함 만들기
    </button>
  );

  const explainHead = (level: "h1" | "h2") => {
    const H = level;
    return (
      <div className={s.heroT}>
        <H className={level === "h1" ? "ph-title" : s.secH} id="what-h">
          팬에게 보내기란?
        </H>
        <p className={s.def}>여러 팬에게 줄 선물을 큰 상자 하나에 담아 팬꾹으로 보내면, 팬꾹이 열어 팬마다 나눠 보냅니다.</p>
      </div>
    );
  };

  return (
    <main id="main" className="page-centered v34">
      <div className={`${s.col} ${s.listCol}`}>
        {rows.length === 0 ? (
          <>
            <header className={`page-head ${s.phead} ${s.heroHead}`}>
              {explainHead("h1")}
              {createButton(createBtnRef)}
            </header>
            <BoxStory />
            <BoxDetail price={price} />
          </>
        ) : (
          <>
            <header className={`page-head ${s.phead}`}>
              <h1 className="ph-title">팬에게 보내기</h1>
              {createButton(createBtnRef)}
            </header>
            <section className={s.sec} aria-labelledby="mine-h">
              <h2 className={s.secH} id="mine-h">
                내 선물함
              </h2>
              <ul className={s.boxes}>
                {rows.map((r) => (
                  <BoxCard key={r.id} row={r} onOpen={openManage} />
                ))}
              </ul>
            </section>
            <section className={s.sec} aria-labelledby="what-h">
              {explainHead("h2")}
              <BoxStory />
            </section>
            <BoxDetail price={price} />
          </>
        )}
        <div className={s.endrow}>{createButton()}</div>
      </div>

      {dialog?.kind === "create" ? (
        <BoxCreateDialog
          open
          onClose={closeDialog}
          onCreated={() => startRefresh(() => router.refresh())}
          linkFor={(boxId) => byId.get(boxId)?.applyUrl ?? null}
          returnFocusRef={openerRef}
        />
      ) : null}
      {active ? (
        <BoxManageDialog
          key={`${active.box.id}:${active.box.applications.map((a) => `${a.id}-${a.status}`).join(",")}`}
          box={active.box}
          applyUrl={active.applyUrl}
          open
          onClose={closeDialog}
          returnFocusRef={openerRef}
        />
      ) : null}
    </main>
  );
}
