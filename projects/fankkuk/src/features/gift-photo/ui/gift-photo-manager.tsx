"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type MouseEvent } from "react";
import { PHOTO_ACCEPT } from "@/shared/lib/image/photo-limits";
import { photoPickProblem } from "@/shared/lib/image/photo-pick";
import { deleteGiftPhoto, giftPhotoSrc, sendGiftPhoto } from "../api/send-gift-photo";
import s from "./gift-photo.module.css";

// 「함께한 시간」 선물 카드의 내 사진 — 보기·바꾸기·지우기(together INV-F2, 「스스로 정한 것」 등록 뒤 이 화면에서 바꾸거나 지울 수 있다).
// 사진은 서버가 본인에게만 짧은 서명 주소로 넘겨준다(giftPhotoSrc). 크리에이터 화면에는 이 부품이 없다.
// 화면에 박히는 주소는 우리 라우트 주소이고, 브라우저가 사진을 불러올 때마다 라우트가 60초짜리 서명 주소를 새로 만들어 넘긴다 —
// 화면에 오래 머물러도 이미 그린 사진은 그대로고, 나중에 그리는 사진(스크롤·펼침)도 그 순간 새 서명을 받는다. 화면 밖 사진은 늦게 부른다(lazy).
// 파일 칸은 좁은 폭에서 넘치지 않게 화면에서 숨기고(sr-only — 키보드·화면 읽기는 그대로) 라벨을 버튼 모양으로 보인다(크리에이터 설정 「사진 고르기」와 같은 방식).
// 파일을 고르면 바로 올린다. 실패하면 문구를 보이고 사진은 그대로다. 저장하는 동안에는 파일 칸이 열리지 않고 「저장 중이에요」를 읽어 준다.

/** 무엇을 찍을지와 사진 정보를 지운다는 안내 — 「함께한 시간」 머리 안내 줄(시안 v35 .mnote)이 이 두 문장을 쓴다 */
export const GIFT_PHOTO_RULE = "상자나 송장 대신 선물만 촬영해 주세요. 위치 정보 등 사진의 부가 정보는 삭제 후 저장합니다.";

/** 사진 공개 범위 — 「함께한 시간」 머리 안내 줄의 굵은 글 */
export const GIFT_PHOTO_PRIVATE = "사진은 나에게만 공개됩니다.";

export const GIFT_PHOTO_HINT = `${GIFT_PHOTO_PRIVATE} ${GIFT_PHOTO_RULE}`;

/** 사진 안내를 문장마다 한 줄로(시안 v34-part1/gifts-with.html .rec-note). 글은 GIFT_PHOTO_HINT 그대로 */
export function GiftPhotoHintLines() {
  return (
    <>
      {GIFT_PHOTO_HINT.split(/(?<=\.)\s+/).map((line) => (
        <p key={line}>{line}</p>
      ))}
    </>
  );
}

/**
 * compact: 「함께한 시간」 기록 줄 안에 버튼만 보이는 모양(시안 v34-part1/gifts-with.html — 「사진 올리기」 작은 버튼).
 *   제목·안내 문장은 화면에서 숨기고(sr-only — 화면 읽기와 파일 칸 설명은 그대로) 목록 위에 한 번만 보인다. 사진이 있으면 작은 사진을 버튼 앞에 둔다.
 * emphasis: 첫 선물 칸처럼 하늘 면 위에서는 채운 버튼으로.
 * tile: 「함께한 시간」 사진 앨범 칸(시안 v35-part1/gifts-with-a.html .tile .ph-photo, design-rules 22절) — 정사각 사진 자리.
 *   사진이 있으면 칸을 사진으로 채우고 아래에 바꾸기·지우기, 없으면 같은 크기 칸에 「아직 사진이 없어요」와 「사진 올리기」.
 */
