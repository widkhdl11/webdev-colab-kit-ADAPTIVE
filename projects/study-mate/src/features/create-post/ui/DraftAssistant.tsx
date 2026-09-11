"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/shared/ui/button/Button";
import { FormError } from "@/shared/ui/field/Field";
import type { PostDraft } from "../model/draft";
import { draftPostAction } from "../api/draft-post";
import styles from "./draft-assistant.module.css";

/**
 * 모집글 초안 도우미 (INV-G9).
 *
 * **초안은 「적용」을 누르기 전까지 폼의 값이 아니다.** 여기서 그리는 것은 미리보기이고,
 * 적용해야 폼의 상태가 바뀐다. 적용한 뒤에도 사용자가 고칠 수 있고, 저장되는 것은 폼의
 * 값이지 모델의 출력이 아니다 — 사용자가 안 읽은 문장이 사용자 이름으로 발행되면 안 된다.
 *
 * 모델의 출력은 언제나 텍스트로 그린다. 문자열을 마크업으로 밀어 넣는 코드는 이 레포에서
 * 편집하는 순간 차단되고, React 의 기본 렌더가 텍스트다.
 */
export function DraftAssistant({
  studyId,
  onApply,
}: {
  /** 폼에서 고른 스터디. 안 골랐으면 빈 문자열 */
  studyId: string;
  /** 적용한 뒤 초점을 옮길 곳을 부르는 쪽이 정한다 — 여기서는 폼 칸을 모른다 */
  onApply: (draft: PostDraft) => void;
}) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<PostDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const request = () => {
    setError(null);
    setDraft(null);
    start(async () => {
      const result = await draftPostAction(studyId);
      if (result.ok) {
        setDraft(result.value);
        // **초점을 결과로 옮긴다.** 누른 버튼이 대기 중에 잠기면 브라우저가 초점을 떨군다 —
        // 화면을 보면서 키보드만 쓰는 사용자는 Tab 을 문서 처음부터 다시 돌리게 된다.
        queueMicrotask(() => previewRef.current?.focus());
      } else {
        setError(result.message);
        queueMicrotask(() => requestRef.current?.focus());
      }
    });
  };

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <div>
          <p className={styles.title}>초안이 필요하세요?</p>
          <p className={styles.sub}>
            고른 스터디의 내용만 보고 제목·한 줄 소개·내용의 초안을 만들어 드립니다. 넣기
            전에 먼저 보여 드리고, 넣은 뒤에도 고칠 수 있습니다.
          </p>
        </div>
        <Button
          ref={requestRef}
          type="button"
          onClick={request}
          disabled={studyId === "" || pending}
        >
          {pending ? "만드는 중…" : "초안 만들기"}
        </Button>
      </div>

      {studyId === "" ? <p className={styles.hint}>먼저 위에서 스터디를 골라 주세요.</p> : null}

      {/* **오류는 `role="alert"` 로 간다** — 사용자가 한 행동이 실패한 것이라 끼어들어야 한다.
          아래 살아 있는 영역 **밖**에 둔다. 안에 두면 두 번 읽힌다 */}
      {error !== null ? <FormError message={error} /> : null}

      {/* 살아 있는 영역에는 **짧은 한 줄만** 둔다. 미리보기 전체를 감싸면 초안이 도착할 때
          내용 4000자가 통째로 읽힌다 — 이 앱의 다른 살아 있는 영역도 한 문장씩만 진다 */}
      <p className="sr-only" role="status">
        {draft !== null ? "초안이 준비됐습니다. 아직 폼에 안 들어갔습니다." : ""}
      </p>

      {draft !== null ? (
        <div className={styles.preview} ref={previewRef} tabIndex={-1}>
          <p className={styles.previewNote}>
            아직 폼에 안 들어갔습니다. 아래를 읽어 보고 「적용」을 누르면 채워집니다.
          </p>
          <dl className={styles.fields}>
            <dt>제목</dt>
            <dd>{draft.title === "" ? "—" : draft.title}</dd>
            <dt>한 줄 소개</dt>
            <dd>{draft.summary === "" ? "—" : draft.summary}</dd>
            <dt>내용</dt>
            <dd className={styles.content}>{draft.content === "" ? "—" : draft.content}</dd>
          </dl>
          <div className={styles.actions}>
            {/* **잉크 톤을 안 쓴다.** 같은 카드 안에 「모집글 올리기」가 이미 잉크이고,
                승인된 기준은 한 패널에 잉크 버튼 하나다. 이 화면에서 해야 할 일은
                모집글을 올리는 것이라 그쪽이 잉크로 남는다 */}
            <Button
              type="button"
              onClick={() => {
                onApply(draft);
                setDraft(null);
              }}
            >
              적용
            </Button>
            <Button
              type="button"
              onClick={() => {
                setDraft(null);
                requestRef.current?.focus();
              }}
            >
              버리기
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
