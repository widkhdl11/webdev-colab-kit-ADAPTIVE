"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CHANNEL_PLATFORM_LABEL, CHANNEL_URL_EXAMPLES, CHANNEL_URL_MESSAGE, parseChannelUrl } from "@/entities/creator/model/channel-url";
import { saveLinkHandle } from "@/entities/creator/api/link-handle-client";
import { HANDLE_LOCK_DAYS, HANDLE_MAX, LINK_HOST, linkText } from "@/entities/creator/model/creator-handle";
import {
  myVerificationPanel,
  PANEL_STAGE_TAG,
  panelNotice,
  recheckNotice,
  type MyVerification,
  type MyVerificationPanel,
  type MyVerificationState,
  type PanelTagTone,
} from "@/entities/creator/model/creator-verification";
import { linkMakerState } from "@/entities/creator/model/link-availability";
import { checkNameAvailability } from "@/entities/session/api/name-check-client";
import { createAvailabilityWatcher, type AvailabilityState } from "@/shared/lib/availability/availability-watcher";
import { formatDotDate } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { CopyButton } from "@/shared/ui/copy-button";
import { sendVerification } from "../api/send-verification";
import type { VerificationAction } from "../model/run-verification-action";
import s from "./verification-panel.module.css";

// 크리에이터 「채널 소유자 확인」 (creator-verification INV-V4·V9·V10·V15·V17·V19·V20, UX 명세 signup.md 「2026-11-02 채널 확인」 상태표).
// 시안 docs/design/mockups/channel-link-verify-20261102/index.html · design-rules 42절. 가입 4단계(variant="signup", 카드 안)와
// 계정 설정 보안 묶음의 한 줄(variant="account")이 같은 부품을 쓴다 — 무엇이 보이는지는 같고 틀만 다르다.
// - 확인 전: ① 팬꾹 링크(없으면 만들기 — 상세 설정과 같은 저장 라우트, 있으면 올리기 안내 + 복사 + 예시) → ② 채널 주소 → 「채널 확인 요청」.
//   링크가 없으면 ①만 보인다(②·요청은 링크를 만든 뒤). 「치지직으로 바로 확인」은 실제 연결이 생길 때까지 두지 않는다(서버 길은 그대로).
// - 요청 완료 · 반려(사유 값 한 줄) · 신청 마감 · 확인 완료(다음 재확인 날) · 링크 확인 필요(유예 끝 날 + 「채널 확인 재요청」).
// 남은 요청 횟수는 어디에도 보이지 않는다(INV-V15). 단계·뱃지·알림 문구는 entities 모델이 정하고 여기서는 그리기만 한다.
// 거부·허용은 서버와 DB 가 다시 판정하고, 처리 뒤에는 화면을 다시 읽는다.

type Variant = "signup" | "account";
type Note = { tone: "ok" | "error"; text: string } | null;

type Props = {
  variant: Variant;
  state: MyVerificationState;
  rows: readonly MyVerification[];
  /** 로그인 아이디 — 팬꾹 링크가 이것과 같으면 서버에 묻지 않고 「로그인 아이디와 다르게」(signup INV-U14 S14e). 모르면 null(저장 때 DB 가 거부한다) */
  loginId: string | null;
};

const TAG_CLASS: Record<PanelTagTone, string> = {
  state: s["tag-state"],
  wait: s["tag-wait"],
  rej: s["tag-rej"],
  off: s["tag-off"],
  ok: s["tag-ok"],
  warn: s["tag-wait"],
};

function StageTag({ panel, dot }: { panel: MyVerificationPanel; dot?: boolean }) {
  const tag = PANEL_STAGE_TAG[panel.stage];
  return <span className={`${s.tag} ${TAG_CLASS[tag.tone]} ${dot ? s["tag-dot"] : ""}`}>{tag.label}</span>;
}

function CheckIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true" className={s["sent-mark"]}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p className={s.err} role="alert">
      <span className={s.mark} aria-hidden="true">
        !
      </span>
      <span>{children}</span>
    </p>
  );
}

function NoteLine({ note }: { note: Note }) {
  if (!note) return null;
  return note.tone === "ok" ? (
    <p className={s.ok}>{note.text}</p>
  ) : (
    <p className={s.msg}>
      <span className={s.mark} aria-hidden="true">
        !
      </span>
      {note.text}
    </p>
  );
}

