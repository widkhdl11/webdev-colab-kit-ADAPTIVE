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

export const GIFT_PHOTO_HINT = "상자·송장이 아니라 선물만 찍어 주세요. 촬영 위치 같은 사진 정보는 지우고 저장해요. 나만 볼 수 있어요.";

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
 */
export function GiftPhotoManager({
  orderNo,
  version: initial,
  returnPath,
  compact = false,
  emphasis = false,
}: {
  orderNo: string;
  version: number | null;
  returnPath: string;
  compact?: boolean;
  emphasis?: boolean;
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
    finish(await sendGiftPhoto(orderNo, file), "사진을 저장했어요.");
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
    finish(await deleteGiftPhoto(orderNo), "사진을 지웠어요.");
  };

  return (
    <div className={compact ? s.compact : s.photo} role="group" aria-labelledby={`${uid}-title`}>
      <p className={compact ? "sr-only" : s.title} id={`${uid}-title`}>
        내가 올린 사진 <span className={s.only}>· 나만 볼 수 있어요</span>
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
          {busy ? "저장하는 중…" : version ? "사진 바꾸기" : "사진 올리기"}
        </label>
        {version ? (
          <button className="btn btn--text btn--sm" type="button" aria-disabled={busy} onClick={() => void remove()}>
            사진 지우기
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
        {busy ? "저장 중이에요" : done}
      </p>
    </div>
  );
}
