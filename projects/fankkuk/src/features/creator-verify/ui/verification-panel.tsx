"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CHANNEL_PLATFORM_LABEL, CHANNEL_URL_EXAMPLES, CHANNEL_URL_MESSAGE, parseChannelUrl } from "@/entities/creator/model/channel-url";
import {
  attemptNumber,
  lastOutcomeText,
  myVerificationPanel,
  platformLabel,
  verifyRoutes,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_TRIES,
  type MyVerification,
  type MyVerificationState,
} from "@/entities/creator/model/creator-verification";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { sendVerification } from "../api/send-verification";
import type { VerificationAction } from "../model/run-verification-action";
import s from "./verification-panel.module.css";

// 크리에이터 「채널 본인 확인」 칸 (creator-verification INV-V1·V4·V5·V9·V12·V14·V15·V16). 주소와 설정 화면에 들어간다.
// 확인 길은 플랫폼의 「API 확인」으로 갈린다(INV-V2 표):
// - 있음(유튜브·치지직·인스타그램): 「○○로 확인하기」(플랫폼 로그인)가 먼저, 그 아래 「코드로 확인하기」 → 코드를 소개란에 붙이고 「확인」(자동 확인),
//   그래도 안 되면 「운영자에게 확인 요청」.
// - 없음(SOOP): 코드를 소개란에 붙이거나 팬꾹 공식 계정 DM 으로 보내고 「확인 요청」.
// 공개 게시물로 올리라는 안내는 하지 않는다 — 팔로워가 모두 보기 때문이다.
// 화면이 정하는 것은 「무엇을 보여 주고 어느 버튼을 열어 둘지」뿐이다. 거부·허용은 서버와 DB 가 다시 판정하고, 처리 뒤에는 화면을 다시 읽는다.

type Sheet = { kind: "regenerate" } | { kind: "withdraw" } | null;
type Note = { tone: "ok" | "error"; text: string } | null;

