"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps, type FormEvent, type RefObject } from "react";
import { TAG_CUSTOM_MAX, type AdminTagOption, type BannedWord, type CustomTagCount } from "@/entities/creator/model/creator-tags";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { useFormDraft } from "@/shared/lib/form-draft/use-form-draft";
import { postTagOptions } from "../api/post-tag-options-client";
import type { TagOptionWrite } from "../model/save-tag-options";

// 운영자 「크리에이터 태그」 — 선택지 관리(creator-tags INV-T1)와 직접 입력한 태그 목록·선택지에 넣기(INV-T5)·지우기(INV-T8), 금칙어 목록(INV-T7·T8).
// 처리 결과 문구는 부르는 쪽 알림 칸(onDone)에 띄운다 — 처리한 줄은 다시 읽으면 순서·표가 바뀌기 때문이다.
// 판정(운영자인지·이름 겹침·글자 수)과 크리에이터 바꾸기는 서버·DB 가 한다. 화면은 글자 수만 먼저 센다(DB 와 같은 셈).

type Done = (text: string) => void;

/** 한 번에 하나만 보낸다. 실패하면 문구를 돌려주고, 화면이 낡았으면(409·404) 다시 읽는다. */
function useSend(onDone: Done) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(write: TagOptionWrite, doneText: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const outcome = await postTagOptions(write);
    setBusy(false);
    if (outcome.kind === "failed") {
      setError(outcome.message);
      if (isStaleFailure(outcome)) router.refresh();
      return false;
    }
    onDone(doneText);
    router.refresh();
    return true;
  }
  return { busy, error, send };
}

function ErrorLine({ id, message }: { id: string; message: string | null }) {
  return (
    <div role="status">
      {message && (
        <p className={a.errorLine} id={id}>
          <span className={a.errorMark} aria-hidden="true">
            !
          </span>
          {message}
        </p>
      )}
    </div>
  );
}

// 줄마다 여는 「이름 고치기」 칸 — 열렸을 때만 그려져서 양식과 함께 생기는 부품에서 임시 저장을 붙인다(session-login INV-L20).
// 지금 이름(서버 값)을 기준값으로 남겨, 그사이 이름이 바뀌었으면 옛 입력으로 덮지 않는다. clear 는 칸이 사라진 뒤에도 쓰므로 clearRef 에 남긴다.
type DraftFormProps = Omit<ComponentProps<"form">, "ref"> & { draftKey: string; baseline: string; clearRef: RefObject<(() => void) | null> };

function DraftForm({ draftKey, baseline, clearRef, ...props }: DraftFormProps) {
  const ref = useRef<HTMLFormElement>(null);
  const { clear } = useFormDraft(ref, draftKey, { baseline });
  useEffect(() => {
    clearRef.current = clear;
  }, [clear, clearRef]);
  return <form ref={ref} {...props} />;
}

const nameOk = (s: string) => charCount(s.trim()) >= 1 && charCount(s.trim()) <= TAG_CUSTOM_MAX;
const NAME_LIMIT = `이름은 1~${TAG_CUSTOM_MAX}자로 적어 주세요.`;

