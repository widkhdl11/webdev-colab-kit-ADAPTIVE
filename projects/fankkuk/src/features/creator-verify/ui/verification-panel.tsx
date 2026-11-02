"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CHANNEL_PLATFORM_LABEL, CHANNEL_URL_EXAMPLES, CHANNEL_URL_MESSAGE, parseChannelUrl } from "@/entities/creator/model/channel-url";
import {
  canLoginCheck,
  myVerificationPanel,
  panelOutcomeText,
  platformLabel,
  VERIFICATION_STATUS_LABEL,
  type MyVerification,
  type MyVerificationState,
} from "@/entities/creator/model/creator-verification";
import { giftLinkText } from "@/entities/creator/model/gift-link-match";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { sendVerification } from "../api/send-verification";
import type { VerificationAction } from "../model/run-verification-action";
import s from "./verification-panel.module.css";

// 크리에이터 「채널 소유자 확인」 칸 (creator-verification INV-V4·V9·V12·V14·V15·V17·V20). 주소와 설정 화면·가입 4단계에 들어간다.
// 2026-11-02 팬꾹 링크 게시 확인으로 바뀌어 인증 코드·코드 다시 받기·자동 확인을 뺐다 — 타입과 서버 동작에 맞춘 최소 수정이다.
// 새 화면(① 팬꾹 링크 만들기·올리기 → ② 채널 주소, 요청 완료, 재확인 유예 안내)은 시안 승인 뒤 만든다(UX 명세 signup.md 「2026-11-02 채널 확인」).
// 화면이 정하는 것은 「무엇을 보여 주고 어느 버튼을 열어 둘지」뿐이다. 거부·허용은 서버와 DB 가 다시 판정하고, 처리 뒤에는 화면을 다시 읽는다.

type Sheet = { kind: "withdraw" } | null;
type Note = { tone: "ok" | "error"; text: string } | null;

