"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { ReceivedBox } from "@/entities/gift-reply/api/gift-reply-reads";
import { ITEM_CATEGORY_LABEL, isItemCategory } from "@/entities/gift-item/model/item-category";
import {
  monthDayText,
  normalizeReplyLine,
  RECEIVED_BOXES_MAX,
  receivedListCapped,
  REPLY_INPUT_MESSAGE,
  REPLY_LINE_MAX,
  REPLY_PHRASE_TEXT,
  REPLY_PHRASES,
  replyActionsOf,
  replyLineMessage,
  type ReplyPhrase,
} from "@/entities/gift-reply/model/reply";
import { monthHeadKo, seoulYearMonth } from "@/shared/lib/format/datetime";
import { charCount } from "@/shared/lib/validation/char-count";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { sendConfirmGiftBox, sendDeleteGiftReply } from "../api/send-gift-reply";
import s from "./gift-reply.module.css";

// 크리에이터 — 받은 선물(gift-reply). 시안: docs/design/mockups/site/v37-part2/boxes.html (design-rules 23-3절) — 상자는 달마다, 가장 최근 달은 같은 모양 카드 2열,
// 그보다 지난 달은 촘촘한 줄. 오른쪽 288 회색 칸에 「답장하지 않은 선물」 수. 「받았어요」를 누른 카드만 한 줄 전체로 넓어져 답장 칸이 열린다(줄은 그 아래로 열린다).
// 출고된 상자마다 카드 하나. 「받았어요」를 누르면 그 자리에 답장 칸이 열리고, 「답장 보내기」나 「답장 없이 확인만」을 눌러야 확정된다(INV-G2 — 여는 것만으로는 아니다).
// 확인만 한 상자는 「답장 남기기」로 한 번 더할 수 있고, 답장은 고칠 수 없고 지우기만 된다(INV-G4). 무엇을 할 수 있는지는 replyActionsOf 가 정한다.
// 저장은 로그인 세션으로만 — 크리에이터 ID 를 보내지 않는다(INV-G1). 저장된 뒤 서버에서 다시 읽는다(위 「답장하지 않은 선물」 숫자도 DB 가 센다, INV-G10).
// 저장하면 누른 버튼이 사라지므로(답장 칸이 닫히거나 지우기 버튼이 없어진다), 포커스를 그 줄의 제목(늘 남는 요소)으로 옮긴다.

/** 세션이 끝났을 때 — 다시 로그인한 뒤 이 화면으로 돌아온다 */
const LOGIN_AGAIN = "/login?next=/creator/boxes"; // 받은 선물은 v18 에서 승인 요청과 나뉜 화면(/creator/boxes)

function ErrorMark() {
  return (
    <span className={s["error-mark"]} aria-hidden="true">
      !
    </span>
  );
}

function boxText(b: ReceivedBox): string {
  const what = isItemCategory(b.itemCategory) ? ITEM_CATEGORY_LABEL[b.itemCategory] : b.itemKind;
  return b.boxCount > 1 ? `${what} · 상자 ${b.boxCount}개 중 ${b.boxSeq}번째` : `${what} · 상자 1개`;
}

type FormMode = "confirm" | "add";

