import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { byUrgency, giftDetailHref, type ActionItem } from "@/entities/action-item/model/action-items";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { FAN_STEP_LABEL, fanBadge, fanGiftBucket, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import { formatDate, formatMonthDayKo } from "@/shared/lib/format/datetime";
import { recentFirst, type CreatorCard } from "../model/creator-cards";
import { GiftTabs } from "./gift-tabs";
import s from "./gift-list.module.css";

// 보낸 선물 — 팬·크리에이터 모두 「보낸 선물」 (action-center INV-J14, design-rules 22절, 시안 v35-part1/gifts.html · v35.css .ccard·.gcard).
// 위는 「크리에이터별로 보기」 카드 줄 — 크리에이터마다 한 장(얼굴·이름·선물 수·답장 수·최근 선물 상태), 카드 전체가 함께한 시간으로 가는 링크.
// 카드 숫자는 함께한 시간과 같은 읽기의 값이다(model/creator-cards.ts). 이 줄은 탭과 상관없이 전부 보인다. 휴대폰은 옆으로 넘긴다.
// 아래는 크리에이터로 묶지 않은 선물 카드 격자(최근 등록 순). 탭은 「진행 중」·「완료」 둘이고 이 격자만 거른다 —
// 완료 탭은 「끝난 선물」·「받지 않은 선물」(거절·기한 지남) 두 덩어리(시안). 카드는 진행 정도와 상관없이 같은 카드(진행 막대 + n/6), 880 안 2열(휴대폰 1열).
// 할 일이 있는 카드만 하늘 면(22절) — 지금 할 일 읽기 결과에 그 주문의 줄이 있을 때만(UX 시범 A-2 — 「보내 주세요」는 배지로만, 사이드바 숫자와 같은 수).
// 하늘 면 카드에는 그 줄의 제목·기한 한 줄을 붙이고 상세의 「지금 할 일」 칸(#todo)으로 바로 간다(A-1). 그 밖의 카드는 선물 상세(INV-J12)로 간다.
// 「진행 중」 탭 맨 위에는 결제를 마치지 않은 선물 카드 — 같은 읽기 결과의 결제 미완료 줄로만 그린다(INV-J14, A-3).
// 카드 면 효과·떠오름은 공통(base.css 23절 .ccard)과 토큰(tokens.css 23절)을 쓴다. 본문 틀 <main class="page-pane"> 은 라우트가 MyShell 로 붙인다.

type Filter = (g: FanGiftView) => boolean;

const ongoing: Filter = (g) => fanGiftBucket(g) === "ongoing";
const ended: Filter = (g) => fanGiftBucket(g) === "ended";
const notAccepted: Filter = (g) => fanGiftBucket(g) === "not_accepted";

/** 카드 꼬리표 — 진행이 끝까지 간 선물은 「끝난 선물」(시안), 그 밖은 목록 꼬리표 그대로(거절·기한 지남은 따로 — decline-block INV-D5) */
function cardBadge(gift: FanGiftView): { text: string; tone: StatusTone } {
  if (gift.outcome === "in_progress" && fanGiftBucket(gift) === "ended") return { text: "끝난 선물", tone: "success" };
  return fanBadge(gift);
}

/** 할 일 한 줄의 제목 — 지금 할 일 목록 줄과 같은 글자(action-center-page rowCopy). 받은 역조공 줄은 보낸 선물 목록에 오지 않는다 */
const TODO_TITLE: Record<Exclude<ActionItem["kind"], "revgift">, string> = {
  difference: "추가 결제",
  missing_box: "도착이 늦어요",
  return_address: "돌려받을 주소 확인",
  unpaid: "결제를 마치지 않은 선물",
};

function TodoLine({ item }: { item: ActionItem }) {
  if (item.kind === "revgift") return null;
  return (
    <p className={s.todoline} data-todo-line="">
      <span>{TODO_TITLE[item.kind]}</span>
      {item.dueAt ? <span>{formatMonthDayKo(item.dueAt)}까지</span> : null}
    </p>
  );
}

function GiftCard({ gift, faceTone, todo }: { gift: FanGiftView; faceTone: string | undefined; todo: ActionItem | undefined }) {
  const badge = cardBadge(gift);
  const progress = fanProgress(gift);
  const who = `${gift.creatorName}님께`;
  const notAccepted = fanGiftBucket(gift) === "not_accepted";
  const lastDone = [...gift.steps].reverse().find((st) => st.state === "done");
  const hi = todo !== undefined;
  return (
    <li className={hi ? `${s.gcard} ${s.hi}` : s.gcard} data-gift-row="" data-hi={hi ? "" : undefined}>
      <div className={s.top}>
        <CreatorFace tone={faceTone ?? "var(--face-1)"} className={`face ${s.face}`} />
        <strong className={s.who}>
          <Link className="stretch" href={giftDetailHref(gift.orderNo, hi)} aria-label={`${who} 보낸 선물 ${gift.orderNo} 상세`}>
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
      {todo ? <TodoLine item={todo} /> : null}
    </li>
  );
}

type UnpaidItem = Extract<ActionItem, { kind: "unpaid" }>;

/** 결제를 마치지 않은 선물(INV-J14, payment INV-M22) — 보낸 선물 읽기에 없는 결제 대기 주문. 지금 할 일 줄 하나가 카드 하나, 상세의 칸(#todo)으로 간다 */
function UnpaidCard({ item, faceTone }: { item: UnpaidItem; faceTone: string | undefined }) {
  return (
    <li className={`${s.gcard} ${s.hi}`} data-unpaid-row="">
      <div className={s.top}>
        <CreatorFace tone={faceTone ?? "var(--face-1)"} className={`face ${s.face}`} />
        <strong className={s.who}>
          <Link className="stretch" href={giftDetailHref(item.orderNo, true)}>
            결제를 마치지 않은 선물
          </Link>
        </strong>
      </div>
      <div>
        <p className={s.uWhat}>{item.creatorName}님께 보낼 선물</p>
        <p className={s.uDue}>{formatMonthDayKo(item.dueAt)}까지</p>
      </div>
      <span className={s.linkarr} aria-hidden="true">
        결제하기 ›
      </span>
    </li>
  );
}

/** 최근 선물의 진행 — 받지 않은 선물은 꼬리표만(시안) */
function LatestLine({ gift, name }: { gift: FanGiftView; name: string }) {
  const badge = cardBadge(gift);
  const progress = fanProgress(gift);
  return (
    <div className={s.line}>
      <span className={statusTagClass(badge.tone)}>{badge.text}</span>
      {fanGiftBucket(gift) === "not_accepted" ? null : (
        <span
          className="mini-steps"
          role="progressbar"
          aria-label={`${name}님께 보낸 최근 선물 진행 단계`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.done}
          aria-valuetext={`${progress.total}단계 중 ${progress.done}단계 완료`}
        >
          <span className="segs">
            {gift.steps.map((st) => (
              <i key={st.key} className={st.state === "done" ? "on" : undefined} />
            ))}
          </span>
          <span>
            {progress.done}/{progress.total}
          </span>
        </span>
      )}
    </div>
  );
}

function CreatorCardItem({ card, faceTone }: { card: CreatorCard; faceTone: string | undefined }) {
  return (
    <li className={`ccard ${s.ccard}`} data-creator-card={card.creatorName}>
      <div className={s.cwho}>
        <CreatorPhoto photoUrl={card.photoUrl} tone={faceTone ?? "var(--face-1)"} className={`face ${s.cface}`} />
        <div className={s.cname}>
          <Link className="stretch" href={card.href} aria-label={`${card.creatorName}님과 함께한 시간`}>
            <strong>{card.creatorName}님</strong>
          </Link>
          <small data-creator-count="">
            선물 {card.giftCount}개 · 답장 {card.replyCount}통
          </small>
        </div>
      </div>
      {card.latest ? (
        <div className={s.last} data-creator-last="">
          <span className={s.lab}>최근 선물</span>
          <LatestLine gift={card.latest} name={card.creatorName} />
        </div>
      ) : null}
      <span className={s.more} aria-hidden="true">
        함께한 시간 ›
      </span>
    </li>
  );
}

function Creators({ creators, faceToneByName }: { creators: readonly CreatorCard[]; faceToneByName: Readonly<Record<string, string>> }) {
  return (
    <section className={s.creators} aria-labelledby="gift-creators-h">
      <div className={s.secH}>
        <h2 className={s.secTitle} id="gift-creators-h">
          크리에이터별로 보기
        </h2>
        <small>{creators.length}명</small>
      </div>
      {/* v34: 21·22절 태그 모양(base.css) 범위 */}
      <ul className={`${s.ccards} v34`}>
        {creators.map((c) => (
          <CreatorCardItem key={c.key} card={c} faceTone={faceToneByName[c.creatorName]} />
        ))}
      </ul>
    </section>
  );
}

type GridProps = { rows: readonly FanGiftView[]; todos: readonly ActionItem[]; faceToneByName: Readonly<Record<string, string>> };

/** 그 주문의 지금 할 일 줄 중 가장 급한 것 — 없으면 할 일이 없는 카드 */
const firstTodoOf = (todos: readonly ActionItem[], orderNo: string): ActionItem | undefined => byUrgency(todos.filter((it) => it.orderNo === orderNo))[0];

function Grid({ rows, todos, faceToneByName, unpaid = [] }: GridProps & { unpaid?: readonly UnpaidItem[] }) {
  return (
    <ul className={`${s.gcards} v34`}>
      {unpaid.map((u) => (
        <UnpaidCard key={u.orderNo} item={u} faceTone={faceToneByName[u.creatorName]} />
      ))}
      {rows.map((g) => (
        <GiftCard key={g.orderNo} gift={g} faceTone={faceToneByName[g.creatorName]} todo={firstTodoOf(todos, g.orderNo)} />
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className={`empty ${s.empty}`}>
      <p>{text}</p>
      <Link className="link-arrow" href="/gifts/new">
        선물 보내기 ›
      </Link>
    </div>
  );
}

type PanelProps = Omit<GridProps, "rows"> & { gifts: readonly FanGiftView[] };

/** 지금 할 일 읽기 결과의 결제 미완료 줄 — 「진행 중」 탭 맨 위 카드(INV-J14) */
const unpaidOf = (todos: readonly ActionItem[]) => todos.filter((it): it is UnpaidItem => it.kind === "unpaid");

function OngoingPanel({ gifts, ...rest }: PanelProps) {
  const rows = gifts.filter(ongoing);
  const unpaid = unpaidOf(rest.todos);
  return rows.length + unpaid.length === 0 ? <Empty text="지금 진행 중인 선물이 없어요." /> : <Grid rows={rows} unpaid={unpaid} {...rest} />;
}

/** 완료 탭 — 끝난 선물과 받지 않은 선물을 따로 모은다(시안). 둘 다 같은 카드, 각각 최근 등록 순 */
function DonePanel({ gifts, ...rest }: PanelProps) {
  const parts = [
    { id: "ended", label: "끝난 선물", rows: gifts.filter(ended) },
    { id: "not-accepted", label: "받지 않은 선물", rows: gifts.filter(notAccepted) },
  ].filter((p) => p.rows.length > 0);
  if (parts.length === 0) return <Empty text="아직 완료된 선물이 없어요." />;
  return (
    <>
      {parts.map((p) => (
        <section key={p.id} aria-labelledby={`gift-done-${p.id}`}>
          <h3 className={s.subH} id={`gift-done-${p.id}`}>
            {p.label}
            <small>{p.rows.length}</small>
          </h3>
          <Grid rows={p.rows} {...rest} />
        </section>
      ))}
    </>
  );
}

export function GiftListPage({
  creators,
  gifts,
  faceToneByName,
  title = "보낸 선물",
  tabs,
  todos = [],
}: {
  /** 보낸 선물의 지금 할 일 줄 — 줄이 있는 카드만 하늘 면 + 할 일 한 줄(design-rules 22절), 결제 미완료 줄은 「진행 중」 맨 위 카드(INV-J14). 라우트가 사이드바 숫자와 같은 읽기 결과에서 넘긴다 */
  todos?: readonly ActionItem[];
  /** 페이지 머리 바로 아래에 둘 화면 간 탭 — 크리에이터의 「보낸 내역」 두 화면(design-rules 11절). 머리는 늘 본문 맨 앞이다(00절) */
  tabs?: ReactNode;
  /** 크리에이터별로 보기 카드(model/creator-cards.ts) — 숫자는 함께한 시간 읽기의 값 */
  creators: readonly CreatorCard[];
  /** 보낸 선물 전부 — 격자는 크리에이터로 묶지 않고 최근 등록 순 */
  gifts: readonly FanGiftView[];
  /** 페이지 머리 제목 — 사이드바 메뉴 이름과 같게(팬·크리에이터 모두 「보낸 선물」, design-rules 00절) */
  title?: string;
  /** 크리에이터 이름 → 얼굴 면 색. 메인 화면과 같은 색을 쓴다. */
  faceToneByName: Readonly<Record<string, string>>;
}) {
  const all = recentFirst(gifts);
  // 탭 기준은 fanGiftBucket 하나 — 메인 「진행 중인 선물」과 같은 수가 나온다
  // 결제를 마치지 않은 선물 카드도 「진행 중」에 보이므로 머리 숫자와 탭 숫자에 넣는다(시안 ux-pilot gifts-2-after)
  const unpaidN = unpaidOf(todos).length;
  const ongoingN = all.filter(ongoing).length + unpaidN;
  const panelProps = { gifts: all, todos, faceToneByName };
  return (
    <>
      <header className="page-head v34">
        <div className="ph-row">
          <h1 className="ph-title">
            {title}
            <span className="ph-count">{all.length + unpaidN}</span>
          </h1>
          <Link className="btn" href="/gifts/new">
            선물 보내기
          </Link>
        </div>
        <p className="ph-desc">크리에이터별로 보낸 선물과 받은 답장을 한곳에서 볼 수 있어요.</p>
      </header>
      {tabs}
      {creators.length > 0 ? <Creators creators={creators} faceToneByName={faceToneByName} /> : null}
      <div className={s.giftTabs}>
        <GiftTabs
          tabs={[
            { id: "ongoing", label: `진행 중 ${ongoingN}`, panel: <OngoingPanel {...panelProps} /> },
            { id: "done", label: `완료 ${all.length + unpaidN - ongoingN}`, panel: <DonePanel {...panelProps} /> },
          ]}
        />
      </div>
    </>
  );
}
