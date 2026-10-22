import Link from "next/link";
import { byUrgency, giftDetailHref, type ActionItem } from "@/entities/action-item/model/action-items";
import { formatMonthDayKo, seoulDaysUntil } from "@/shared/lib/format/datetime";
import s from "./action-center.module.css";

// 지금 할 일 (action-center INV-J1·J2·J4·J13, design-rules 21절, 시안 v34-part1/todo.html). 본문 틀은 목록형 880 — 라우트가 MyShell(list)로 감싼다.
// 줄은 처리할 일 읽기 한 번의 결과 그대로 — 제목 옆 숫자는 그 줄 수이고 사이드바 숫자와 같은 결과다(J2). 0건이면 빈 상태.
// 이 화면에는 처리 칸이 없다(J13): 가장 급한 줄 하나만 강조 칸(남은 날·그림·「바로 하기」), 나머지는 촘촘한 줄 + 작은 「바로 하기」.
// 「바로 하기」는 그 선물 상세의 「지금 할 일」 칸(#todo)으로 간다 — 처리는 상세 칸에서 기존 처리 함수를 그대로 부른다(J4).
// 처리가 끝나면 다음 읽기에서 줄이 없다 — 줄은 누른 기록이 아니라 원천 상태로 사라진다.

/** now = 남은 날을 셀 기준 시각(라우트가 그린 때) */
type Props = { items: readonly ActionItem[]; now: string };

/**
 * 줄 하나의 글 — 일 이름 · 어느 선물인지 · 그림.
 * 도착이 늦어요에 붙던 태그 「송장번호 입력」은 뺐다 — 아직 보내지 않은 팬에게는 맞지 않는 말이다(2026-10-22 d113 진단 C-1). 처리 갈래는 상세 칸이 보여 준다.
 */
function rowCopy(item: ActionItem): { title: string; meta: string; art: string } {
  if (item.kind === "difference") return { title: "추가 결제", meta: `${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq}`, art: "/images/home/icon-fee.webp" };
  if (item.kind === "missing_box") return { title: "도착이 늦어요", meta: `${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq}`, art: "/images/home/icon-truck.webp" };
  if (item.kind === "unpaid") return { title: "결제를 마치지 않은 선물", meta: `${item.creatorName}님께 보낼 선물`, art: "/images/home/icon-fee.webp" };
  if (item.kind === "return_address") return { title: "돌려받을 주소 확인", meta: `${item.creatorName}님께 보낸 선물 · 상자 ${item.boxSeq}`, art: "/images/home/icon-truck.webp" };
  return { title: `${item.creatorName}님이 보낸 선물 받기`, meta: "받을지 정해 주세요", art: "/images/home/icon-gift.webp" };
}

/** 남은 날(서울 날짜) — 기한 당일이면 0. 기한이 아직 없으면(검수 완료 스캔 전 차액) null */
function daysLeft(item: ActionItem, now: string): number | null {
  return item.dueAt ? Math.max(0, seoulDaysUntil(item.dueAt, now)) : null;
}

const leftText = (days: number) => (days > 0 ? `${days}일 남음` : "오늘까지");

function Featured({ item, now }: { item: ActionItem; now: string }) {
  const c = rowCopy(item);
  const days = daysLeft(item, now);
  const id = `ac-feat-${item.kind}`;
  return (
    <article className={`feat ${s.feat}`} data-action-row="" data-kind={item.kind} aria-labelledby={id}>
      <div className="feat-who">
        <span className="face" aria-hidden="true">
          <img src={c.art} alt="" width={40} height={40} />
        </span>
        <div>
          <strong id={id}>{c.title}</strong>
          <span className="meta">{c.meta}</span>
        </div>
      </div>
      {days !== null && item.dueAt ? (
        <div className="feat-days">
          <p className="num-big">{days > 0 ? <>{days}일<small>남음</small></> : <>오늘<small>까지</small></>}</p>
          <span className="lab">{formatMonthDayKo(item.dueAt)}까지</span>
        </div>
      ) : (
        <span />
      )}
      <Link className="btn" href={giftDetailHref(item.orderNo, true)} aria-label={`${c.title} 바로 하기 — ${c.meta}`}>
        바로 하기
      </Link>
    </article>
  );
}

function Row({ item, now }: { item: ActionItem; now: string }) {
  const c = rowCopy(item);
  const days = daysLeft(item, now);
  return (
    <li className="lrow" data-action-row="" data-kind={item.kind}>
      <span className="face" aria-hidden="true">
        {item.creatorName.slice(0, 1)}
      </span>
      <p className="lrow-txt">
        <strong>{c.title}</strong>
        <span className="meta">{c.meta}</span>
      </p>
      <div className="lrow-side">
        {days !== null ? <span className="tag tag--warn">{leftText(days)}</span> : null}
        <Link className="btn btn--line btn--sm" href={giftDetailHref(item.orderNo, true)} aria-label={`${c.title} 바로 하기 — ${c.meta}`}>
          바로 하기
        </Link>
      </div>
    </li>
  );
}

export function ActionCenterPage({ items, now }: Props) {
  const [first, ...rest] = byUrgency(items);
  return (
    <>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            지금 할 일{items.length > 0 ? <span className="ph-count">{items.length}</span> : null}
          </h1>
        </div>
        <p className="ph-desc">끝내면 여기서 사라져요.</p>
      </header>
      {first ? (
        <>
          <Featured item={first} now={now} />
          {rest.length > 0 ? (
            <ul className={`lrows ${s.rows}`}>
              {rest.map((it) => (
                <Row key={`${it.kind}-${it.orderNo}-${"boxId" in it ? it.boxId : ""}`} item={it} now={now} />
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <section className={`card ${s.empty}`} aria-labelledby="ac-empty" data-testid="action-empty">
          <img className={s.emptyArt} src="/images/home/icon-approve.webp" alt="" aria-hidden="true" width={72} height={72} />
          <h2 id="ac-empty">지금 할 일이 없어요</h2>
          <p>새로 생기면 여기에 알려 드릴게요.</p>
          <Link className="btn btn--line" href="/gifts">
            보낸 선물 보기
          </Link>
        </section>
      )}
    </>
  );
}
