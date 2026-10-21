import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { mostRecentlyMoved } from "@/entities/order/model/last-moved";
import { giftDetailHref } from "@/entities/action-item/model/action-items";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { fanBadge, fanGiftBucket, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import type { GiftGroup } from "../model/gift-groups";
import { GiftTabs } from "./gift-tabs";
import s from "./gift-list.module.css";

// 보낸 선물 — 팬·크리에이터 모두 「보낸 선물」 (action-center INV-J14, design-rules 21절, 시안 v34-part1/gifts.html · v34.css .grp).
// 크리에이터별 묶음: 묶음 머리(얼굴 + 「OO님과 함께한 시간」 + 선물·답장 수 + 꺾쇠) 전체가 함께한 시간으로 가는 링크, 그 아래 그 크리에이터에게 보낸 선물 줄.
// 머리 숫자는 함께한 시간과 같은 읽기의 값이다(묶음은 model/gift-groups.ts) — 탭이 줄을 걸러도 숫자는 그대로다.
// 탭은 「진행 중」·「완료」 둘 — 끝난 선물과 받지 않은 선물(거절·기한 지남)이 「완료」로 합쳐진다. 줄이 하나도 없는 묶음은 그 탭에서 보이지 않는다.
// 탭마다 가장 최근 움직인 줄 하나만 강조 줄(하늘 면). 줄은 선물 상세(INV-J12)로 간다. 본문 틀 <main class="page-pane"> 은 라우트가 MyShell 로 붙인다.

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

function GiftRow({ gift, faceTone, hi }: { gift: FanGiftView; faceTone: string | undefined; hi: boolean }) {
  const badge = fanBadge(gift);
  const progress = fanProgress(gift);
  const who = `${gift.creatorName}님께`;
  return (
    <li className={hi ? "lrow lrow--hi" : "lrow"} data-gift-row="" data-hi={hi ? "" : undefined}>
      <CreatorFace tone={faceTone ?? "var(--face-1)"} />
      <p className="lrow-txt">
        {/* together INV-F7: 나만 보는 메모의 선물 이름 — 본인 목록(my_gifts)에만 온다 */}
        <Link className="stretch" href={giftDetailHref(gift.orderNo)} aria-label={`${who} 보낸 선물 ${gift.orderNo} 상세`}>
          <strong>{gift.memoTitle ? `${who} · ${gift.memoTitle}` : who}</strong>
        </Link>
        <span className="meta">
          {gift.itemKind} · 상자 {gift.boxCount}개
        </span>
      </p>
      <div className="lrow-side">
        <span className={statusTagClass(badge.tone)}>{badge.text}</span>
        {gift.outcome === "in_progress" ? (
          <span
            className="mini-steps"
            role="progressbar"
            aria-label={`${who} 보낸 선물 ${gift.orderNo} 진행 단계`}
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            aria-valuetext={`${progress.total}단계 중 ${progress.done}단계 완료, ${badge.text}`}
          >
            <span className="segs">
              {gift.steps.map((st) => (
                <i key={st.key} className={st.state === "done" ? "on" : undefined} />
              ))}
            </span>
            <span aria-hidden="true">
              {progress.done}/{progress.total}
            </span>
          </span>
        ) : null}
      </div>
      <Chev />
    </li>
  );
}

function Group({ group, rows, hi, faceToneByName }: { group: GiftGroup; rows: readonly FanGiftView[]; hi: string | null; faceToneByName: Readonly<Record<string, string>> }) {
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
      <ul className="lrows">
        {rows.map((g) => (
          <GiftRow key={g.orderNo} gift={g} faceTone={faceToneByName[g.creatorName]} hi={g.orderNo === hi} />
        ))}
      </ul>
    </section>
  );
}

function Panel({ groups, filter, empty, faceToneByName }: { groups: readonly GiftGroup[]; filter: Filter; empty: string; faceToneByName: Readonly<Record<string, string>> }) {
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
  const hi = mostRecentlyMoved(shown.flatMap((x) => x.rows));
  return (
    <>
      {shown.map((x) => (
        <Group key={x.group.key} group={x.group} rows={x.rows} hi={hi} faceToneByName={faceToneByName} />
      ))}
    </>
  );
}

export function GiftListPage({
  groups,
  faceToneByName,
  title = "보낸 선물",
  tabs,
}: {
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
  return (
    <>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            {title}
            <span className="ph-count">{all.length}</span>
          </h1>
          <Link className="btn btn--sm" href="/gifts/new">
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
            panel: <Panel groups={groups} filter={ongoing} faceToneByName={faceToneByName} empty="지금 진행 중인 선물이 없어요." />,
          },
          {
            id: "done",
            label: `완료 ${all.length - ongoingN}`,
            panel: <Panel groups={groups} filter={done} faceToneByName={faceToneByName} empty="아직 완료된 선물이 없어요." />,
          },
        ]}
      />
    </>
  );
}