/** 선택지 표 — 순서대로. 숨긴 선택지도 보인다(크리에이터가 고른 기록은 남는다, INV-T6). 아래에 추가 양식. */
export function TagOptionsTable({ options, onDone }: { options: readonly AdminTagOption[]; onDone: Done }) {
  const { busy, error, send } = useSend(onDone);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  // 오류 줄이 어느 칸 것인지 — 마지막으로 보낸 양식. 새 선택지 칸의 aria-invalid 에 쓴다
  const [lastForm, setLastForm] = useState<"rename" | "add" | null>(null);
  // 「그만두기」 뒤 포커스를 돌려줄 줄마다의 「이름 고치기」 버튼
  const renameButtons = useRef(new Map<string, HTMLButtonElement>());
  // 새 선택지 칸 임시 저장(session-login INV-L20). 줄마다 여는 이름 고치기 칸은 DraftForm 이 따로 저장한다
  const addFormRef = useRef<HTMLFormElement>(null);
  const { clear: clearAddDraft } = useFormDraft(addFormRef, "admin-tag-option-new");
  const clearRenameDraft = useRef<(() => void) | null>(null);
  const message = localError ?? error;

  async function rename(e: FormEvent, option: AdminTagOption) {
    e.preventDefault();
    setLastForm("rename");
    if (!nameOk(draft)) {
      setLocalError(NAME_LIMIT);
      return;
    }
    setLocalError(null);
    if (await send({ kind: "rename", id: option.id, name: draft }, `「${option.name}」을 「${draft.trim()}」(으)로 고쳤어요.`)) {
      clearRenameDraft.current?.();
      setEditingId(null);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setLastForm("add");
    if (!nameOk(newName)) {
      setLocalError(NAME_LIMIT);
      return;
    }
    setLocalError(null);
    if (await send({ kind: "add", name: newName }, `「${newName.trim()}」 선택지를 목록 끝에 더했어요.`)) {
      clearAddDraft();
      setNewName("");
    }
  }

  return (
    <div className={a.stack} style={{ gap: 16 }}>
      <div className={a.tblWrap}>
        <table className={a.tbl} style={{ minWidth: 760 }}>
          <caption className="sr-only">태그 선택지 — 크리에이터가 고르고 찾기 화면의 칩이 되는 목록, 순서대로</caption>
          <thead>
            <tr>
              <th scope="col">순서</th>
              <th scope="col">이름</th>
              <th scope="col">상태</th>
              <th scope="col">고른 크리에이터</th>
              <th scope="col">
                <span className="sr-only">관리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {options.length === 0 ? (
              <tr>
                <td colSpan={5} className={a.empty}>
                  아직 선택지가 없어요.
                </td>
              </tr>
            ) : (
              options.map((o, i) => (
                <tr key={o.id}>
                  <td className={`${a.mono} ${a.nowrap}`}>{i + 1}</td>
                  <td>
                    {editingId === o.id ? (
                      <DraftForm
                        draftKey={`admin-tag-option-rename:${o.id}`}
                        baseline={o.name}
                        clearRef={clearRenameDraft}
                        onSubmit={(e) => void rename(e, o)}
                        className={a.btnRow}
                        noValidate
                      >
                        <label className="sr-only" htmlFor={`tag-rename-${o.id}`}>
                          {o.name} 새 이름
                        </label>
                        <input
                          id={`tag-rename-${o.id}`}
                          className={a.input}
                          autoComplete="off"
                          value={draft}
                          aria-invalid={localError !== null}
                          aria-describedby={message ? "tag-options-error" : undefined}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            setLocalError(null);
                          }}
                        />
                        <button type="submit" className={`${a.btn} ${a.btnSm}`} aria-disabled={busy}>
                          저장
                        </button>
                        <button
                          type="button"
                          className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                          onClick={() => {
                            clearRenameDraft.current?.(); // [취소]로 버림(INV-L20)
                            setEditingId(null);
                            renameButtons.current.get(o.id)?.focus();
                          }}
                        >
                          그만두기
                        </button>
                      </DraftForm>
                    ) : (
                      <strong>{o.name}</strong>
                    )}
                  </td>
                  <td>{o.hidden ? <span className={`${a.tag} ${a.tagInk}`}>숨김</span> : <span className={a.tag}>보임</span>}</td>
                  <td className={`${a.mono} ${a.nowrap}`}>{o.creatorCount}명</td>
                  <td className={a.act}>
                    <button
                      type="button"
                      className={`${a.btn} ${a.btnSm} ${a.btnSoft}`}
                      aria-label={`${o.name} 위로`}
                      aria-disabled={busy || i === 0}
                      onClick={() => i > 0 && void send({ kind: "move", id: o.id, up: true }, `「${o.name}」을 한 칸 위로 옮겼어요.`)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={`${a.btn} ${a.btnSm} ${a.btnSoft}`}
                      aria-label={`${o.name} 아래로`}
                      aria-disabled={busy || i === options.length - 1}
                      onClick={() => i < options.length - 1 && void send({ kind: "move", id: o.id, up: false }, `「${o.name}」을 한 칸 아래로 옮겼어요.`)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className={`${a.btn} ${a.btnSm} ${a.btnSoft}`}
                      aria-label={`${o.name} 이름 고치기`}
                      ref={(el) => {
                        if (el) renameButtons.current.set(o.id, el);
                        else renameButtons.current.delete(o.id);
                      }}
                      onClick={() => {
                        clearRenameDraft.current?.(); // 다른 줄을 고치러 가면 앞 줄 입력은 버린 것이다(INV-L20)
                        setEditingId(o.id);
                        setDraft(o.name);
                        setLocalError(null);
                      }}
                    >
                      이름 고치기
                    </button>
                    <button
                      type="button"
                      className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                      aria-label={`${o.name} ${o.hidden ? "다시 보이기" : "숨기기"}`}
                      aria-disabled={busy}
                      onClick={() =>
                        void send(
                          { kind: "hide", id: o.id, hidden: !o.hidden },
                          o.hidden ? `「${o.name}」을 다시 보이게 했어요. 골랐던 크리에이터의 태그도 돌아와요.` : `「${o.name}」을 숨겼어요. 고른 기록은 남아요.`,
                        )
                      }
                    >
                      {o.hidden ? "다시 보이기" : "숨기기"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <form ref={addFormRef} className={a.btnRow} onSubmit={(e) => void add(e)} noValidate>
        <div className={a.field} style={{ flex: 1 }}>
          <label htmlFor="tag-option-new">새 선택지 (1~{TAG_CUSTOM_MAX}자, 목록 끝에 붙어요)</label>
          <input
            id="tag-option-new"
            className={a.input}
            placeholder="예: 팬더TV"
            autoComplete="off"
            value={newName}
            aria-invalid={message !== null && lastForm === "add" ? true : undefined}
            aria-describedby={message ? "tag-options-error" : undefined}
            onChange={(e) => {
              setNewName(e.target.value);
              setLocalError(null);
            }}
          />
        </div>
        <button type="submit" className={a.btn} aria-disabled={busy}>
          {busy ? "저장하는 중…" : "추가하기"}
        </button>
      </form>
      <ErrorLine id="tag-options-error" message={message} />
    </div>
  );
}

/**
 * 크리에이터가 직접 입력한 태그 — 같은 말끼리 묶은 인원수. 공개 화면에 선택지 뒤로 보인다(INV-T4).
 * 「선택지에 넣기」를 누르면 같은 말을 적은 크리에이터 모두의 태그가 그 선택지로 바뀐다(INV-T5).
 * 「지우기」는 같은 말을 적은 크리에이터 모두의 직접 입력을 지운다(INV-T8) — 되돌릴 수 없어 그 줄에서 한 번 더 묻는다.
 */
export function CustomTagsTable({ rows, onDone }: { rows: readonly CustomTagCount[]; onDone: Done }) {
  const { busy, error, send } = useSend(onDone);
  const [confirming, setConfirming] = useState<string | null>(null);
  // 묻는 줄이 열리고 닫힐 때 누른 버튼이 사라진다 — 포커스를 바뀐 버튼으로 옮긴다(열리면 「지우기」 확인, 닫히면 원래 「지우기」)
  const deleteButtons = useRef(new Map<string, HTMLButtonElement>());
  const confirmButton = useRef<HTMLButtonElement>(null);
  const lastConfirmed = useRef<string | null>(null);
  useEffect(() => {
    if (confirming !== null) {
      lastConfirmed.current = confirming;
      confirmButton.current?.focus();
    } else if (lastConfirmed.current !== null) {
      deleteButtons.current.get(lastConfirmed.current)?.focus();
      lastConfirmed.current = null;
    }
  }, [confirming]);
  return (
    <div className={a.stack} style={{ gap: 16 }}>
      <div className={a.tblWrap}>
        <table className={a.tbl} style={{ minWidth: 520 }}>
          <caption className="sr-only">크리에이터가 직접 입력한 태그 — 공개 화면에 선택지 뒤로 보인다</caption>
          <thead>
            <tr>
              <th scope="col">적은 말</th>
              <th scope="col">적은 크리에이터</th>
              <th scope="col">
                <span className="sr-only">처리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={a.empty}>
                  직접 입력한 태그가 없어요.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.tag}>
                  <td>
                    <strong>{r.tag}</strong>
                  </td>
                  <td className={`${a.mono} ${a.nowrap}`}>{r.creatorCount}명</td>
                  <td className={a.act}>
                    {confirming === r.tag ? (
                      <span className={a.btnRow}>
                        <span className={a.sub} id={`custom-tag-ask-${r.creatorCount}-${r.tag.length}`}>
                          {r.creatorCount}명의 태그에서 지울까요?
                        </span>
                        <button
                          ref={confirmButton}
                          type="button"
                          className={`${a.btn} ${a.btnSm}`}
                          aria-label={`${r.tag} 정말 지우기`}
                          aria-describedby={`custom-tag-ask-${r.creatorCount}-${r.tag.length}`}
                          aria-disabled={busy}
                          onClick={() =>
                            void send({ kind: "delete_custom", tag: r.tag }, `「${r.tag}」을 적은 크리에이터 ${r.creatorCount}명의 태그에서 지웠어요.`).then(() => setConfirming(null))
                          }
                        >
                          지우기
                        </button>
                        <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={() => setConfirming(null)}>
                          그만두기
                        </button>
                      </span>
                    ) : (
                      <span className={a.btnRow}>
                        <button
                          type="button"
                          className={`${a.btn} ${a.btnSm}`}
                          aria-label={`${r.tag} 선택지에 넣기`}
                          aria-disabled={busy}
                          onClick={() =>
                            void send({ kind: "promote", tag: r.tag }, `「${r.tag}」을 선택지에 넣었어요. 적은 크리에이터 ${r.creatorCount}명의 태그로 공개돼요.`)
                          }
                        >
                          선택지에 넣기
                        </button>
                        <button
                          ref={(el) => {
                            if (el) deleteButtons.current.set(r.tag, el);
                            else deleteButtons.current.delete(r.tag);
                          }}
                          type="button"
                          className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                          aria-label={`${r.tag} 지우기`}
                          aria-disabled={busy}
                          onClick={() => setConfirming(r.tag)}
                        >
                          지우기
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ErrorLine id="custom-tags-error" message={error} />
    </div>
  );
}

/**
 * 금칙어 목록(INV-T7·T8) — 크리에이터가 직접 입력하는 태그와 선택지 이름에 쓸 수 없는 말. 띄어쓰기·기호·영문 대소문자는 무시하고 비교한다.
 * 더하면 이미 저장된 직접 입력도 그때부터 공개 화면에서 빠진다(본인 설정 화면에는 남는다).
 */
/** 금칙어 섹션 제목 id — 부르는 쪽(위젯)이 제목에 붙인다. 「빼기」 뒤 포커스가 돌아갈 곳 */
export const BANNED_TITLE_ID = "h-creator-banned-words";

export function BannedWordsTable({ words, onDone }: { words: readonly BannedWord[]; onDone: Done }) {
  const { busy, error, send } = useSend(onDone);
  const [newWord, setNewWord] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  // 오류 줄이 어느 쪽 것인지 — 입력칸의 aria-invalid 는 더하기에서 난 오류일 때만
  const [lastForm, setLastForm] = useState<"add" | "remove" | null>(null);
  // 새 금칙어 칸 임시 저장(session-login INV-L20)
  const addFormRef = useRef<HTMLFormElement>(null);
  const { clear: clearAddDraft } = useFormDraft(addFormRef, "admin-tag-banned-new");
  const message = localError ?? error;

  async function remove(w: BannedWord) {
    setLastForm("remove");
    // 뺀 말은 목록에서 사라진다 — 포커스를 섹션 제목으로
    if (await send({ kind: "ban_remove", id: w.id }, `「${w.word}」을 금칙어에서 뺐어요.`)) document.getElementById(BANNED_TITLE_ID)?.focus();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setLastForm("add");
    if (!nameOk(newWord)) {
      setLocalError(`금칙어는 1~${TAG_CUSTOM_MAX}자로 적어 주세요.`);
      return;
    }
    setLocalError(null);
    if (await send({ kind: "ban_add", word: newWord }, `「${newWord.trim()}」을 금칙어에 더했어요.`)) {
      clearAddDraft();
      setNewWord("");
    }
  }

  return (
    <div className={a.stack} style={{ gap: 16 }}>
      {/* 말이 짧고 수십 개라 표 대신 한 줄에 흘려 보인다 — 말마다 「빼기」 */}
      {words.length === 0 ? (
        <p className={a.empty}>금칙어가 없어요.</p>
      ) : (
        <ul className={a.btnRow} aria-label="태그 금칙어 — 직접 입력과 선택지 이름에 쓸 수 없는 말" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {words.map((w) => (
            <li key={w.id} className={a.btnRow} style={{ gap: 4 }}>
              <span className={a.tag}>{w.word}</span>
              <button
                type="button"
                className={`${a.btn} ${a.btnSm} ${a.btnLine}`}
                aria-label={`${w.word} 금칙어에서 빼기`}
                aria-disabled={busy}
                onClick={() => void remove(w)}
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}
      <form ref={addFormRef} className={a.btnRow} onSubmit={(e) => void add(e)} noValidate>
        <div className={a.field} style={{ flex: 1 }}>
          <label htmlFor="tag-banned-new">새 금칙어 (1~{TAG_CUSTOM_MAX}자)</label>
          <input
            id="tag-banned-new"
            className={a.input}
            autoComplete="off"
            value={newWord}
            aria-invalid={message !== null && lastForm === "add" ? true : undefined}
            aria-describedby={message ? "tag-banned-error" : undefined}
            onChange={(e) => {
              setNewWord(e.target.value);
              setLocalError(null);
            }}
          />
        </div>
        <button type="submit" className={a.btn} aria-disabled={busy}>
          {busy ? "저장하는 중…" : "더하기"}
        </button>
      </form>
      <ErrorLine id="tag-banned-error" message={message} />
    </div>
  );
}