export function VerificationPanel({
  state,
  rows,
  apiPlatforms,
}: {
  state: MyVerificationState;
  rows: readonly MyVerification[];
  /** 플랫폼 로그인 확인을 받는 플랫폼(DB 의 표 — 지금은 치지직) */
  apiPlatforms: readonly string[];
}) {
  const router = useRouter();
  const ids = useId();
  const loginSet = new Set(apiPlatforms);
  const panel = myVerificationPanel(state, rows);
  const live = panel.live;
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [sheet, setSheet] = useState<Sheet>(null);

  const parsed = url.trim() === "" ? null : parseChannelUrl(url.trim());
  // INV-V14·V10(d32): 로그인 확인 버튼은 그 플랫폼이 받고 운영자 확인만이 아닐 때만
  const showLogin = parsed?.ok ? canLoginCheck(parsed.channel.platform, loginSet, state) : false;
  const outcome = panelOutcomeText(state, panel.last);

  async function run(action: VerificationAction, after?: (body: Record<string, unknown>) => Note) {
    if (busy) return;
    setBusy(true);
    setNote(null);
    const r = await sendVerification(action);
    setBusy(false);
    if (r.kind === "failed") {
      if (r.status === 401) {
        router.push("/login");
        return;
      }
      setNote({ tone: "error", text: r.message });
      // 다른 처리가 먼저 끝났거나(409·404) DB 는 처리했는데 응답만 실패했을 수 있다 — 지금 상태를 다시 읽는다
      router.refresh();
      return;
    }
    setSheet(null);
    const next = after ? after(r.body) : null;
    setNote(next);
    if (next === null || next.tone === "ok") setUrl("");
    router.refresh();
  }

  const tag = state.verified ? (
    live ? (
      <span className="tag">채널 변경 확인 중</span>
    ) : (
      <span className={statusTagClass("success")}>확인 완료</span>
    )
  ) : live ? (
    <span className="tag">{VERIFICATION_STATUS_LABEL[live.status]}</span>
  ) : (
    <span className="tag">확인 전</span>
  );

  const noteLine = note ? (
    note.tone === "ok" ? (
      <p className={s.ok}>{note.text}</p>
    ) : (
      <p className={s.msg}>
        <span className={s["msg-mark"]} aria-hidden="true">
          !
        </span>
        {note.text}
      </p>
    )
  ) : null;
  // 확인 창이 열려 있으면 결과 문구는 창 안에만 둔다(같은 문구를 두 번 읽지 않게)
  const mainNote = sheet ? null : noteLine;

  return (
    <section aria-labelledby={`${ids}-h`}>
      <div className={s.head}>
        <h2 id={`${ids}-h`}>채널 소유자 확인</h2>
        {tag}
      </div>

      {state.verified && state.channelUrl ? (
        <div className={`${s.done} ${s.lead}`}>
          <strong>
            {state.platform ? platformLabel(state.platform) : "채널"} 채널 소유자로 확인되었습니다
            {state.verifiedAt ? ` · ${formatDate(state.verifiedAt)}` : ""}
          </strong>
          <a href={state.channelUrl} target="_blank" rel="noopener noreferrer">
            {state.channelUrl}
          </a>
        </div>
      ) : null}

      {outcome ? <p className={s.outcome}>{outcome}</p> : null}

      {live ? (
        <>
          <div className={s.box}>
            <div className={s["box-top"]}>
              <span className="tag">{platformLabel(live.platform)}</span>
              <span className={s.channel}>{live.channelUrl}</span>
            </div>
            <p>운영자가 채널을 열어 팬꾹 링크를 확인하고 있습니다. 완료되면 이 화면에 결과가 표시됩니다.</p>
            <div className={s.facts}>
              {live.linkHandle ? <span className="sub">찾을 링크: {giftLinkText(live.linkHandle)}</span> : null}
            </div>
          </div>

          <div role="status" className={s.steps}>
            {mainNote}
          </div>

          <div className={s.side}>
            {live ? (
              <button className="btn btn--text btn--sm" type="button" onClick={() => {
                  setNote(null);
                  setSheet({ kind: "withdraw" });
                }}>
                요청 취소
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className={`sub ${s.lead}`}>
            {panel.mode === "move"
              ? "채널 변경에는 새 채널의 소유자 확인이 필요합니다. 확인 중에는 기존 채널로 표시되며 새 선물을 받을 수 없습니다."
              : "채널 소유자 확인을 마치면 ‘크리에이터 찾기’에 표시됩니다."}
          </p>
          <div className="field">
            <label htmlFor={`${ids}-url`}>{panel.mode === "move" ? "새 채널 주소" : "채널 주소"}</label>
            <input
              className="input"
              id={`${ids}-url`}
              inputMode="url"
              autoComplete="url"
              placeholder="https://www.youtube.com/@핸들"
              value={url}
              aria-describedby={`${ids}-url-hint`}
              aria-invalid={parsed !== null && !parsed.ok}
              onChange={(e) => {
                setUrl(e.target.value);
                setNote(null);
              }}
            />
            <div id={`${ids}-url-hint`}>
              {parsed === null ? (
                <ul className={s.examples}>
                  {CHANNEL_URL_EXAMPLES.map((x) => (
                    <li key={x.example}>
                      {CHANNEL_PLATFORM_LABEL[x.platform]} <code>{x.example}</code>
                    </li>
                  ))}
                </ul>
              ) : parsed.ok ? (
                <p className={s.preview}>
                  {CHANNEL_PLATFORM_LABEL[parsed.channel.platform]} · {parsed.channel.channelUrl}
                </p>
              ) : (
                <p className={`${s.msg} ${s.preview}`}>
                  <span className={s["msg-mark"]} aria-hidden="true">
                    !
                  </span>
                  {CHANNEL_URL_MESSAGE[parsed.reason]}
                </p>
              )}
            </div>
          </div>

          {parsed?.ok ? (
            <div className={s.steps}>
              {state.handle === null ? (
                <p className="sub">팬꾹 링크를 먼저 만들어 주세요. 상세 설정의 링크 주소에서 만들 수 있습니다.</p>
              ) : (
                <p className="sub">팬이 선물을 보낼 수 있게 팬꾹 링크({giftLinkText(state.handle)})를 채널 소개에 올려 주세요. 올라와 있으면 채널 확인도 같이 끝나요.</p>
              )}
              <button
                className={`btn ${s["btn-wide"]}`}
                type="button"
                aria-disabled={busy || state.handle === null}
                onClick={() => (state.handle === null ? undefined : void run({ action: "request", channelUrl: parsed.channel.channelUrl }))}
              >
                {busy ? "요청 중…" : "채널 확인 요청"}
              </button>
              {showLogin ? (
                <button className="btn btn--line" type="button" aria-disabled={busy} onClick={() => void run({ action: "login", channelUrl: parsed.channel.channelUrl }, () => null)}>
                  {CHANNEL_PLATFORM_LABEL[parsed.channel.platform]}로 바로 확인
                </button>
              ) : null}
            </div>
          ) : null}
          <div role="status" className={s.steps}>
            {mainNote}
          </div>
        </>
      )}

      <BottomSheet open={sheet !== null} title="확인 요청을 취소할까요?" onClose={() => setSheet(null)}>
        <p>취소한 요청은 복구할 수 없으며 요청 횟수에 포함됩니다. 취소 후에는 다른 사람도 이 채널의 소유자 확인을 요청할 수 있습니다.</p>
        <div role="status">{sheet ? noteLine : null}</div>
        <div className={s["sheet-btns"]}>
          <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
            돌아가기
          </button>
          <button
            className="btn"
            type="button"
            aria-disabled={busy}
            onClick={() => (live ? void run({ action: "withdraw", applicationId: live.id }) : setSheet(null))}
          >
            {busy ? "처리 중…" : "요청 취소"}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
