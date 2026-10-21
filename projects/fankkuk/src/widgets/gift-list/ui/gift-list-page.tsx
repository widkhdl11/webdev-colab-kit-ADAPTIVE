import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { giftDetailHref } from "@/entities/action-item/model/action-items";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { FAN_STEP_LABEL, fanBadge, fanGiftBucket, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import { formatDate, formatMonthDayKo } from "@/shared/lib/format/datetime";
import type { GiftGroup } from "../model/gift-groups";
import { GiftTabs } from "./gift-tabs";
import s from "./gift-list.module.css";

// 보낸 선물 — 팬·크리에이터 모두 「보낸 선물」 (action-center INV-J14, design-rules 22절, 시안 v35-part1/gifts.html · v35.css .gcard).
// 크리에이터별 묶음: 묶음 머리(얼굴 + 「OO님과 함께한 시간」 + 선물·답장 수 + 꺾쇠) 전체가 함께한 시간으로 가는 링크, 그 아래 그 크리에이터에게 보낸 선물 카드.
// 머리 숫자는 함께한 시간과 같은 읽기의 값이다(묶음은 model/gift-groups.ts) — 탭이 줄을 걸러도 숫자는 그대로다.
// 탭은 「진행 중」·「완료」 둘 — 끝난 선물과 받지 않은 선물(거절·기한 지남)이 「완료」로 합쳐진다. 카드가 하나도 없는 묶음은 그 탭에서 보이지 않는다.
// 선물은 진행 정도와 상관없이 같은 카드(진행 막대 + n/6), 880 안 2열(휴대폰 1열). 할 일이 있는 카드만 하늘 면(22절) —
// 지금 할 일 읽기 결과에 그 주문의 줄이 있거나 사무실로 보내야 하는 선물(「보내 주세요」). 카드는 선물 상세(INV-J12)로 간다.
// 본문 틀 <main class="page-pane"> 은 라우트가 MyShell 로 붙인다.

type Filter = (g: FanGiftView) => boolean;

const ongoing: Filter = (g) => fanGiftBucket(g) === "ongoing";
const done: Filter = (g) => fanGiftBucket(g) !== "ongoing";

function Chev() {
  return (
    <svg className="lrow-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** 카드 꼬리표 — 진행이 끝까지 간 선물은 「끝난 선물」(시안), 그 밖은 목록 꼬리표 그대로(거절·기한 지남은 따로 — decline-block INV-D5) */
function cardBadge(gift: FanGiftView): { text: string; tone: StatusTone } {
  if (gift.outcome === "in_progress" && fanGiftBucket(gift) === "ended") return { text: "끝난 선물", tone: "success" };
  return fanBadge(gift);
}

/** 할 일이 있는 카드인가 — 처리할 일 읽기 결과의 주문이거나, 사무실로 보내 달라는 선물 */
export function giftNeedsAction(gift: FanGiftView, todoOrderNos: ReadonlySet<string>): boolean {
  return todoOrderNos.has(gift.orderNo) || fanBadge(gift).text === "보내 주세요";
}

function GiftCard({ gift, faceTone, hi }: { gift: FanGiftView; faceTone: string | undefined; hi: boolean }) {
  const badge = cardBadge(gift);
  const progress = fanProgress(gift);
  const who = `${gift.creatorName}님께`;
  const notAccepted = fanGiftBucket(gift) === "not_accepted";
  const lastDone = [...gift.steps].reverse().find((st) => st.state === "done");
  return (
    <li className={hi ? `${s.gcard} ${s.hi}` : s.gcard} data-gift-row="" data-hi={hi ? "" : undefined}>
      <div className={s.top}>
        <CreatorFace tone={faceTone ?? "var(--face-1)"} className={`face ${s.face}`} />
        <strong className={s.who}>
          <Link className="stretch" href={giftDetailHref(gift.orderNo)} aria-label={`${who} 보낸 선물 ${gift.orderNo} 상세`}>
            {who}
          </Link>
        </strong>
        <span className={statusTagClass(badge.tone)}>{badge.text}</span>
      </div>
      <div>
        {/* together INV-F7: 나만 보는 메모의 선물 이름 — 본인 목록(my_gifts)에만 온다. 없으면 고른 물품 종류 */}
        <h3 className={s.name}>{gift.memoTitle ?? gift.itemKind}</h3>
        <p className={s.what}>
          {gift.memoTitle ? `${gift.itemKind} · ` : ""}상자 {gift.boxCount}개
        </p>
      </div>
      {notAccepted ? (
        <p className={s.stop}>받지 않은 선물이에요 · {formatMonthDayKo(gift.registeredAt)} 등록</p>
      ) : (
        <div>
          <span
            className={s.pbar}
            role="progressbar"
            aria-label={`${who} 보낸 선물 ${gift.orderNo} 진행 단계`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-valuetext={`${progress.total}단계 중 ${progress.done}단계 완료, ${badge.text}`}
          >
            {gift.steps.map((st) => (
              <i key={st.key} className={st.state === "done" ? s.on : undefined} />
            ))}
          </span>
          <p className={s.pfoot}>
            <span>
              <b>
                {progress.done}/{progress.total}
              </b>
              {lastDone ? ` · ${FAN_STEP_LABEL[lastDone.key]}` : null}
            </span>
            <span>{gift.outcome === "in_progress" && gift.expectedArrivalDate ? `${formatDate(gift.expectedArrivalDate)} 도착 예정` : `${formatMonthDayKo(gift.registeredAt)} 등록`}</span>
          </p>
        </div>
      )}
    </li>
  );
}

function Group({ group, rows, todoOrderNos, faceToneByName }: { group: GiftGroup; rows: readonly FanGiftView[]; todoOrderNos: ReadonlySet<string>; faceToneByName: Readonly<Record<string, string>> }) {
  const t = group.together;
  return (
    <section className={s.grp} data-gift-group={group.creatorName} aria-label={`${group.creatorName}님 선물`}>
      <div className={t ? `${s.head} ${s.linked}` : s.head} data-group-head="">
        <CreatorPhoto photoUrl={t?.photoUrl ?? null} tone={faceToneByName[group.creatorName] ?? "var(--face-6)"} className="face" />
        {t ? (
          <>
            <Link className="stretch" href={t.href}>
              <strong>{group.creatorName}님과 함께한 시간</strong>
            </Link>
            <small data-group-count="">
              선물 {t.giftCount}개 · 답장 {t.replyCount}통
            </small>
            <Chev />
          </>
        ) : (
          <strong>{group.creatorName}님께 보낸 선물</strong>
        )}
      </div>
      {/* v34: 21·22절 태그 모양(base.css) 범위 */}
      <ul className={`${s.gcards} v34`}>
        {rows.map((g) => (
          <GiftCard key={g.orderNo} gift={g} faceTone={faceToneByName[g.creatorName]} hi={giftNeedsAction(g, todoOrderNos)} />
        ))}
      </ul>
    </section>
  );
}

type PanelProps = { groups: readonly GiftGroup[]; filter: Filter; empty: string; todoOrderNos: ReadonlySet<string>; faceToneByName: Readonly<Record<string, string>> };

function Panel({ groups, filter, empty, todoOrderNos, faceToneByName }: PanelProps) {
  const shown = groups.map((g) => ({ group: g, rows: g.gifts.filter(filter) })).filter((x) => x.rows.length > 0);
  if (shown.length === 0) {
    return (
      <div className={`empty ${s.empty}`}>
        <p>{empty}</p>
        <Link className="link-arrow" href="/gifts/new">
          선물 보내기 ›
        </Link>
      </div>
    );
  }
  return (
    <>
      {shown.map((x) => (
        <Group key={x.group.key} group={x.group} rows={x.rows} todoOrderNos={todoOrderNos} faceToneByName={faceToneByName} />
      ))}
    </>
  );
}

export function GiftListPage({
  groups,
  faceToneByName,
  title = "보낸 선물",
  tabs,
  todoOrderNos = [],
}: {
  /** 지금 할 일 읽기 결과에 줄이 있는 주문번호 — 그 카드만 하늘 면(design-rules 22절). 라우트가 사이드바 숫자와 같은 읽기 결과에서 넘긴다 */
  todoOrderNos?: readonly string[];
  /** 페이지 머리 바로 아래에 둘 화면 간 탭 — 크리에이터의 「보낸 내역」 두 화면(design-rules 11절). 머리는 늘 본문 맨 앞이다(00절) */
  tabs?: ReactNode;
  /** 크리에이터별 묶음(model/gift-groups.ts) */
  groups: readonly GiftGroup[];
  /** 페이지 머리 제목 — 사이드바 메뉴 이름과 같게(팬·크리에이터 모두 「보낸 선물」, design-rules 00절) */
  title?: string;
  /** 크리에이터 이름 → 얼굴 면 색. 메인 화면과 같은 색을 쓴다. */
  faceToneByName: Readonly<Record<string, string>>;
}) {
  const all = groups.flatMap((g) => g.gifts);
  // 탭 기준은 fanGiftBucket 하나 — 메인 「진행 중인 선물」과 같은 수가 나온다
  const ongoingN = all.filter(ongoing).length;
  const todo = new Set(todoOrderNos);
  return (
    <>
      <header className="page-head v34">
        <div className="ph-row">
          <h1 className="ph-title">
            {title}
            <span className="ph-count">{all.length}</span>
          </h1>
          <Link className="btn" href="/gifts/new">
            선물 보내기
          </Link>
        </div>
        <p className="ph-desc">크리에이터별로 보낸 선물과 받은 답장을 한곳에서 볼 수 있어요.</p>
      </header>
      {tabs}
      <GiftTabs
        tabs={[
          {
            id: "ongoing",
            label: `진행 중 ${ongoingN}`,
            panel: <Panel groups={groups} filter={ongoing} todoOrderNos={todo} faceToneByName={faceToneByName} empty="지금 진행 중인 선물이 없어요." />,
          },
          {
            id: "done",
            label: `완료 ${all.length - ongoingN}`,
            panel: <Panel groups={groups} filter={done} todoOrderNos={todo} faceToneByName={faceToneByName} empty="아직 완료된 선물이 없어요." />,
          },
        ]}
      />
    </>
  );
}
