"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { PROHIBITED_DESCRIPTION_MAX, PROHIBITED_NAME_MAX } from "@/entities/parcel/model/prohibited-item";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postProhibited } from "../api/post-prohibited-client";

// 금지 물품 추가·고치기 양식 (admin-console INV-K9, 시안 admin/prohibited.html 의 오른쪽 카드).
// editing 이 있으면 그 항목을 고치고, 없으면 새로 추가한다. 글자 수는 DB 와 같은 기준(charCount)으로 화면이 먼저 세고
// 서버·DB 가 다시 본다 — 입력칸 maxLength 는 다른 기준(UTF-16)으로 잘라 버리므로 두지 않는다.
// 부르는 쪽은 editing 이 바뀔 때 key 를 바꿔 칸을 새로 채운다.

export type ProhibitedDraft = { id: string; name: string; description: string };

/** onSubmitStart: 제출을 시작할 때 — 지난 성공 문구를 지우게. onSaved: 저장이 끝나면 알릴 문구(양식이 새로 그려져도 남게 부르는 쪽이 보여 준다) */
type Props = { editing: ProhibitedDraft | null; onStopEditing: () => void; onSubmitStart: () => void; onSaved: (text: string) => void };

export function ProhibitedForm({ editing, onStopEditing, onSubmitStart, onSaved }: Props) {
  const router = useRouter();
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // 쓰던 내용 임시 저장(session-login INV-L20) — 새 항목과 고치는 항목마다 따로
  const formRef = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(formRef, `admin-prohibited-form:${editing?.id ?? "new"}`, { baseline: editing ? JSON.stringify(editing) : undefined });

  const nameCount = charCount(name.trim());
  const descriptionCount = charCount(description.trim());
  const nameBad = nameCount > PROHIBITED_NAME_MAX || (message !== null && nameCount < 1);
  const descriptionBad = descriptionCount > PROHIBITED_DESCRIPTION_MAX;
  const valid = nameCount >= 1 && nameCount <= PROHIBITED_NAME_MAX && descriptionCount <= PROHIBITED_DESCRIPTION_MAX;
  const canSave = valid && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    onSubmitStart();
    if (!valid) {
      setMessage(`이름은 1~${PROHIBITED_NAME_MAX}자, 설명은 ${PROHIBITED_DESCRIPTION_MAX}자까지 적을 수 있어요.`);
      return;
    }
    setBusy(true);
    setMessage(null);
    const outcome = editing ? await postProhibited({ kind: "edit", id: editing.id, name, description }) : await postProhibited({ kind: "add", name, description });
    setBusy(false);
    if (outcome.kind === "failed") {
      setMessage(outcome.message);
      if (isStaleFailure(outcome)) router.refresh(); // 다른 사람이 먼저 지웠으면 목록을 다시 읽는다
      return;
    }
    clear();
    setName("");
    setDescription("");
    onSaved(editing ? `「${name.trim()}」 항목을 고쳤어요.` : `「${name.trim()}」 항목을 추가했어요.`);
    router.refresh(); // 목록과 바뀐 기록을 다시 읽는다
    if (editing) onStopEditing();
  }

  return (
    <form ref={formRef} className={a.stack} style={{ gap: 12 }} onSubmit={submit} noValidate>
      <div className={a.field}>
        <label htmlFor="prohibited-name">이름 (1~{PROHIBITED_NAME_MAX}자)</label>
        <input
          id="prohibited-name"
          className={a.input}
          placeholder="예: 인화성 물질"
          autoComplete="off"
          aria-describedby={message ? "prohibited-name-count prohibited-form-error" : "prohibited-name-count"}
          aria-invalid={nameBad}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.count} id="prohibited-name-count">
          {nameCount} / {PROHIBITED_NAME_MAX}
        </span>
      </div>
      <div className={a.field}>
        <label htmlFor="prohibited-description">설명 (0~{PROHIBITED_DESCRIPTION_MAX}자)</label>
        <textarea
          id="prohibited-description"
          className={a.textarea}
          placeholder="왜 보낼 수 없는지, 대신 할 수 있는 것을 적어 주세요."
          aria-describedby="prohibited-description-count"
          aria-invalid={descriptionBad}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            setMessage(null);
          }}
        />
        <span className={a.count} id="prohibited-description-count">
          {descriptionCount} / {PROHIBITED_DESCRIPTION_MAX}
        </span>
      </div>
      <div role="status">
        {message && (
          <p className={a.errorLine} id="prohibited-form-error">
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {message}
          </p>
        )}
      </div>
      <div className={a.btnRow}>
        <button type="submit" className={a.btn} aria-disabled={!canSave}>
          {busy ? "저장하는 중…" : editing ? "고친 내용 저장" : "추가하기"}
        </button>
        {editing && (
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={() => {
              clear(); // [취소]로 버림(INV-L20)
              onStopEditing();
            }} aria-disabled={busy}>
            고치기 그만두기
          </button>
        )}
      </div>
    </form>
  );
}
