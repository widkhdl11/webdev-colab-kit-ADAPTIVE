"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  ANSWER_LABELS,
  DIRECTION_ERROR_LABELS,
  DIRECTION_LABELS,
  QUESTION_LABELS,
  accuracyBars,
  directionsFor,
  fmtPct,
  summarize,
  weekLabel,
  type AccuracyBar,
  type Answer,
  type Direction,
  type ReviewItem,
  type ReviewWeek,
} from "@/entities/verdict-review";
import type { AnswerActionResult, AnswerError, AnswerInput } from "@/features/verdict-review";
import { safeSourceUrl } from "@/features/content-render";
import styles from "./verdict-review.module.css";

interface Props {
  /** 화면이 여는 주 — 답을 받는 주, 없으면 가장 최근 주. 아무 주도 없으면 null */
  week: ReviewWeek | null;
  items: ReviewItem[];
  /** 지난 주들(주별 정확도 막대) */
  history: ReviewWeek[];
  /** 서버가 판정한 「답을 받는 주인가」(DB 함수와 같은 판정) */
  open: boolean;
  answer: (input: AnswerInput) => Promise<AnswerActionResult>;
}

const ERROR_TEXT: Record<AnswerError, string> = {
  closed: "이 주는 닫혔다",
  no_week: "그 주의 표본이 없다",
  no_item: "표본에 없는 글이다",
  bad_answer: "받을 수 없는 답이다",
  bad_direction: "이 판정에 붙을 수 없는 방향이다",
  bad_input: "보낸 값이 올바르지 않다",
  forbidden: "이 PC 의 개발 서버에서만 답할 수 있다",
};

function answerText(a: Answer | null, d: Direction | null): string {
  if (a === null) return "";
  if (a !== "wrong") return ANSWER_LABELS[a];
  return `틀리다 · ${DIRECTION_LABELS[d ?? "unknown"]}`;
}

/**
 * 판정 검토 탭 (docs/specs/verdict-review.md). 판단은 entities/features 에서 가져오고 여기선 그리기만 한다.
 *
 * 답은 누르는 즉시 저장된다(제출 버튼 없음). 안 답한 글이 위, 답한 글은 접혀서 아래.
 * 키보드: ↑↓ 글 이동 · 1 맞다 · 2 틀리다 · 3 모르겠다 · Esc 방향 칸 닫기.
 */
