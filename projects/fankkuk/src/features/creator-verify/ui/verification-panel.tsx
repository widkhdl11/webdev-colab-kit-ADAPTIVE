"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CHANNEL_PLATFORM_LABEL, CHANNEL_URL_EXAMPLES, CHANNEL_URL_MESSAGE, parseChannelUrl } from "@/entities/creator/model/channel-url";
import {
  attemptNumber,
  attemptNumberAfterRegenerate,
  myVerificationPanel,
  needsProfessionalAccountNote,
  panelOutcomeText,
  platformLabel,
  selfCheckPlatforms,
  verifyRoutes,
  VERIFICATION_CODE_DAYS,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_TRIES,
  type MyVerification,
  type MyVerificationState,
} from "@/entities/creator/model/creator-verification";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { sendVerification } from "../api/send-verification";
import { NOT_FOUND_IN_BIO, type VerificationAction } from "../model/run-verification-action";
import s from "./verification-panel.module.css";

// 크리에이터 「채널 본인 확인」 칸 (creator-verification INV-V1·V4·V5·V9·V12·V14·V15·V16). 주소와 설정 화면에 들어간다.
// 확인 길은 플랫폼의 「API 확인」으로 갈린다(INV-V2 표):
// - 있음(유튜브·치지직·인스타그램): 「○○로 확인하기」(플랫폼 로그인)가 먼저, 그 아래 「코드로 확인하기」 → 코드를 소개란에 붙이고 「확인」(자동 확인),
//   그래도 안 되면 「운영자에게 확인 요청」.
// - 없음(SOOP): 코드를 소개란에 붙이거나 팬꾹 계정 DM 으로 보내고 「확인 요청」.
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
  // 위반 취소 뒤에는(INV-V10, d32) 스스로 확인하는 길이 없다 — 로그인·코드 자동 확인 버튼이 사라진다
  const apiSet = selfCheckPlatforms(state, new Set(apiPlatforms));
  const panel = myVerificationPanel(state, rows, apiSet);
  const live = panel.live;
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  // 복사한 코드 — 코드를 다시 받으면 새 코드에는 「복사했어요」가 붙지 않는다
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const parsed = url.trim() === "" ? null : parseChannelUrl(url.trim());
  const routes = parsed?.ok ? verifyRoutes(parsed.channel.platform, apiSet) : [];
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

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
    } catch {
      setCopiedCode(null);
    }
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
                      {copiedCode === live.code ? "복사 완료" : ""}
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
                    채널별 신청 횟수: {attemptNumber(live.remainingCount)}/{VERIFICATION_TRIES}회
                  </span>
                </div>
              </>
            ) : (
              <p>운영자 확인을 기다리고 있습니다. 완료되면 이 화면에 결과가 표시됩니다.</p>
            )}
          </div>

          {live.status === "issued" ? (
            panel.canAutoCheck ? (
              <div className={s.steps}>
                <p>채널 소개란에 인증 코드를 입력한 뒤 ‘확인’을 눌러 주세요. 확인 완료 후 코드를 삭제해도 됩니다.</p>
                {needsProfessionalAccountNote(live.platform) ? <p className="sub">인스타그램 자동 확인은 프로페셔널 계정만 지원합니다. 개인 계정은 ‘운영자에게 확인 요청’을 이용해 주세요.</p> : null}
                <button
                  className={`btn ${s["btn-wide"]}`}
                  type="button"
                  aria-disabled={busy}
                  onClick={() =>
                    void run({ action: "auto_check", applicationId: live.id }, (body) =>
                      body.result === "approved"
                        ? { tone: "ok", text: "채널 소유자 확인이 완료되었습니다. 소개란의 코드는 삭제해도 됩니다." }
                        : { tone: "error", text: typeof body.message === "string" ? body.message : NOT_FOUND_IN_BIO },
                    )
                  }
                >
                  {busy ? "확인 중…" : "확인"}
                </button>
                <div role="status">{mainNote}</div>
                <div className={s.or}>
                  <p className="sub">
                    자동 확인이 되지 않으면 소개란의 코드를 유지한 채 ‘운영자에게 확인 요청’을 눌러 주세요.
                    <br />
                    요청을 제출한 신청은 운영자 확인 대기 중에 만료되지 않습니다.
                  </p>
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
                <p>인증 코드를 채널 소개란에 입력하거나 팬꾹 계정으로 DM을 보낸 뒤 ‘확인 요청’을 눌러 주세요. 운영자 확인 완료 후 코드를 삭제해도 됩니다.</p>
                <button
                  className={`btn ${s["btn-wide"]}`}
                  type="button"
                  aria-disabled={busy}
                  onClick={() => void run({ action: "post", applicationId: live.id }, () => ({ tone: "ok", text: "운영자에게 확인을 요청했어요." }))}
                >
                  {busy ? "요청 중…" : "확인 요청"}
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
                신청 취소
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className={`sub ${s.lead}`}>
            {panel.mode === "move"
              ? "채널 변경에는 새 채널의 소유자 확인이 필요합니다. 확인 중에는 기존 채널로 표시되며 새 선물을 받을 수 없습니다."
              : "채널 소유자 확인을 마치면 ‘크리에이터 찾기’에 표시되고 선물을 받을 수 있습니다."}
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
                      void run({ action: "login", channelUrl: parsed.channel.channelUrl }, () => null)
                    }
                  >
                    {CHANNEL_PLATFORM_LABEL[parsed.channel.platform]}로 확인하기
                  </button>
                  {needsProfessionalAccountNote(parsed.channel.platform) ? (
                    <p className="sub">인스타그램 로그인 확인은 프로페셔널 계정만 지원합니다. 개인 계정은 ‘코드로 확인하기’를 이용해 주세요.</p>
                  ) : null}
                  <div className={s.or}>
                    <p className="sub">로그인이 어려우면 ‘코드로 확인하기’를 이용해 주세요. 채널 소개란에 인증 코드를 입력해 확인합니다.</p>
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
                  <p className="sub">
                    {state.operatorOnly
                      ? "이용 규칙 위반으로 승인이 취소되어 운영자 재확인이 필요합니다."
                      : "이 플랫폼은 운영자 확인이 필요합니다."}{" "}
                    인증 코드를 받아 채널 소개란에 입력하거나 팬꾹 계정으로 DM을 보내 주세요.
                  </p>
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

      <BottomSheet open={sheet !== null} title={sheet?.kind === "regenerate" ? "코드를 다시 받을까요?" : "신청을 취소할까요?"} onClose={() => setSheet(null)}>
        {sheet?.kind === "regenerate" ? (
          <>
            <p>기존 코드는 즉시 만료됩니다. 새 코드의 확인 기한은 발급 후 {VERIFICATION_CODE_DAYS}일입니다.</p>
            <p className={`sub ${s["sheet-sub"]}`}>
              기존 신청도 횟수에 포함되며, 새 신청은 총 {VERIFICATION_TRIES}회 중 {attemptNumberAfterRegenerate(live?.remainingCount ?? 0)}번째입니다.
            </p>
          </>
        ) : (
          <>
            <p>취소한 신청은 복구할 수 없으며 신청 횟수에 포함됩니다. 취소 후에는 다른 사람도 이 채널의 소유자 확인을 신청할 수 있습니다.</p>
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
                    sheet?.kind === "regenerate" ? { tone: "ok", text: "새 인증 코드가 발급되었습니다." } : null,
                  )
                : setSheet(null)
            }
          >
            {busy ? "처리 중…" : sheet?.kind === "regenerate" ? "코드 다시 받기" : "신청 취소"}
          </button>
        </div>
      </BottomSheet>
    </section>
  );
}
