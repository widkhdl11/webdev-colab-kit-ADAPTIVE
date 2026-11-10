"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import m from "./step-dialog.module.css";

// 단계형 모달 틀 — 머리(제목·딸린 버튼·닫기 / 아래 줄 꼬리표) · 진행 표시(막대 + 「1/3 이름」 + 「다음: …」) · 본문(스크롤) · 고정 칸 · 버튼 줄.
// 폭 520, 최대 높이 = 보이는 화면 − 위아래 24, 머리·진행 표시·고정 칸·버튼은 고정이고 본문만 줄어들며 스크롤한다. 768 이하는 화면 전체를 덮는 시트.
// 브라우저 기본 <dialog> 의 모달 모드(showModal)를 써서 초점이 창 안에 머문다. 닫기·Esc·바깥 누름은 닫지 않고 onRequestClose 만 부른다 —
// 입력이 있으면 「입력한 내용을 지울까요?」를 띄울지 부르는 쪽이 정한다. 창이 닫히면 열 때 초점이 있던 요소(또는 returnFocusRef)로 초점을 돌린다.
// 열려 있는 동안 뒤 페이지는 스크롤하지 않는다 — 문서의 overflow 를 막고 사라진 스크롤 막대 폭만큼 오른쪽을 채워 밀림이 없게 한다.
// 스크롤 위치는 건드리지 않으므로 닫으면 원래 자리 그대로다. 창이 둘 겹쳐 열려도(만들기 → 신청 관리) 마지막 창이 닫힐 때 풀린다.

let scrollLocks = 0;
let savedOverflow = "";
let savedPadding = "";

/** 뒤 페이지 스크롤을 막는다. 돌려준 함수를 부르면 푼다(겹쳐 연 창이 모두 닫혀야 풀린다) */
export function lockPageScroll(doc: Document = document): () => void {
  const root = doc.documentElement;
  const body = doc.body;
  if (scrollLocks === 0) {
    const bar = (doc.defaultView?.innerWidth ?? root.clientWidth) - root.clientWidth;
    savedOverflow = root.style.overflow;
    savedPadding = body.style.paddingRight;
    root.style.overflow = "hidden";
    if (bar > 0) body.style.paddingRight = `${bar}px`;
  }
  scrollLocks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    scrollLocks -= 1;
    if (scrollLocks === 0) {
      root.style.overflow = savedOverflow;
      body.style.paddingRight = savedPadding;
    }
  };
}

export type StepProgress = {
  /** 지금 단계(1부터) */
  step: number;
  total: number;
  /** 지금 단계 이름 — 「1/3 이름」 */
  name: string;
  /** 다음에 일어나는 일 — 「다음: 받을 인원」 */
  next: string;
  /** 막대의 접근성 이름 — 「선물함 만들기 진행」 */
  label: string;
};

export function StepDialog({
  open,
  title,
  titleClassName,
  headExtra,
  tags,
  progress,
  bodyLabel,
  fixed,
  footer,
  tall = false,
  busy = false,
  onRequestClose,
  returnFocusRef,
  children,
}: {
  open: boolean;
  title: ReactNode;
  titleClassName?: string;
  /** 제목 줄 오른쪽, 닫기 앞에 놓는 작은 버튼 */
  headExtra?: ReactNode;
  /** 제목 아래 줄(꼬리표) */
  tags?: ReactNode;
  progress?: StepProgress;
  /** 본문이 스크롤 칸일 때 낭독기 이름 — 주면 본문에 키보드 초점이 간다(키보드로 스크롤) */
  bodyLabel?: string;
  /** 본문과 버튼 사이 고정 칸(결과 줄·사실 두 줄) */
  fixed?: ReactNode;
  footer: ReactNode;
  /** 목록이 길어질 수 있는 창 — 높이를 화면 − 위아래 24(최대 780)로 고정해 본문만 스크롤 */
  tall?: boolean;
  /** 보내는 중 — 이 동안 닫기 요청을 받지 않는다 */
  busy?: boolean;
  onRequestClose: () => void;
  /** 닫힌 뒤 초점을 돌릴 곳 — 없으면 열 때 초점이 있던 요소 */
  returnFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);
  const returnRef = useRef(returnFocusRef);
  returnRef.current = returnFocusRef;

  // 열려 있는 동안 뒤 페이지 스크롤을 막는다 — 닫히거나 창이 빠지면 푼다
  useEffect(() => {
    if (!open) return;
    return lockPageScroll(ref.current?.ownerDocument ?? document);
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = dialog.ownerDocument.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== dialog.ownerDocument.body ? active : null;
      dialog.showModal();
    }
    if (!open && dialog.open) {
      dialog.close();
      restore(openerRef, returnRef.current);
    }
  }, [open]);

  // 창이 통째로 빠질 때(부르는 쪽이 조건부로 그림) — 문서에서 빠진 뒤 초점을 돌린다(개발 모드 두 번 실행의 정리는 건너뛴다)
  useEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog && !dialog.isConnected) restore(openerRef, returnRef.current);
    };
  }, []);

  const request = () => {
    if (!busy) onRequestClose();
  };

  return (
    <dialog
      ref={ref}
      className={tall ? `${m.dlg} ${m.tall}` : m.dlg}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Esc 는 닫지 않고 닫기 요청으로 바꾼다
        request();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) request(); // 바깥(덮개) 누름
      }}
    >
      <div className={tags ? `${m.head} ${m.headTags}` : m.head}>
        <h2 id={titleId} className={titleClassName ? `${m.title} ${titleClassName}` : m.title}>
          {title}
        </h2>
        {headExtra}
        <button className={m.x} type="button" aria-label="닫기" onClick={request} aria-disabled={busy || undefined}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        {tags ? <div className={m.tags}>{tags}</div> : null}
      </div>
      {progress ? (
        <div className={m.prog}>
          <div
            className={m.bar}
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={1}
            aria-valuemax={progress.total}
            aria-valuenow={progress.step}
            aria-valuetext={`${progress.total}단계 중 ${progress.step}단계, ${progress.name}`}
          >
            {Array.from({ length: progress.total }, (_, i) => (
              <i key={i} className={i < progress.step ? m.on : undefined} />
            ))}
          </div>
          <p className={m.progT}>
            <b>{`${progress.step}/${progress.total} ${progress.name}`}</b>
            <span>{progress.next}</span>
          </p>
        </div>
      ) : null}
      <div className={m.body} tabIndex={bodyLabel ? 0 : undefined} aria-label={bodyLabel} role={bodyLabel ? "region" : undefined}>
        {children}
      </div>
      {fixed ? <div className={m.fixed}>{fixed}</div> : null}
      <div className={m.foot}>{footer}</div>
    </dialog>
  );
}

/** 작은 확인 창 — 제목 → 본문 → 버튼(8-7). 「입력한 내용을 지울까요?」·「선물함을 취소할까요?」 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  /** 버튼 줄(왼쪽부터) */
  children: ReactNode;
  /** Esc·바깥 누름 — 창을 그대로 두는 쪽(「계속 …」) */
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      role="alertdialog"
      className={m.small}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <h2 id={titleId} className={m.title}>
        {title}
      </h2>
      {description ? (
        <div id={descId} className={m.desc}>
          {description}
        </div>
      ) : null}
      <div className={m.smallFoot}>{children}</div>
    </dialog>
  );
}

function restore(opener: { current: HTMLElement | null }, target: RefObject<HTMLElement | null> | undefined): void {
  const el = target?.current ?? opener.current;
  opener.current = null;
  if (el && el.isConnected) el.focus({ preventScroll: true }); // 닫아도 뒤 페이지 위치는 그대로
}
