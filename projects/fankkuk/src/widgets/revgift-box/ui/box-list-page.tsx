"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { MyBox, MyBoxRow, PriceTable } from "@/entities/revgift-box/api/box-reads";
import { BOX_STATUS_NAME, type BoxStatus } from "@/entities/revgift-box/model/box-status";
import { BoxCreateDialog } from "@/features/revgift-box-manage/ui/box-create-form";
import { BoxManageDialog } from "@/features/revgift-box-manage/ui/box-manage-panel";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { BoxDetail, BoxStory } from "./box-explain";
import s from "./revgift-box.module.css";

// 팬에게 보내기 — 내 선물함 목록 + 설명 (UX 명세 creator-revgifts-new 「2026-11-09 바꿀 것」·「2026-11-10 시안 승인」 · design-rules 43절).
// 선물함 0개: 설명 전체(「팬에게 보내기란?」이 h1) + 첫 화면과 끝에 「선물함 만들기」. 1개 이상: 목록이 먼저, 설명은 목록 아래(접지 않는다).
// 카드 = 작은 그림 · 이름(두 줄 말줄임) · 상태 꼬리표 · 「신청 N / M명」+ 막대 · 「공개 · 날짜」. 카드 전체가 누르는 칸 —
// 신청 받는 중은 목록 위에 신청 관리 모달, 그 밖은 지금의 단계 페이지(/creator/revgift-boxes/[boxId])로 간다.
// 「선물함 만들기」는 같은 페이지 위 모달이고 주소는 바뀌지 않는다. /new · /[boxId](신청 받는 중)로 들어오면 목록 + 그 모달이 열린 채로 보인다.

export type ManageEntry = { box: MyBox; applyUrl: string };
export type OpenDialog = { kind: "create" } | { kind: "manage"; boxId: string } | null;

const LIST_PATH = "/creator/revgift-boxes";

type Tone = "info" | "warn" | "brand" | "success" | "danger" | "plain";
/** 마감 뒤 진행 단계 꼬리표의 색 — 신청 받는 중=info · 팬꾹으로 배송하기=warn · 결제 요청=brand · 발송 중=success(design-rules 43절) */
const STAGE_TONE: Partial<Record<BoxStatus, Tone>> = {
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
  brand: "tag tag--dot tag--brand",
  success: "tag tag--dot tag--success",
  danger: "tag tag--dot tag--danger",
  plain: "tag tag--dot",
};

/** 카드 그림 — 상태가 어느 단계인지 진행 순서 그림과 같은 그림으로 알린다(시안 §7, 정보로 본 그림) */
function pictureOf(status: BoxStatus): string {
  if (status === "open") return "/images/home/promise-message.webp";
  if (status === "awaiting_box" || status === "arrived" || status === "held") return "/images/home/revgift-pack.png";
  if (status === "invoiced" || status === "overdue") return "/images/home/icon-fee.webp";
  if (status === "paid" || status === "done") return "/images/home/icon-truck.webp";
  return "/images/home/icon-gift.webp";
}

function BoxCardTags({ row }: { row: MyBoxRow }) {
  if (row.status === "open") {
    return (
      <>
        <span className={TONE_CLASS.info}>{BOX_STATUS_NAME.open}</span>
        {row.activeCount >= row.capacity ? <span className="tag tag--line">인원 마감</span> : null}
      </>
    );
  }
  if (row.status === "closed" || row.status === "cancelled") return <span className={TONE_CLASS.plain}>{BOX_STATUS_NAME[row.status]}</span>;
  // 신청자가 있는 마감 — 「마감」 + 진행 단계 꼬리표(시안 §10)
  return (
    <>
      <span className={TONE_CLASS.plain}>{BOX_STATUS_NAME.closed}</span>
      <span className={TONE_CLASS[STAGE_TONE[row.status] ?? "plain"]}>{BOX_STATUS_NAME[row.status]}</span>
    </>
  );
}

function BoxCard({ row, onOpen }: { row: MyBoxRow; onOpen: (boxId: string, el: HTMLElement) => void }) {
  const off = (row.status === "closed" && row.activeCount === 0) || row.status === "cancelled";
  const pct = Math.min(100, Math.round((row.activeCount / Math.max(1, row.capacity)) * 100));
  return (
    <li className={s.bcard}>
      <div className={s.bTop}>
        <div className={off ? `${s.bPic} ${s.isOff}` : s.bPic}>
          <img src={pictureOf(row.status)} alt="" width={28} height={28} />
        </div>
        <h3 className={s.bN}>
          {row.status === "open" ? (
            <button type="button" className={s.bA} title={row.name} onClick={(e) => onOpen(row.id, e.currentTarget)}>
              {row.name}
            </button>
          ) : (
            <Link className={s.bA} href={`${LIST_PATH}/${row.id}`} title={row.name}>
              {row.name}
            </Link>
          )}
        </h3>
      </div>
      <div className={s.bTg}>
        <BoxCardTags row={row} />
      </div>
      <div className={s.bCnt}>
        <p className={s.bNum}>
          신청 <b>{row.activeCount}</b>
          {` / ${row.capacity}명`}
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
          onOpenManage={(boxId) => setDialog({ kind: "manage", boxId })}
          linkFor={(boxId) => byId.get(boxId)?.applyUrl ?? null}
          manageReady={(boxId) => byId.has(boxId)}
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
