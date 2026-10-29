"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { FanBoxReply } from "@/entities/gift-reply/api/gift-reply-reads";
import { CreatorPhoto } from "@/entities/creator/ui/creator-photo";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { CARD_SIZES, creatorNameOrWithdrawn, dotDate, monthDayText, REPLY_PHRASE_TEXT, shareTextOf, xIntentUrl, type CardSize } from "@/entities/gift-reply/model/reply";
import { statusTagClass } from "@/shared/ui/status-tone";
import { sendReplyConsent } from "../api/send-gift-reply";
import s from "./gift-reply.module.css";

// 팬 — 보낸 선물의 상자별 받았어요·답장(gift-reply INV-G6·G8·G9). 시안: docs/design/mockups/addendum/together.html(답장 카드) · share-card.html.
// 「함께한 시간」 화면(together)이 생기기 전까지는 선물 상세에 둔다 — 같은 읽기 함수(my_gift_replies)를 쓴다.
// 상자 상태는 받았어요 기록이나 배송 수령 중 하나라도 있으면 「받았어요」, 날짜만 보이고 시각은 없다(INV-G6 — 읽기 함수가 날짜만 준다).
// 공개 동의 두 칸은 누르는 즉시 저장하고(INV-G8), 실패하면 되돌린다. 공개를 끄면 닉네임 보이기도 꺼지는 것은 DB 가 정하고, 저장된 두 값을 그린다. 공유 카드는 보낸 사람 본인만 만들 수 있다 — 이미지 주소가 로그인 세션으로 주인을 확인한다(INV-G9).
// 「#팬꾹」·「@계정」은 이미지가 아니라 X 글쓰기 창의 글에 채운다(shareTextOf).
// 세션이 끝나 다시 로그인하면 돌아올 주소(returnPath)는 그리는 화면이 정한다 — 선물 상세와 「함께한 시간」이 같이 쓴다.