export function VerdictReview({ week: initialWeek, items: initialItems, history, open: initialOpen, answer }: Props) {
  const [week, setWeek] = useState(initialWeek);
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(initialOpen);
  // 방향 칸이 열린 글
  const [dirsFor, setDirsFor] = useState<string | null>(null);
  // 안 답한 목록에서 「틀리다」를 눌러 방향을 고르는 중인 글 — 고를 때까지 제자리에 둔다
  const [pinned, setPinned] = useState<string | null>(null);
  const [openDone, setOpenDone] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const saving = useRef(false);
  // 다시 그린 뒤 초점을 줄 곳. 키보드로 답했을 때만 — 마우스로 누를 때 화면이 튀면 안 된다.
  const focusAfter = useRef<string | null>(null);
  const listHead = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const sel = focusAfter.current;
    if (sel === null) return;
    focusAfter.current = null;
    const el = (document.querySelector(sel) as HTMLElement | null) ?? listHead.current;
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  });

  const noOf = useCallback((id: string) => items.find((i) => i.itemId === id)?.position ?? 0, [items]);

  const save = useCallback(
    async (input: AnswerInput): Promise<boolean> => {
      if (saving.current) return false; // 저장 중에 같은 키를 또 누르면 두 번 나간다
      saving.current = true;
      try {
        const r = await answer(input);
        if (!r.ok) {
          if (r.error === "closed") {
            setOpen(false);
            // 버튼이 전부 꺼지면 누르던 버튼이 초점을 잃고 초점이 맨 위로 떨어진다 — 목록 제목으로 옮긴다
            focusAfter.current = "#vr-list-head";
          }
          setStatus({ text: `저장하지 못했다: ${ERROR_TEXT[r.error]}`, error: true });
          return false;
        }
        setWeek(r.week);
        setItems(r.items);
        const it = r.items.find((i) => i.itemId === input.itemId);
        const left = r.items.filter((i) => i.answer === null).length;
        setStatus({ text: `${it?.position ?? ""}번 「${answerText(it?.answer ?? null, it?.direction ?? null)}」 저장 · 남은 ${left}건`, error: false });
        return true;
      } catch {
        setStatus({ text: "저장하지 못했다: 개발 서버에 닿지 않는다", error: true });
        return false;
      } finally {
        saving.current = false;
      }
    },
    [answer],
  );

  /** 방금 답한 글 다음 번호의 안 답한 글. 뒤에 없으면 앞에서 찾는다. */
  const nextTodo = useCallback(
    (afterId: string, list: readonly ReviewItem[]): string | null => {
      const after = noOf(afterId);
      const todo = list.filter((i) => i.answer === null && i.itemId !== afterId).sort((a, b) => a.position - b.position);
      const next = todo.find((i) => i.position > after) ?? todo[0];
      return next ? `[data-item="${next.itemId}"]` : null;
    },
    [noOf],
  );

  if (week === null) {
    return <p className={styles.empty}>아직 뽑힌 표본이 없습니다. 매일 아침 수집 실행이 월요일부터 그 주 표본을 뽑습니다.</p>;
  }

  const s = summarize(items, { firstAnswerAt: week.firstAnswerAt, completedAt: week.completedAt });
  const names = Object.fromEntries(items.map((i) => [i.snapshot.source, i.snapshot.sourceName]));

  const onAnswer = async (item: ReviewItem, a: Answer, byKey: boolean) => {
    if (!open) return;
    const dirs = directionsFor(item.hot);
    if (a === "wrong" && dirs.length > 1) {
      if (dirsFor === item.itemId) {
        setDirsFor(null);
        setPinned(null);
        return;
      }
      // 이미 방향까지 고른 글이면 저장하지 않고 칸만 연다 — 다시 저장하면 고른 방향이 「안 고름」으로 덮인다.
      const chosen = item.answer === "wrong" && item.direction !== null && item.direction !== "unknown";
      // 틀리다는 누르는 순간 「어느 쪽인지 안 고름」으로 저장되고, 방향을 고르면 덮어쓴다 — 중간에 닫아도 답이 남는다.
      if (!chosen && !(await save({ week: week.week, itemId: item.itemId, answer: "wrong" }))) return;
      if (item.answer === null) setPinned(item.itemId);
      setDirsFor(item.itemId);
      focusAfter.current = `[data-dir-of="${item.itemId}"]`;
      return;
    }
    if (!(await save({ week: week.week, itemId: item.itemId, answer: a }))) return;
    setDirsFor(null);
    setPinned(null);
    focusAfter.current = byKey ? nextTodo(item.itemId, items) ?? `[data-done-of="${item.itemId}"]` : null;
  };

  const onDirection = async (item: ReviewItem, d: Exclude<Direction, "unknown">, byKey: boolean) => {
    if (!(await save({ week: week.week, itemId: item.itemId, answer: "wrong", direction: d }))) return;
    closeDirs(item.itemId, byKey);
  };

  const closeDirs = (id: string, byKey: boolean) => {
    setDirsFor(null);
    setPinned(null);
    focusAfter.current = byKey ? nextTodo(id, items) ?? `[data-done-of="${id}"]` : null;
  };

  const onKey = async (e: KeyboardEvent<HTMLElement>, item: ReviewItem) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    if (e.key === "Escape" && dirsFor !== null) {
      e.preventDefault();
      closeDirs(dirsFor, true);
      return;
    }
    // 처리기는 글(li)마다 하나다 — 답한 글은 펼친 안쪽(방향 칸 등)에서 누른 키도 여기로 올라온다.
    // 초점이 갈 자리는 안 답한 글이면 li 자신, 답한 글이면 접힌 줄(summary)이다.
    const li = e.currentTarget;
    const own = li.tabIndex >= 0 ? li : li.querySelector<HTMLElement>("summary");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const all = [...document.querySelectorAll<HTMLElement>("li[data-item]")];
      const to = all[all.indexOf(li) + (e.key === "ArrowDown" ? 1 : -1)];
      if (to) {
        e.preventDefault();
        (to.tabIndex >= 0 ? to : to.querySelector<HTMLElement>("summary"))?.focus();
      }
      return;
    }
    // 숫자키는 글(또는 접힌 줄)에 초점이 있을 때만 — 버튼 안에서는 버튼의 동작이 우선이다
    if (e.target !== own) return;
    const map: Record<string, Answer> = { "1": "correct", "2": "wrong", "3": "unsure" };
    const a = map[e.key];
    if (a) {
      e.preventDefault();
      await onAnswer(item, a, true);
    }
  };

  const stays = (i: ReviewItem) => i.answer === null || i.itemId === pinned;
  const todo = items.filter(stays).sort((a, b) => a.position - b.position);
  const done = items.filter((i) => !stays(i)).sort((a, b) => a.position - b.position);
  const hotCount = items.filter((i) => i.hot).length;
  const short = week.shortfall.hot + week.shortfall.notHot;

  const body = (item: ReviewItem, withTitle: boolean) => {
    const url = item.snapshot.url ? safeSourceUrl(item.snapshot.url) : null;
    const dirs = directionsFor(item.hot);
    const menu = dirs.length > 1;
    const qs = item.snapshot.trueQuestions;
    return (
      <>
        <div className={styles.head}>
          {withTitle ? (
            <h3 className={styles.title} id={`t-${item.itemId}`}>
              {item.position}.{" "}
              {url ? (
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {item.snapshot.title}
                </a>
              ) : (
                item.snapshot.title
              )}
            </h3>
          ) : (
            <span />
          )}
          <span className={styles.src}>{item.snapshot.sourceName}</span>
        </div>
        <dl className={styles.verdict}>
          <div className={styles.row}>
            <dt>판정</dt>
            <dd id={`v-${item.itemId}`}>
              <strong>{item.hot ? "핫이슈" : "핫이슈 아님"}</strong>
            </dd>
          </div>
          {!item.hot && qs.length > 0 ? (
            // 질문에는 해당했는데 핫이슈가 아닌 글 — 같은 사건 글이 이미 있어 빠졌다. 이걸 모르면
            // 「핫이슈여야 함」을 누르게 되는데, 그건 질문이 아니라 중복 처리의 결과다.
            <div className={styles.row}>
              <dt>참고</dt>
              <dd className={styles.dim}>
                질문({qs.map((q) => QUESTION_LABELS[q] ?? q).join(", ")})에는 해당했지만 같은 사건 글이 이미 있어 빠졌다
              </dd>
            </div>
          ) : null}
          {item.hot && qs.length === 0 ? (
            <div className={styles.row}>
              <dt>근거</dt>
              <dd className={styles.dim}>해당하는 질문이 없다</dd>
            </div>
          ) : null}
          {item.hot
            ? qs.map((q, i) => (
                <div key={q} className={styles.row}>
                  <dt>{i === 0 ? "근거" : <span className="sr-only">근거</span>}</dt>
                  <dd>
                    <strong>{QUESTION_LABELS[q] ?? q}</strong>
                    {item.snapshot.reasons[q] ? ` — ${item.snapshot.reasons[q]}` : ""}
                  </dd>
                </div>
              ))
            : null}
        </dl>
        {item.snapshot.oneLine || item.snapshot.points.length > 0 ? (
          <details className={styles.sum}>
            <summary>요약 보기</summary>
            {item.snapshot.oneLine ? <p>{item.snapshot.oneLine}</p> : null}
            {item.snapshot.points.length > 0 ? (
              <ul>
                {item.snapshot.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </details>
        ) : null}
        <div className={styles.answers} role="group" aria-label={`${item.position}번 채점`}>
          {(["correct", "wrong", "unsure"] as const).map((a) => (
            <button
              key={a}
              type="button"
              className={styles.btn}
              aria-pressed={item.answer === a}
              disabled={!open}
              onClick={(e) => void onAnswer(item, a, e.detail === 0)}
            >
              {a === "wrong" ? (
                menu ? (
                  <>
                    틀리다 <span aria-hidden="true">▾</span>
                  </>
                ) : (
                  `틀리다 (${DIRECTION_LABELS[dirs[0]!]})`
                )
              ) : (
                ANSWER_LABELS[a]
              )}
            </button>
          ))}
        </div>
        {menu && dirsFor === item.itemId && open ? (
          <div className={styles.dirs} id={`dirs-${item.itemId}`} role="group" aria-label={`${item.position}번은 어느 쪽으로 틀렸나`}>
            <span className={styles.dirsQ}>어느 쪽으로 틀렸나 — 안 고르고 닫으면 「{DIRECTION_LABELS.unknown}」</span>
            {dirs.map((d, i) => (
              <button
                key={d}
                type="button"
                className={styles.btn}
                data-dir-of={i === 0 ? item.itemId : undefined}
                aria-pressed={item.direction === d}
                onClick={(e) => void onDirection(item, d as Exclude<Direction, "unknown">, e.detail === 0)}
              >
                {DIRECTION_LABELS[d]}
              </button>
            ))}
            <button type="button" className={styles.btn} onClick={(e) => closeDirs(item.itemId, e.detail === 0)}>
              닫기
            </button>
          </div>
        ) : null}
      </>
    );
  };

  // 주별 정확도 — 어느 주에 값이 있는지는 entities 가 정한다(INV-VR6). 여기선 그리기만.
  const bars = accuracyBars(history, week, s);
  const barText = (b: AccuracyBar) => (b.accuracy === null ? (b.note ?? "값 없음") : fmtPct(b.accuracy));
  const barSr = (b: AccuracyBar) =>
    b.accuracy !== null
      ? fmtPct(b.accuracy)
      : b.total !== undefined
        ? `${b.total}건 중 ${b.answered ?? 0}건 답함`
        : (b.note ?? "값 없음");

  const list = (obj: Record<string, number>, label: (k: string) => string) => {
    const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    if (e.length === 0)
      return (
        <li className={styles.dim}>
          <span>없음</span>
        </li>
      );
    return e.map(([k, n]) => (
      <li key={k}>
        <span title={label(k)}>{label(k)}</span>
        <span className={styles.num}>{n}</span>
      </li>
    ));
  };

  return (
    <div>
      {short > 0 ? (
        <p className={styles.note}>
          후보가 모자라 핫이슈 {hotCount}건 · 핫이슈 아님 {items.length - hotCount}건만 뽑혔다 (한 출처에서 5건까지만)
        </p>
      ) : null}
      <div className={styles.top}>
        <section className={styles.card} aria-label="주별 정확도">
          <h2 className={styles.cardTitle}>주별 정확도</h2>
          <div className={styles.bars} role="img" aria-label={bars.map((b) => `${weekLabel(b.week)} ${barSr(b)}`).join(", ")}>
            {bars.map((b) => (
              <div key={b.week} className={styles.bar} title={`${weekLabel(b.week)} · ${barText(b)}`}>
                <span className={styles.barValue}>{barText(b)}</span>
                {/* 막대 높이를 받는 칸을 따로 둔다 — 숫자 글자와 한 칸에 쌓으면 77% 이상이 전부 같은 높이가 된다 */}
                <div className={styles.track}>
                  {b.accuracy === null ? (
                    <div className={styles.barEmpty} />
                  ) : (
                    <div className={styles.barFill} style={{ height: `${Math.max(2, Math.round(b.accuracy * 100))}%` }} />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className={styles.barLabels} aria-hidden="true">
            {bars.map((b) => (
              <span key={b.week}>{weekLabel(b.week)}</span>
            ))}
          </div>
        </section>
        <section className={styles.card} aria-label="어디서 틀렸나">
          <h2 className={styles.cardTitle}>
            어디서 틀렸나 <span className={styles.dim}>· 틀리다 {s.wrong}건</span>
          </h2>
          <div className={styles.split}>
            <div>
              <h3>어느 쪽으로</h3>
              <ul>{list(s.byDirection, (k) => DIRECTION_ERROR_LABELS[k as Direction] ?? k)}</ul>
            </div>
            <div>
              <h3>질문</h3>
              <ul>{list(s.byQuestion, (k) => QUESTION_LABELS[k] ?? k)}</ul>
            </div>
            <div>
              <h3>출처</h3>
              <ul>{list(s.bySource, (k) => names[k] ?? k)}</ul>
            </div>
          </div>
        </section>
        <section className={styles.card} aria-label="진행">
          <h2 className={styles.cardTitle}>진행</h2>
          <p className={styles.big}>
            <span aria-hidden="true">
              {s.answered}/{s.total}
            </span>
            <span className="sr-only">
              {s.total}건 중 {s.answered}건 답함
            </span>
          </p>
          <p className={styles.dim}>
            {weekLabel(week.week)} · {open ? "답한 수" : "닫힌 주"}
            {s.unsure > 0 ? ` · 모르겠다 ${s.unsure}` : ""}
          </p>
          <div className={styles.meter} aria-hidden="true">
            <div style={{ width: `${s.total ? Math.round((s.answered / s.total) * 100) : 0}%` }} />
          </div>
        </section>
      </div>

      <p className={status.error ? styles.statusError : styles.status} role="status" aria-live="polite">
        {status.text}
      </p>

      <section aria-label="표본">
        <h2 className={styles.listTitle} id="vr-list-head" ref={listHead} tabIndex={-1}>
          표본 {items.length}건 <span className={styles.dim}>· 남은 {items.filter((i) => i.answer === null).length}건</span>
        </h2>
        {open ? (
          <p className={styles.hint} id="vr-keys">↑↓ 로 글 이동 · 1 맞다 · 2 틀리다 · 3 모르겠다. 누르는 즉시 저장된다.</p>
        ) : (
          <p className={styles.note}>닫힌 주다 — 답을 더 받지 않는다</p>
        )}
        <ol className={styles.items}>
          {todo.map((item) => (
            <li
              key={item.itemId}
              className={styles.item}
              tabIndex={0}
              data-item={item.itemId}
              aria-labelledby={`t-${item.itemId} v-${item.itemId}`}
              aria-describedby={open ? "vr-keys" : undefined}
              onKeyDown={(e) => void onKey(e, item)}
            >
              {body(item, true)}
            </li>
          ))}
          {done.map((item) => (
            <li
              key={item.itemId}
              className={`${styles.item} ${styles.itemDone}`}
              data-item={item.itemId}
              onKeyDown={(e) => void onKey(e, item)}
            >
              <details
                open={openDone.has(item.itemId) || dirsFor === item.itemId}
                onToggle={(e) => {
                  const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                  setOpenDone((prev) => {
                    const next = new Set(prev);
                    if (isOpen) next.add(item.itemId);
                    else next.delete(item.itemId);
                    return next;
                  });
                }}
              >
                <summary
                  className={styles.doneSummary}
                  data-done-of={item.itemId}
                  aria-describedby={open ? "vr-keys" : undefined}
                >
                  <h3 className={styles.doneTitle} id={`t-${item.itemId}`}>
                    {item.position}. {item.snapshot.title}
                  </h3>
                  <span className={styles.dim}>{answerText(item.answer, item.direction)}</span>
                </summary>
                {body(item, false)}
              </details>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
