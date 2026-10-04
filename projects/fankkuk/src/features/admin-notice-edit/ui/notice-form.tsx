"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postNotice } from "../api/post-notice-client";
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from "../model/save-notice";

// 공지 쓰기·고치기 양식 (admin-console INV-K11, 시안 admin/notices.html 의 오른쪽 카드. 미리보기는 뺐다).
// 본문은 글자로만 보낸다 — 빈 줄로 문단을 나눈다. 고칠 때는 원래 글의 소제목·링크 꾸밈이 글자로만 남는다.
// 글자 수는 DB 와 같은 기준(charCount)으로 센다. 입력칸 maxLength 는 다른 기준(UTF-16)이라 두지 않는다.
// 부르는 쪽은 editing 이 바뀔 때 key 를 바꿔 칸을 새로 채운다.

export type NoticeDraft = { slug: string; title: string; body: string; pinned: boolean };

/** onSubmitStart: 제출을 시작할 때 — 지난 성공 문구를 지우게. onSaved: 저장이 끝나면 알릴 문구 */
type Props = { editing: NoticeDraft | null; onStopEditing: () => void; onSubmitStart: () => void; onSaved: (text: string) => void };

export function NoticeForm({ editing, onStopEditing, onSubmitStart, onSaved }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [pinned, setPinned] = useState(editing?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const titleCount = charCount(title.trim());
  // 본문은 DB 처럼 앞뒤를 다듬기 전 글자 수로 센다
  const bodyCount = charCount(body);
  const titleBad = titleCount > NOTICE_TITLE_MAX || (message !== null && titleCount < 1);
  const bodyBad = bodyCount > NOTICE_BODY_MAX || (message !== null && body.trim() === "");
  const valid = titleCount >= 1 && titleCount <= NOTICE_TITLE_MAX && body.trim() !== "" && bodyCount <= NOTICE_BODY_MAX;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmitStart();
    if (!valid) {
      setMessage(`제목은 1~${NOTICE_TITLE_MAX}자, 본문은 ${NOTICE_BODY_MAX}자까지 적을 수 있어요. 본문은 비울 수 없어요.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    const outcome = await postNotice({ slug: editing?.slug ?? null, title, body, pinned });
    setBusy(false);
    if (outcome.kind === "failed") {
      setMessage(outcome.message);
      if (isStaleFailure(outcome)) router.refresh();
      return;
    }
    setTitle("");
    setBody("");
    setPinned(false);
    onSaved(editing ? "고친 공지를 올렸어요." : "공지를 올렸어요.");
    router.refresh(); // 목록을 다시 읽는다
    if (editing) onStopEditing();
  }

  const errorRef = message ? " notice-form-error" : "";

  return (
    <form className={a.stack} style={{ gap: 12 }} onSubmit={submit} noValidate>
      {editing && (
        <p className={a.hint}>고쳐서 올리면 본문이 빈 줄로 나눈 문단 글로 저장돼요. 원래 글의 소제목·링크 꾸밈은 사라지고 글자만 남아요.</p>
      )}
      <div className={a.field}>
        <label htmlFor="notice-title">제목 (1~{NOTICE_TITLE_MAX}자)</label>
        <input
          id="notice-title"
          className={a.input}
          placeholder="제목을 적어 주세요"
          autoComplete="off"
          aria-describedby={`notice-title-count${errorRef}`}
          aria-invalid={titleBad}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.count} id="notice-title-count">
          {titleCount} / {NOTICE_TITLE_MAX}
        </span>
      </div>
      <div className={a.field}>
        <label htmlFor="notice-body">본문</label>
        <textarea
          id="notice-body"
          className={`${a.textarea} ${a.textareaTall}`}
          placeholder="팬과 크리에이터가 읽는 글이에요. 쉬운 말로 적어 주세요. 빈 줄로 문단을 나눠요."
          aria-describedby={`notice-body-count${errorRef}`}
          aria-invalid={bodyBad}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.count} id="notice-body-count">
          {bodyCount} / {NOTICE_BODY_MAX}
        </span>
      </div>
      <label className={a.check}>
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> 맨 위에 고정하기
      </label>
      <div role="status">
        {message && (
          <p className={a.errorLine} id="notice-form-error">
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {message}
          </p>
        )}
      </div>
      <div className={a.btnRow}>
        <button type="submit" className={a.btn} aria-disabled={!valid || busy}>
          {busy ? "올리는 중…" : "올리기"}
        </button>
        {editing && (
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={onStopEditing} aria-disabled={busy}>
            고치기 그만두기
          </button>
        )}
      </div>
    </form>
  );
}