const SIZE_LABEL: Record<CardSize, string> = { square: "정사각형", wide: "X 용 가로" };

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function SharePanel({ row, id }: { row: FanBoxReply; id: string }) {
  const uid = useId();
  const [size, setSize] = useState<CardSize>("square");
  const [withName, setWithName] = useState(false);
  const query = `size=${size}${withName ? "&name=1" : ""}`;
  const src = `/api/gifts/reply-card/${row.boxId}?${query}`;
  const text = shareTextOf(row.xTag);
  const { width, height } = CARD_SIZES[size];
  return (
    <div className={s.share} id={id}>
      <fieldset className={s.fs}>
        <legend>카드 모양</legend>
        <div className={s["share-sizes"]}>
          {(Object.keys(SIZE_LABEL) as CardSize[]).map((k) => (
            <label key={k} className={s.check}>
              <input type="radio" name={`${uid}-size`} checked={size === k} onChange={() => setSize(k)} />
              {SIZE_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className={s.check}>
        <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.currentTarget.checked)} />내 닉네임 넣기
      </label>
      <img className={s["share-prev"]} src={src} alt={`공유 카드 미리보기 — ${creatorNameOrWithdrawn(row.creatorName)}님의 답장`} width={width} height={height} />
      <div className={s["share-btns"]}>
        <a className="btn btn--line" href={`${src}&download=1`} download>
          이미지 저장
        </a>
        <a className="btn" href={xIntentUrl(text)} target="_blank" rel="noopener noreferrer">
          X에 올리기
        </a>
      </div>
      <p className={s["share-text"]}>
        X 글쓰기 창에 ‘{text}’이 입력됩니다.
        <br />
        저장한 이미지를 첨부해 게시해 주세요. 카드에는 주소·주문번호·송장번호가 포함되지 않습니다.
      </p>
    </div>
  );
}

type Reply = NonNullable<FanBoxReply["reply"]>;

function ReplyCard({ row, reply, photoBase, returnPath }: { row: FanBoxReply; reply: Reply; photoBase: string; returnPath: string }) {
  const router = useRouter();
  const uid = useId();
  const [isPublic, setIsPublic] = useState(row.fanPublic);
  const [showNickname, setShowNickname] = useState(row.fanShowNickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const name = creatorNameOrWithdrawn(row.creatorName);
  const errId = `${uid}-err`;

  const save = async (next: { isPublic: boolean; showNickname: boolean }) => {
    if (busy) return;
    const before = { isPublic, showNickname };
    setIsPublic(next.isPublic);
    setShowNickname(next.showNickname);
    setBusy(true);
    setError(null);
    const r = await sendReplyConsent({ boxId: row.boxId, ...next });
    setBusy(false);
    if (r.kind === "ok") {
      setIsPublic(r.value.isPublic);
      setShowNickname(r.value.showNickname);
      return;
    }
    setIsPublic(before.isPublic);
    setShowNickname(before.showNickname);
    if (r.kind === "login") router.push(`/login?next=${returnPath}`);
    else setError(r.message);
  };

  return (
    <div className={s.reply} role="group" aria-label={`${monthDayText(reply.repliedOn)} ${name}님의 답장`}>
      <div className={s["reply-top"]}>
        <CreatorPhoto photoUrl={creatorPhotoUrl(photoBase, row.creatorPhotoPath)} tone="var(--face-6)" className={`face ${s["reply-photo"]}`} />
        <b>{name}님의 답장</b>
        <span className={s.d}>{dotDate(reply.repliedOn)}</span>
      </div>
      <q>{REPLY_PHRASE_TEXT[reply.phrase]}</q>
      {reply.line ? <p className={s.more}>{reply.line}</p> : null}

      <div className={s.consent}>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={isPublic}
            aria-disabled={busy}
            aria-describedby={`${uid}-pub-hint${error ? ` ${errId}` : ""}`}
            onChange={(e) => void save({ isPublic: e.currentTarget.checked, showNickname })}
          />
          답장 공개 허용
        </label>
        <p className={`${s["check-hint"]}`} id={`${uid}-pub-hint`}>
          크리에이터도 답장 모음을 공개한 경우, 크리에이터의 수령 확인일 3일 후부터 선물 링크 페이지에 표시됩니다.
        </p>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={showNickname}
            disabled={!isPublic}
            aria-disabled={busy}
            aria-describedby={`${uid}-nick-hint${error ? ` ${errId}` : ""}`}
            onChange={(e) => void save({ isPublic, showNickname: e.currentTarget.checked })}
          />
          닉네임 공개
        </label>
        <p className={s["check-hint"]} id={`${uid}-nick-hint`}>
          해제 시 ‘익명의 팬’으로 표시됩니다.
        </p>
        {error ? (
          <p className={s.error} id={errId} role="alert">
            <span className={s["error-mark"]} aria-hidden="true">
              !
            </span>
            {error}
          </p>
        ) : null}
      </div>

      <div className={s["reply-foot"]}>
        <button className="btn btn--line btn--sm" type="button" aria-expanded={sharing} aria-controls={`${uid}-share`} onClick={() => setSharing((v) => !v)}>
          <ShareIcon />
          카드로 공유
        </button>
      </div>
      {sharing ? <SharePanel row={row} id={`${uid}-share`} /> : null}
    </div>
  );
}

export function FanBoxReplies({
  rows,
  photoBase,
  returnPath,
}: {
  rows: readonly FanBoxReply[];
  photoBase: string;
  /** 다시 로그인한 뒤 돌아올 주소 */
  returnPath: string;
}) {
  return (
    <div className={s.boxes}>
      {rows.map((row) => (
        <div key={row.boxId}>
          <div className={s["box-head"]}>
            <h3>{row.boxCount > 1 ? `상자 ${row.boxSeq}` : "상자"}</h3>
            {row.received ? (
              <span className={statusTagClass("success")}>수령 확인{row.receivedOn ? ` · ${monthDayText(row.receivedOn)}` : ""}</span>
            ) : (
              <span className={statusTagClass("info")}>크리에이터에게 배송 중</span>
            )}
          </div>
          {row.reply ? (
            <ReplyCard row={row} reply={row.reply} photoBase={photoBase} returnPath={returnPath} />
          ) : row.received ? (
            <p className={s.wait}>수령이 확인되었습니다. 답장이 등록되면 이곳에 표시됩니다.</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