function ReplyForm({ box, mode, onDone }: { box: ReceivedBox; mode: FormMode; onDone: (text: string) => void }) {
  const router = useRouter();
  const uid = useId();
  const [phrase, setPhrase] = useState<ReplyPhrase | null>(null);
  const [line, setLine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorId = `${uid}-err`;
  const hintId = `${uid}-hint`;
  const countId = `${uid}-count`;

  const submit = async (withReply: boolean) => {
    if (busy) return;
    setError(null);
    const normalized = withReply ? normalizeReplyLine(line) : null;
    if (withReply && !phrase) {
      setError(REPLY_INPUT_MESSAGE.phraseMissing);
      return;
    }
    const problem = replyLineMessage(normalized);
    if (problem) return setError(problem);
    setBusy(true);
    const r = await sendConfirmGiftBox({ boxId: box.boxId, phrase: withReply ? phrase : null, line: normalized });
    setBusy(false);
    if (r.kind === "login") {
      router.push(LOGIN_AGAIN);
      return;
    }
    if (r.kind === "failed") {
      setError(r.message);
      return;
    }
    onDone(withReply ? `${box.senderNickname}님께 답장을 보냈습니다.` : "수령이 확인되었습니다.");
    router.refresh();
  };

  return (
    <form className={s.form} aria-labelledby={`${uid}-title`} onSubmit={(e) => e.preventDefault()}>
      <h3 id={`${uid}-title`}>{box.senderNickname}님께 답장</h3>
      <fieldset aria-describedby={error ? errorId : undefined}>
        <legend className="sr-only">짧은 답장 고르기</legend>
        <div className="tags">
          {REPLY_PHRASES.map((p) => (
            <label key={p} className="opt">
              <input type="radio" name={`${uid}-phrase`} value={p} checked={phrase === p} onChange={() => setPhrase(p)} />
              <span>{REPLY_PHRASE_TEXT[p]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className={s["line-field"]}>
        <label className="label" htmlFor={`${uid}-line`}>
          한 줄 더 쓰기 <span>(선택)</span>
        </label>
        <input
          className="field"
          id={`${uid}-line`}
          type="text"
          value={line}
          placeholder="예: 손편지 읽고 한참 웃었어요"
          autoFocus
          aria-describedby={`${hintId} ${countId}${error ? ` ${errorId}` : ""}`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setLine([...e.currentTarget.value].slice(0, REPLY_LINE_MAX + 20).join(""))}
        />
        <p className={`t-meta ${s.count}`} id={countId}>
          {charCount(line.trim())} / {REPLY_LINE_MAX}
        </p>
      </div>
      <details className={s.fold}>
        <summary>답장 공개 범위</summary>
        <p className="t-meta" id={hintId}>
          답장은 {box.senderNickname}님께 전달됩니다. 팬이 공개에 동의하고 크리에이터가 ‘답장 모음 보이기’를 켠 경우, ‘받았어요’로 수령을 확인한 날부터 3일 뒤에 크리에이터 페이지에도 공개됩니다.<br />전화번호·이메일·인터넷 주소는 입력할 수 없습니다.
        </p>
      </details>
      {error ? (
        <p className={s.error} id={errorId} role="alert">
          <ErrorMark />
          {error}
        </p>
      ) : null}
      <div className={s["form-btns"]}>
        <button className="btn" type="button" aria-disabled={busy} onClick={() => void submit(true)}>
          {busy ? "보내는 중…" : "답장 보내기"}
        </button>
        {mode === "confirm" ? (
          <button className="btn btn--line" type="button" aria-disabled={busy} onClick={() => void submit(false)}>
            답장 없이 확인만
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** 카드 아래·줄 오른쪽 한 줄 — 출고 날 + 답장 상태 */
function footText(box: ReceivedBox, dense: boolean): string {
  const shipped = `${monthDayText(box.shippedOn)} 출고`;
  if (box.replyState === "confirmed") return `${shipped} · 수령 확인`;
  if (box.replyState === "deleted") return `${shipped} · 답장 삭제`;
  if (box.replyState === "replied" && box.reply) {
    return dense ? `${shipped} · 「${REPLY_PHRASE_TEXT[box.reply.phrase]}」 답장` : `${shipped} · ${monthDayText(box.reply.repliedOn)} 답장`;
  }
  return shipped;
}

function ReceivedRow({ box, index, dense, onStatus }: { box: ReceivedBox; index: number; dense: boolean; onStatus: (text: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = useRef<HTMLElement>(null);
  const actions = replyActionsOf(box.replyState);
  const formMode: FormMode = actions.confirm ? "confirm" : "add";
  const formOpen = open && (actions.confirm || actions.addReply);

  const remove = async () => {
    if (busy) return;
    if (!window.confirm("답장을 삭제할까요? 팬의 기록과 공개 답장 모음에서도 삭제되며, 이 상자에는 다시 답장할 수 없습니다.")) return;
    setBusy(true);
    setError(null);
    const r = await sendDeleteGiftReply(box.boxId);
    setBusy(false);
    if (r.kind === "login") {
      router.push(LOGIN_AGAIN);
      return;
    }
    if (r.kind === "failed") {
      setError(r.message);
      return;
    }
    title.current?.focus();
    onStatus("답장이 삭제되었습니다.");
    router.refresh();
  };

  const action =
    (actions.confirm || actions.addReply) && !open ? (
      <button className="btn btn--sm btn--line" type="button" onClick={() => setOpen(true)}>
        {actions.confirm ? "받았어요" : "답장 남기기"}
      </button>
    ) : actions.remove ? (
      <button className={s.linkbtn} type="button" aria-disabled={busy} onClick={() => void remove()}>
        {busy ? "삭제 중…" : "답장 삭제"}
      </button>
    ) : null;
  const errorLine = error ? (
    <p className={s.error} role="alert">
      <ErrorMark />
      {error}
    </p>
  ) : null;
  const form = formOpen ? (
    <ReplyForm
      box={box}
      mode={formMode}
      onDone={(text) => {
        setOpen(false);
        title.current?.focus();
        onStatus(text);
      }}
    />
  ) : null;

  if (dense) {
    return (
      <li className={s.ditem} data-box="">
        <div className={`lrow ${s.drow}`}>
          <FaceAvatar index={index} className="face face--sm" />
          <p className="lrow-txt">
            <strong className={s.who} ref={title} tabIndex={-1}>
              {box.senderNickname}님의 선물
            </strong>
            <span className="meta">{boxText(box)}</span>
          </p>
          <div className={`lrow-side ${s.dside}`}>
            <span>{footText(box, true)}</span>
            {action}
          </div>
        </div>
        {errorLine}
        {form}
      </li>
    );
  }

  return (
    <li className={`card ${s.bcard} ${formOpen ? s.open : ""}`} data-box="">
      <div className={s.btop}>
        <FaceAvatar index={index} className={`face ${s.bface}`} />
        <div>
          <strong className={s.who} ref={title} tabIndex={-1}>
            {box.senderNickname}님의 선물
          </strong>
          <span>{boxText(box)}</span>
        </div>
      </div>
      {formOpen ? (
        form
      ) : (
        <>
          {box.reply ? (
            <div className={s.quote}>
              <b>{REPLY_PHRASE_TEXT[box.reply.phrase]}</b>
              {box.reply.line ? <span>{box.reply.line}</span> : null}
            </div>
          ) : null}
          {errorLine}
          <div className={s.bfoot}>
            <span>{footText(box, false)}</span>
            {action}
          </div>
        </>
      )}
    </li>
  );
}

type Month = { key: string; boxes: ReceivedBox[] };

function byMonth(boxes: readonly ReceivedBox[]): Month[] {
  const out: Month[] = [];
  for (const b of boxes) {
    const key = seoulYearMonth(b.shippedOn);
    const last = out[out.length - 1];
    if (last && last.key === key) last.boxes.push(b);
    else out.push({ key, boxes: [b] });
  }
  return out;
}

export function ReceivedBoxList({ boxes, pending }: { boxes: readonly ReceivedBox[]; pending: number }) {
  const [status, setStatus] = useState("");
  const months = byMonth(boxes);
  const base = months[0]?.key ?? "";
  let n = 0;
  return (
    <div className={s.side2}>
      <div className={s.main}>
        <p className={`sr-only ${s.status}`} role="status">
          {status}
        </p>
        {boxes.length === 0 ? (
          <p className="empty">출고된 선물이 없습니다. 팬꾹에서 출고하면 상자별로 표시됩니다.</p>
        ) : (
          months.map((m, mi) => (
            <section key={m.key} className={s.month} aria-labelledby={`bm-${m.key}`}>
              <div className={s.mhead}>
                <h2 id={`bm-${m.key}`}>{monthHeadKo(m.key, base)}</h2>
                <small>{m.boxes.length}개</small>
              </div>
              {/* 가장 최근 달만 카드, 지난 달은 촘촘한 줄(design-rules 23-3) */}
              <ul className={mi === 0 ? s.bcards : `lrows ${s.drows}`} aria-label={`${monthHeadKo(m.key, base)} 받은 선물 상자`}>
                {m.boxes.map((b) => (
                  <ReceivedRow key={b.boxId} box={b} index={n++} dense={mi > 0} onStatus={setStatus} />
                ))}
              </ul>
            </section>
          ))
        )}
        {receivedListCapped(boxes.length) ? (
          <p className={`t-meta ${s.capped}`}>최근 출고된 상자 {RECEIVED_BOXES_MAX}개까지 표시됩니다. ‘답장하지 않은 선물’ 수에는 이전에 출고된 상자도 포함됩니다.</p>
        ) : null}
      </div>
      {/* INV-G10: 이 숫자는 본인 화면에만 — DB 본인 읽기 함수가 센다 */}
      <aside className={s.bside} aria-labelledby="pend-h">
        <img className={s.bsideImg} src="/images/mascot-gift.png" alt="" width={80} height={80} />
        <h2 className={s.lab} id="pend-h">
          답장하지 않은 선물
        </h2>
        <p className="num-big">
          {pending}
          <small>개</small>
        </p>
        <p className={s.bsideNote}>답장은 선택 사항이며, 이 숫자는 본인에게만 표시됩니다.</p>
      </aside>
    </div>
  );
}