export function GiftPhotoManager({
  orderNo,
  version: initial,
  returnPath,
  compact = false,
  emphasis = false,
  tile = false,
}: {
  orderNo: string;
  version: number | null;
  returnPath: string;
  compact?: boolean;
  emphasis?: boolean;
  tile?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const inputId = `${uid}-file`;
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;

  const finish = (r: Awaited<ReturnType<typeof sendGiftPhoto>>, okText: string) => {
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (r.kind === "ok") {
      setVersion(r.version);
      setDone(okText);
      return;
    }
    if (r.kind === "login") router.push(`/login?next=${encodeURIComponent(returnPath)}`);
    else setError(r.message);
  };

  const upload = async (file: File | undefined) => {
    if (!file || busy) return;
    setError(null);
    setDone(null);
    const problem = photoPickProblem(file);
    if (problem) {
      setError(problem);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    finish(await sendGiftPhoto(orderNo, file), "사진이 저장되었습니다.");
  };

  // 저장하는 동안 라벨·파일 칸을 눌러도 파일 고르기 창이 열리지 않게 한다(aria-disabled 는 누르기를 막지 않는다)
  const blockWhileBusy = (e: MouseEvent<HTMLElement>) => {
    if (busy) e.preventDefault();
  };

  const remove = async () => {
    if (busy) return;
    setError(null);
    setDone(null);
    setBusy(true);
    finish(await deleteGiftPhoto(orderNo), "사진이 삭제되었습니다.");
  };

  // 파일 칸 + 버튼 모양 라벨 — 모양마다 한 자리에만 그린다(파일 칸 id 는 하나)
  const picker = (label: string, className: string) => (
    <>
      <input
        className={`sr-only ${s.file}`}
        id={inputId}
        ref={fileRef}
        type="file"
        accept={PHOTO_ACCEPT}
        aria-describedby={`${hintId}${error ? ` ${errId}` : ""}`}
        aria-disabled={busy}
        onClick={blockWhileBusy}
        onChange={(e) => void upload(e.currentTarget.files?.[0])}
      />
      <label className={`${className} ${s.pick}`} htmlFor={inputId} aria-disabled={busy} onClick={blockWhileBusy}>
        {busy ? "저장 중…" : label}
      </label>
    </>
  );
  const tail = (
    <>
      <p className="sr-only" id={hintId}>
        {GIFT_PHOTO_HINT}
      </p>
      {error ? (
        <p className={s.error} id={errId} role="alert">
          <span className={s["error-mark"]} aria-hidden="true">
            !
          </span>
          {error}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {busy ? "저장 중" : done}
      </p>
    </>
  );

  if (tile) {
    return (
      <div className={s.tile} role="group" aria-labelledby={`${uid}-title`}>
        <p className="sr-only" id={`${uid}-title`}>
          내 선물 사진 · 나에게만 공개
        </p>
        {version ? (
          <>
            <img className={s.tileImg} src={giftPhotoSrc(orderNo, version)} alt="내가 올린 선물 사진" width={320} height={320} loading="lazy" decoding="async" />
            <div className={s.tileActs}>
              {picker("사진 변경", "btn btn--text btn--sm")}
              <button className="btn btn--text btn--sm" type="button" aria-disabled={busy} onClick={() => void remove()}>
                사진 삭제
              </button>
            </div>
          </>
        ) : (
          <div className={s.tileEmpty}>
            <div className={s.tileInner}>
              <img className={s.tileIcon} src="/images/home/icon-gift.webp" alt="" aria-hidden="true" width={64} height={64} />
              <span>등록된 사진 없음</span>
              {picker("사진 업로드", "btn btn--line btn--sm")}
            </div>
          </div>
        )}
        {tail}
      </div>
    );
  }

  return (
    <div className={compact ? s.compact : s.photo} role="group" aria-labelledby={`${uid}-title`}>
      <p className={compact ? "sr-only" : s.title} id={`${uid}-title`}>
        내 선물 사진 <span className={s.only}>· 나에게만 공개</span>
      </p>
      {version ? (
        <img className={s.thumb} src={giftPhotoSrc(orderNo, version)} alt="내가 올린 선물 사진" width={160} height={160} loading="lazy" decoding="async" />
      ) : null}
      <div className={s.btns}>
        <input
          className={`sr-only ${s.file}`}
          id={inputId}
          ref={fileRef}
          type="file"
          accept={PHOTO_ACCEPT}
          aria-describedby={`${hintId}${error ? ` ${errId}` : ""}`}
          aria-disabled={busy}
          onClick={blockWhileBusy}
          onChange={(e) => void upload(e.currentTarget.files?.[0])}
        />
        <label className={`btn ${emphasis ? "" : "btn--line "}btn--sm ${s.pick}`} htmlFor={inputId} aria-disabled={busy} onClick={blockWhileBusy}>
          {busy ? "저장 중…" : version ? "사진 변경" : "사진 업로드"}
        </label>
        {version ? (
          <button className="btn btn--text btn--sm" type="button" aria-disabled={busy} onClick={() => void remove()}>
            사진 삭제
          </button>
        ) : null}
      </div>
      <p className={compact ? "sr-only" : s.hint} id={hintId}>
        {GIFT_PHOTO_HINT}
      </p>
      {error ? (
        <p className={s.error} id={errId} role="alert">
          <span className={s["error-mark"]} aria-hidden="true">
            !
          </span>
          {error}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {busy ? "저장 중" : done}
      </p>
    </div>
  );
}
