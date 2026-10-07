"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TAG_CUSTOM_MAX, type AdminTagOption, type CustomTagCount } from "@/entities/creator/model/creator-tags";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import { charCount } from "@/shared/lib/validation/char-count";
import a from "@/shared/ui/admin.module.css";
import { postTagOptions } from "../api/post-tag-options-client";
import type { TagOptionWrite } from "../model/save-tag-options";

// 운영자 「크리에이터 태그」 — 선택지 관리(creator-tags INV-T1)와 직접 입력한 태그 목록·선택지에 넣기(INV-T5).
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

const nameOk = (s: string) => charCount(s.trim()) >= 1 && charCount(s.trim()) <= TAG_CUSTOM_MAX;
const NAME_LIMIT = `이름은 1~${TAG_CUSTOM_MAX}자로 적어 주세요.`;

/** 선택지 표 — 순서대로. 숨긴 선택지도 보인다(크리에이터가 고른 기록은 남는다, INV-T6). 아래에 추가 양식. */
export function TagOptionsTable({ options, onDone }: { options: readonly AdminTagOption[]; onDone: Done }) {
  const { busy, error, send } = useSend(onDone);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const message = localError ?? error;

  async function rename(e: FormEvent, option: AdminTagOption) {
    e.preventDefault();
    if (!nameOk(draft)) {
      setLocalError(NAME_LIMIT);
      return;
    }
    setLocalError(null);
    if (await send({ kind: "rename", id: option.id, name: draft }, `「${option.name}」을 「${draft.trim()}」(으)로 고쳤어요.`)) setEditingId(null);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!nameOk(newName)) {
      setLocalError(NAME_LIMIT);
      return;
    }
    setLocalError(null);
    if (await send({ kind: "add", name: newName }, `「${newName.trim()}」 선택지를 목록 끝에 더했어요.`)) setNewName("");
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
                      <form onSubmit={(e) => void rename(e, o)} className={a.btnRow} noValidate>
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
                        <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={() => setEditingId(null)}>
                          그만두기
                        </button>
                      </form>
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
                      onClick={() => {
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
      <form className={a.btnRow} onSubmit={(e) => void add(e)} noValidate>
        <div className={a.field} style={{ flex: 1 }}>
          <label htmlFor="tag-option-new">새 선택지 (1~{TAG_CUSTOM_MAX}자, 목록 끝에 붙어요)</label>
          <input
            id="tag-option-new"
            className={a.input}
            placeholder="예: 팬더TV"
            autoComplete="off"
            value={newName}
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

/** 크리에이터가 직접 입력한 태그 — 같은 말끼리 묶은 인원수. 「선택지에 넣기」를 누르면 같은 말을 적은 크리에이터 모두의 태그가 그 선택지로 바뀐다. */
export function CustomTagsTable({ rows, onDone }: { rows: readonly CustomTagCount[]; onDone: Done }) {
  const { busy, error, send } = useSend(onDone);
  return (
    <div className={a.stack} style={{ gap: 16 }}>
      <div className={a.tblWrap}>
        <table className={a.tbl} style={{ minWidth: 520 }}>
          <caption className="sr-only">크리에이터가 직접 입력한 태그 — 공개 화면에는 나오지 않는다</caption>
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