function CopyLink({ handle }: { handle: string }) {
  return (
    <span className={s.copy}>
      <CopyButton
        className="btn btn--line btn--sm"
        text={`https://${linkText(handle)}`}
        label="복사"
        ariaLabel="팬꾹 링크 복사"
        copiedMessage="팬꾹 링크가 복사되었습니다."
        failedMessage="링크를 복사하지 못했습니다. 주소를 선택해 직접 복사해 주세요."
      />
    </span>
  );
}

export function VerificationPanel({ variant, state, rows, loginId }: Props) {
  const router = useRouter();
  const ids = useId();
  const panel = myVerificationPanel(state, rows);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [moving, setMoving] = useState(false);

  async function run(action: VerificationAction, okText: string | null): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setNote(null);
    const r = await sendVerification(action);
    setBusy(false);
    if (r.kind === "failed") {
      if (r.status === 401) {
        router.push("/login");
        return false;
      }
      setNote({ tone: "error", text: r.message });
      // 다른 처리가 먼저 끝났거나(409·404) DB 는 처리했는데 응답만 실패했을 수 있다 — 지금 상태를 다시 읽는다
      router.refresh();
      return false;
    }
    setWithdrawing(false);
    setNote(okText ? { tone: "ok", text: okText } : null);
    router.refresh();
    return true;
  }

  const notice = panelNotice(state, panel);
  // 맨 앞 안내 문장은 확인 전 상태에만(signup.md 「맨 앞 안내 문장은 확인 전 상태(idle·rejected)에만」)
  const lead = panel.stage === "idle" || panel.stage === "link_needed" || panel.stage === "rejected";

  const requestForm = (again: boolean) => (
    <RequestForm
      ids={ids}
      state={state}
      loginId={loginId}
      again={again}
      busy={busy}
      note={note}
      onClearNote={() => setNote(null)}
      onRequest={(channelUrl) => run({ action: "request", channelUrl }, null)}
      onLoginExpired={() => router.push("/login")}
    />
  );

  const sent =
    panel.live !== null ? (
      <>
        <div className={`${s.step} ${s.tight}`}>
          <p className={s.sent}>
            <CheckIcon />
            채널 확인 요청을 보냈습니다
          </p>
          <p className={s.sub16}>운영자가 채널을 확인하면 채널 확인이 완료됩니다.</p>
        </div>
        <dl className={s.kv}>
          <div>
            <dt>채널 이름</dt>
            <dd>{state.channelTitle}</dd>
          </div>
          <div>
            <dt>채널 주소</dt>
            <dd>{panel.live.channelUrl}</dd>
          </div>
          {panel.live.linkHandle ? (
            <div>
              <dt>팬꾹 링크</dt>
              <dd>{linkText(panel.live.linkHandle)}</dd>
            </div>
          ) : null}
        </dl>
        <div className={s.end}>
          <button
            className="btn btn--line btn--sm"
            type="button"
            onClick={() => {
              setNote(null);
              setWithdrawing(true);
            }}
          >
            요청 취소
          </button>
        </div>
        <div role="status" className={s.status}>{withdrawing ? null : <NoteLine note={note} />}</div>
      </>
    ) : null;

  // 신청 마감 — 한도는 채널마다 따로다(INV-V15 S15d). 이 채널로는 막혔다는 상자 + 1:1 문의를 두고, 다른 채널 주소로 낼 수 있게 ①②를 그대로 둔다.
  // 같은 채널을 다시 넣으면 DB 가 거부하고 그 문구가 요청 버튼 아래에 뜬다.
  const locked = (
    <div className={s.body}>
      <div className={s.step}>
        {notice ? <ErrorBox>{notice}</ErrorBox> : null}
        <div>
          <Link className="btn btn--line" href="/support">
            1:1 문의
          </Link>
        </div>
      </div>
      <div className={s.name}>
        <span className={s.k}>채널 이름</span>
        <strong>{state.channelTitle}</strong>
      </div>
      {requestForm(false)}
    </div>
  );

  const grace = recheckNotice(state, new Date().toISOString());
  const recheck = (
    <>
      <p className={s.v}>{grace.text}</p>
      {state.handle ? (
        <div className={s.lkrow}>
          <span className={s.lkurl}>{linkText(state.handle)}</span>
          <CopyLink handle={state.handle} />
        </div>
      ) : null}
      {grace.requested ? (
        <p className={s.ok}>{grace.requested}</p>
      ) : (
        <div>
          <button className="btn" type="button" aria-disabled={busy} onClick={() => void run({ action: "recheck_request" }, null)}>
            {busy ? "요청 중…" : "채널 확인 재요청"}
          </button>
        </div>
      )}
      <div role="status" className={s.status}>
        <NoteLine note={note} />
      </div>
    </>
  );

  const withdrawSheet = (
    <BottomSheet open={withdrawing} title="확인 요청을 취소할까요?" onClose={() => setWithdrawing(false)}>
      <p>취소한 요청은 복구할 수 없습니다. 취소 후에는 다른 사람도 이 채널의 소유자 확인을 요청할 수 있습니다.</p>
      <div role="status" className={s.status}>{withdrawing ? <NoteLine note={note} /> : null}</div>
      <div className={s["sheet-btns"]}>
        <button className="btn btn--line" type="button" onClick={() => setWithdrawing(false)}>
          돌아가기
        </button>
        <button
          className="btn"
          type="button"
          aria-disabled={busy}
          onClick={() => (panel.live ? void run({ action: "withdraw", applicationId: panel.live.id }, null) : setWithdrawing(false))}
        >
          {busy ? "처리 중…" : "요청 취소"}
        </button>
      </div>
    </BottomSheet>
  );

  // 확인 전·반려 공통 본문(① ② 요청). 계정 설정의 채널 변경도 같은 본문이다
  const beforeBody = (again: boolean) => (
    <div className={s.body}>
      {notice ? <ErrorBox>{notice}</ErrorBox> : null}
      <div className={s.name}>
        <span className={s.k}>채널 이름</span>
        <strong>{state.channelTitle}</strong>
      </div>
      {requestForm(again)}
    </div>
  );

  if (variant === "signup") {
    return (
      <section className={s.panel} aria-labelledby={`${ids}-h`}>
        <div className={`${s.head} ${lead ? s["has-lead"] : ""}`}>
          <h2 id={`${ids}-h`}>채널 소유자 확인</h2>
          <StageTag panel={panel} />
        </div>
        {lead ? <p className={s.lead}>다른 사람이 내 채널로 가입하지 못하도록, 채널 소유자를 확인해 주세요.</p> : null}
        {panel.stage === "waiting" ? (
          <div className={s.body}>{sent}</div>
        ) : panel.stage === "locked" ? (
          locked
        ) : panel.stage === "verified" ? (
          <div className={s.body}>
            <div className={`${s.step} ${s.tight}`}>
              <p className={s.sent}>
                <CheckIcon />
                채널 인증이 완료되었습니다{state.verifiedAt ? ` · ${formatDotDate(state.verifiedAt)}` : ""}
              </p>
            </div>
            <dl className={s.kv}>
              <div>
                <dt>채널 이름</dt>
                <dd>{state.channelTitle}</dd>
              </div>
              {state.channelUrl ? (
                <div>
                  <dt>채널 주소</dt>
                  <dd>{state.channelUrl}</dd>
                </div>
              ) : null}
              {state.nextRecheckAt ? (
                <div>
                  <dt>다음 재확인</dt>
                  <dd>{formatDotDate(state.nextRecheckAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        ) : panel.stage === "recheck_missing" ? (
          <div className={s.body}>{recheck}</div>
        ) : (
          beforeBody(panel.stage === "rejected")
        )}
        {withdrawSheet}
      </section>
    );
  }

  // 계정 설정 — 보안 묶음의 한 줄(시안 #acct-verified·#acct-recheck). 확인 전 상태는 줄 아래에 같은 ① ② 본문이 늘 펼쳐져 있다
  const verified = panel.stage === "verified";
  return (
    <div className={s.acct}>
      <div className={s.row}>
        <p className={s.txt}>
          <span className={s.kl}>
            <span className={s.k16} id={`${ids}-h`}>
              채널 소유자 확인
            </span>
            <StageTag panel={panel} dot />
          </span>
          {verified ? (
            <>
              <span className={`${s.v} ${s.strong}`}>
                채널 인증이 완료되었습니다{state.verifiedAt ? ` · ${formatDotDate(state.verifiedAt)}` : ""}
              </span>
              {state.channelUrl ? (
                <a className={s.vlink} href={state.channelUrl} target="_blank" rel="noopener noreferrer">
                  {state.channelUrl}
                </a>
              ) : null}
              {state.nextRecheckAt ? <span className={s.small}>다음 재확인 {formatDotDate(state.nextRecheckAt)}</span> : null}
            </>
          ) : null}
        </p>
        {verified ? (
          <div className={s.act}>
            <button className="btn btn--line btn--sm" type="button" aria-expanded={moving} aria-controls={`${ids}-move`} onClick={() => setMoving((m) => !m)}>
              채널 변경
            </button>
          </div>
        ) : null}
      </div>
      {verified ? (
        moving ? (
          <div className={s["acct-body"]} id={`${ids}-move`}>
            <p className={s.lead}>새 채널의 소유자 확인이 필요합니다. 확인 중에는 기존 채널로 표시되며 새 선물을 받을 수 없습니다.</p>
            {beforeBody(false)}
          </div>
        ) : null
      ) : (
        <div className={s["acct-body"]}>
          {panel.stage === "waiting" ? (
            <div className={s.body}>{sent}</div>
          ) : panel.stage === "locked" ? (
            locked
          ) : panel.stage === "recheck_missing" ? (
            <div className={s.recheck}>{recheck}</div>
          ) : (
            <>
              {lead ? <p className={s.lead}>다른 사람이 내 채널로 가입하지 못하도록, 채널 소유자를 확인해 주세요.</p> : null}
              {beforeBody(panel.stage === "rejected")}
            </>
          )}
        </div>
      )}
      {withdrawSheet}
    </div>
  );
}

// ① 팬꾹 링크(만들기 또는 올리기 안내) → ② 채널 주소 → 요청
function RequestForm({
  ids,
  state,
  loginId,
  again,
  busy,
  note,
  onClearNote,
  onRequest,
  onLoginExpired,
}: {
  ids: string;
  state: MyVerificationState;
  loginId: string | null;
  again: boolean;
  busy: boolean;
  note: Note;
  onClearNote: () => void;
  onRequest: (channelUrl: string) => Promise<boolean>;
  onLoginExpired: () => void;
}) {
  const [url, setUrl] = useState("");
  const trimmed = url.trim();
  const parsed = trimmed === "" ? null : parseChannelUrl(trimmed);

  if (state.handle === null) return <LinkMaker ids={ids} loginId={loginId} onLoginExpired={onLoginExpired} />;
  const handle = state.handle;

  return (
    <>
      <div className={s.step}>
        <p className={s.label}>
          <span className={s.no} aria-hidden="true">
            1
          </span>
          <span>활동 중인 채널에 팬꾹 링크를 올려 주세요</span>
        </p>
        <div className={s.linkbox}>
          <div className={s.lrow}>
            <span className={s.url}>{linkText(handle)}</span>
            <CopyLink handle={handle} />
          </div>
          <div className={s.ex}>
            <span className={s.k}>예시</span>
            <p>
              게임 방송하는 하루입니다. 선물은 여기로 보내 주세요
              <br />
              <b>{linkText("haru")}</b>
            </p>
          </div>
        </div>
      </div>
      <div className={s.step}>
        <label htmlFor={`${ids}-url`} className={s.label}>
          <span className={s.no} aria-hidden="true">
            2
          </span>
          <span>팬꾹 링크를 올린 채널 주소를 입력해 주세요</span>
        </label>
        <input
          className={s.field}
          id={`${ids}-url`}
          inputMode="url"
          autoComplete="url"
          placeholder="https://www.youtube.com/@핸들"
          value={url}
          aria-describedby={`${ids}-url-hint`}
          aria-invalid={parsed !== null && !parsed.ok}
          onChange={(e) => {
            setUrl(e.target.value);
            onClearNote();
          }}
        />
        <div id={`${ids}-url-hint`} className={s.hintwrap}>
          {parsed !== null && !parsed.ok ? (
            <p className={s.msg}>
              <span className={s.mark} aria-hidden="true">
                !
              </span>
              {CHANNEL_URL_MESSAGE[parsed.reason]}
            </p>
          ) : null}
          <ul className={s.examples}>
            {CHANNEL_URL_EXAMPLES.map((x) => (
              <li key={x.example}>
                <span className={s.pl}>{CHANNEL_PLATFORM_LABEL[x.platform]}</span> <span className={s.u}>{x.example}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={s.step}>
        <button
          className={`btn ${s.block}`}
          type="button"
          aria-disabled={busy || !parsed?.ok}
          onClick={() => {
            if (busy || !parsed?.ok) return;
            void onRequest(parsed.channel.channelUrl).then((ok) => {
              if (ok) setUrl("");
            });
          }}
        >
          {busy ? "요청 중…" : again ? "채널 확인 재요청" : "채널 확인 요청"}
        </button>
        <div role="status" className={s.status}>
          <NoteLine note={note} />
        </div>
      </div>
    </>
  );
}

// ① 팬꾹 링크 만들기 — 상세 설정의 링크 칸과 같은 저장 라우트(creator-link INV-E1~E4). 미리 확인은 signup INV-U14.
function LinkMaker({ ids, loginId, onLoginExpired }: { ids: string; loginId: string | null; onLoginExpired: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [check, setCheck] = useState<AvailabilityState | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watcher = useRef<ReturnType<typeof createAvailabilityWatcher> | null>(null);
  // 안내 한 줄·서버에 물을 값·「만들기」 켜짐은 모델이 정한다(빈 값·꼴 틀림·로그인 아이디와 같음은 묻지 않는다, 「쓸 수 있어요」일 때만 켜짐)
  const { value, line, ask, canMake } = linkMakerState({ draft, loginId, check });

  useEffect(() => {
    const w = createAvailabilityWatcher({ check: (v, signal) => checkNameAvailability("linkHandle", v, signal), onChange: setCheck });
    watcher.current = w;
    return () => {
      w.dispose();
      watcher.current = null;
    };
  }, []);

  useEffect(() => {
    watcher.current?.update(ask);
  }, [ask]);

  async function save() {
    if (saving) return;
    setSaving(true);
    const r = await saveLinkHandle(value);
    setSaving(false);
    setConfirming(false);
    if (r.kind === "login") {
      onLoginExpired();
      return;
    }
    if (r.kind === "failed") {
      setError(r.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className={s.step}>
      <label htmlFor={`${ids}-link`} className={s.label}>
        <span className={s.no} aria-hidden="true">
          1
        </span>
        <span>팬꾹 링크를 만들어 주세요</span>
      </label>
      <p className={s.desc}>외부에서 크리에이터님의 팬꾹으로 안내할 때 사용할 주소입니다.</p>
      <div className={s.vrow}>
        <div className={s.handle}>
          <span className={s.pre} aria-hidden="true">
            {LINK_HOST}/
          </span>
          <input
            id={`${ids}-link`}
            value={draft}
            maxLength={HANDLE_MAX + 4}
            placeholder="haru"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={`${ids}-link-line ${ids}-link-hint`}
            aria-invalid={line?.tone === "bad" || error !== null}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
          />
        </div>
        <button
          className={`btn ${s.make}`}
          type="button"
          aria-disabled={!canMake || saving}
          onClick={() => {
            if (!canMake || saving) return;
            setError(null);
            setConfirming(true);
          }}
        >
          만들기
        </button>
      </div>
      <div id={`${ids}-link-line`} role="status" className={s.hintwrap}>
        {error ? (
          <p className={s.msg}>
            <span className={s.mark} aria-hidden="true">
              !
            </span>
            {error}
          </p>
        ) : line ? (
          <p className={line.tone === "bad" ? s.msg : line.tone === "ok" ? s.okline : s.wait}>
            {line.tone === "bad" ? (
              <span className={s.mark} aria-hidden="true">
                !
              </span>
            ) : null}
            {line.message}
          </p>
        ) : null}
      </div>
      <p className={s.hint} id={`${ids}-link-hint`}>
        로그인 아이디와 다르게 정해 주세요. 만든 뒤 {HANDLE_LOCK_DAYS}일 동안은 변경할 수 없습니다.
      </p>

      <BottomSheet open={confirming} title={`${linkText(value || "…")}로 정할까요?`} onClose={() => setConfirming(false)}>
        <p>설정 후 {HANDLE_LOCK_DAYS}일 동안 변경할 수 없습니다.</p>
        <p className={s.hint}>공유하기 전 주소의 철자를 확인해 주세요.</p>
        <div className={s["sheet-btns"]}>
          <button className="btn btn--line" type="button" onClick={() => setConfirming(false)}>
            취소
          </button>
          <button className="btn" type="button" aria-disabled={saving} onClick={() => void save()}>
            {saving ? "저장 중…" : "정하기"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