export function VerificationPanel({
  state,
  rows,
  apiPlatforms,
}: {
  state: MyVerificationState;
  rows: readonly MyVerification[];
  /** 「API 확인」이 있는 플랫폼(DB 의 표) */
  apiPlatforms: readonly string[];
}) {
  const router = useRouter();
  const ids = useId();
  const apiSet = new Set(apiPlatforms);
  const panel = myVerificationPanel(state, rows, apiSet);
  const live = panel.live;
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [copied, setCopied] = useState(false);

  const parsed = url.trim() === "" ? null : parseChannelUrl(url.trim());
  const routes = parsed?.ok ? verifyRoutes(parsed.channel.platform, apiSet) : [];
  const outcome = panel.last ? lastOutcomeText(panel.last) : null;

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
      // 다른 처리가 먼저 끝났으면(409·404) 지금 상태를 다시 읽는다
      if (r.status === 409 || r.status === 404) router.refresh();
      return;
    }
    setSheet(null);
    const next = after ? after(r.body) : null;
    setNote(next);
    if (next === null || next.tone === "ok") setUrl("");
    router.refresh();
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const tag = state.verified ? (
    live ? (
      <span className="tag">이사 확인 중</span>
    ) : (
      <span className="tag tag--brand">확인 완료</span>
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
        <h3 id={`${ids}-h`}>채널 본인 확인</h3>
        {tag}
      </div>

      {state.verified && state.channelUrl ? (
        <div className={`${s.done} ${s.lead}`}>
          <strong>
            {state.platform ? platformLabel(state.platform) : "채널"} 채널 주인으로 확인됐어요
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
            {live.status === "issued" && live.code ? (
              <>
                <div>
                  <p className={s["code-label"]} id={`${ids}-code`}>
                    인증 코드
                  </p>
                  <div className={s["code-row"]}>
                    <span className={s.code} aria-labelledby={`${ids}-code`}>
                      {live.code}
                    </span>
                    <button className="btn btn--soft btn--sm" type="button" onClick={() => void copyCode(live.code ?? "")}>
                      코드 복사
                    </button>
                    <span className="sub" role="status">
                      {copied ? "복사했어요" : ""}
                    </span>
                  </div>
                </div>
                <div className={s.facts}>
                  {live.postDeadline ? (
                    <span className="sub">
                      {formatDateTime(live.postDeadline)}까지 {panel.canAutoCheck ? "확인을 마쳐 주세요" : "확인 요청을 보내 주세요"}
                    </span>
                  ) : null}
                  <span className="sub">
                    이 채널로 {VERIFICATION_TRIES}번 가운데 {attemptNumber(live.remainingCount)}번째 신청
                  </span>
                </div>
              </>
            ) : (
              <p>운영자가 채널을 열어 코드를 확인하고 있어요. 결과는 여기에 보여요.</p>
            )}
          </div>

          {live.status === "issued" ? (
            panel.canAutoCheck ? (
              <div className={s.steps}>
                <p>채널 소개란에 코드를 잠깐 붙이고 「확인」을 눌러 주세요. 확인되면 바로 지워도 돼요.</p>
                {live.platform === "instagram" ? <p className="sub">인스타그램은 프로페셔널 계정만 자동으로 확인돼요. 개인 계정이면 아래 「운영자에게 확인 요청」을 써 주세요.</p> : null}
                <button
                  className={`btn ${s["btn-wide"]}`}
                  type="button"
                  aria-disabled={busy}
                  onClick={() =>
                    void run({ action: "auto_check", applicationId: live.id }, (body) =>
                      body.result === "approved"
                        ? { tone: "ok", text: "확인됐어요. 소개란의 코드는 지워도 돼요." }
                        : { tone: "error", text: typeof body.message === "string" ? body.message : "아직 소개란에서 코드를 찾지 못했어요." },
                    )
                  }
                >
                  {busy ? "확인하는 중…" : "확인"}
                </button>
                <div role="status">{mainNote}</div>
                <div className={s.or}>
                  <p className="sub">그래도 확인이 안 되면 코드를 소개란에 둔 채로 운영자에게 맡겨 주세요. 운영자 확인에는 기한이 없어요.</p>
                  <button
                    className="btn btn--line"
                    type="button"
                    aria-disabled={busy}
                    onClick={() => void run({ action: "post", applicationId: live.id }, () => ({ tone: "ok", text: "운영자에게 확인을 요청했어요." }))}
                  >
                    운영자에게 확인 요청
                  </button>
                </div>
              </div>
            ) : (
              <div className={s.steps}>
                <p>코드를 채널 소개란에 잠깐 붙이거나 팬꾹 공식 계정으로 DM 을 보낸 뒤 「확인 요청」을 눌러 주세요. 운영자가 확인하면 지워도 돼요.</p>
                <button
                  className={`btn ${s["btn-wide"]}`}
                  type="button"
                  aria-disabled={busy}
                  onClick={() => void run({ action: "post", applicationId: live.id }, () => ({ tone: "ok", text: "운영자에게 확인을 요청했어요." }))}
                >
                  {busy ? "요청하는 중…" : "확인 요청"}
                </button>
                <div role="status">{mainNote}</div>
              </div>
            )
          ) : (
            <div role="status" className={s.steps}>
              {mainNote}
            </div>
          )}

          <div className={s.side}>
            {panel.canRegenerate ? (
              <button className="btn btn--soft btn--sm" type="button" onClick={() => {
                  setNote(null);
                  setSheet({ kind: "regenerate" });
                }}>
                코드 다시 받기
              </button>
            ) : null}
            {panel.canWithdraw ? (
              <button className="btn btn--text btn--sm" type="button" onClick={() => {
                  setNote(null);
                  setSheet({ kind: "withdraw" });
                }}>
                신청 거두기
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className={`sub ${s.lead}`}>
            {panel.mode === "move"
              ? "다른 채널로 옮기려면 새 채널로 확인을 받아요. 확인이 끝날 때까지 찾기에는 지금 채널로 나오지만, 새 선물은 받지 않아요."
              : "채널 주인으로 확인되면 크리에이터 찾기에 나오고 팬의 선물을 받을 수 있어요."}
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
              {routes.includes("login") ? (
                <>
                  <button
                    className={`btn ${s["btn-wide"]}`}
                    type="button"
                    aria-disabled={busy}
                    onClick={() =>
                      void run({ action: "login", channelUrl: parsed.channel.channelUrl }, () => ({ tone: "ok", text: "채널 주인으로 확인됐어요." }))
                    }
                  >
                    {CHANNEL_PLATFORM_LABEL[parsed.channel.platform]}로 확인하기
                  </button>
                  {parsed.channel.platform === "instagram" ? (
                    <p className="sub">인스타그램은 프로페셔널 계정만 로그인으로 확인돼요. 개인 계정이면 아래 「코드로 확인하기」를 써 주세요.</p>
                  ) : null}
                  <div className={s.or}>
                    <p className="sub">로그인이 어렵다면 코드를 받아 채널 소개란에 잠깐 붙여 확인할 수 있어요.</p>
                    <button
                      className="btn btn--line"
                      type="button"
                      aria-disabled={busy}
                      onClick={() => void run({ action: "request", channelUrl: parsed.channel.channelUrl })}
                    >
                      코드로 확인하기
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="sub">이 플랫폼은 로그인 확인이 없어 운영자가 확인해요. 코드를 받아 소개란에 붙이거나 팬꾹 공식 계정 DM 으로 보내 주세요.</p>
                  <button
                    className={`btn ${s["btn-wide"]}`}
                    type="button"
                    aria-disabled={busy}
                    onClick={() => void run({ action: "request", channelUrl: parsed.channel.channelUrl })}
                  >
                    코드 받기
                  </button>
                </>
              )}
            </div>
          ) : null}
          <div role="status" className={s.steps}>
            {mainNote}
          </div>
        </>
      )}

      <BottomSheet open={sheet !== null} title={sheet?.kind === "regenerate" ? "코드를 다시 받을까요?" : "신청을 거둘까요?"} onClose={() => setSheet(null)}>
        {sheet?.kind === "regenerate" ? (
          <>
            <p>지금 코드는 바로 쓸 수 없게 되고, 새 코드와 새 7일이 시작돼요.</p>
            <p className={`sub ${s["sheet-sub"]}`}>
              지금 신청은 이 채널의 신청 횟수 하나로 세요. 새 코드는 {VERIFICATION_TRIES}번 가운데 {attemptNumber((live?.remainingCount ?? 1) - 1)}번째 신청이 돼요.
            </p>
          </>
        ) : (
          <>
            <p>거두면 이 채널을 다른 사람도 신청할 수 있게 되고, 이 신청은 다시 살아나지 않아요.</p>
            <p className={`sub ${s["sheet-sub"]}`}>거둔 신청은 이 채널의 신청 횟수 하나로 세요.</p>
          </>
        )}
        <div role="status">{sheet ? noteLine : null}</div>
        <div className={s["sheet-btns"]}>
          <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
            돌아가기
          </button>
          <button
            className="btn"
            type="button"
            aria-disabled={busy}
            onClick={() =>
              live
                ? void run(sheet?.kind === "regenerate" ? { action: "regenerate" } : { action: "withdraw", applicationId: live.id }, () =>
                    sheet?.kind === "regenerate" ? { tone: "ok", text: "새 코드를 받았어요." } : null,
                  )
                : setSheet(null)
            }
          >
            {busy ? "처리하는 중…" : sheet?.kind === "regenerate" ? "다시 받기" : "거두기"}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
