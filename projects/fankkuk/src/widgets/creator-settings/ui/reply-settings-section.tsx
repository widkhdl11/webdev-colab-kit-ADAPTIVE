"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReplySettings } from "@/entities/gift-reply/api/gift-reply-reads";
import { normalizeXHandle, shareTextOf, X_HANDLE_PATTERN } from "@/entities/gift-reply/model/reply";
import { sendCreatorReplySettings } from "@/features/creator-settings-save/api/send-creator-settings";
import { SaveMessage, type SaveMsg } from "./receiving-section";
import s from "./creator-settings.module.css";

// 크리에이터 — 감사 답장 설정 (gift-reply INV-G7·G8·G9). 「답장 모음 보이기」 · X 계정(영문·숫자·밑줄 1~15자) · 「태그 허용」.
// 저장은 로그인 세션으로만(크리에이터 ID 를 보내지 않는다). 모음은 팬도 공개를 허락한 답장만, 받았어요 3일 뒤부터 보인다.
// X 계정을 비우면 태그 허용도 꺼진다(DB 도 같다). 팬이 카드를 공유할 때 글쓰기 창에 채워질 글을 미리 보여 준다.

export function ReplySettingsSection({ initial }: { initial: ReplySettings }) {
  const router = useRouter();
  const [wallVisible, setWallVisible] = useState(initial.wallVisible);
  const [xHandle, setXHandle] = useState(initial.xHandle ?? "");
  const [xTagAllowed, setXTagAllowed] = useState(initial.xTagAllowed);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<SaveMsg>(null);

  const normalized = normalizeXHandle(xHandle);
  const handleOk = normalized === null || X_HANDLE_PATTERN.test(normalized);
  const preview = shareTextOf(normalized && handleOk && xTagAllowed ? normalized : null);

  const save = async () => {
    if (saving) return;
    setMsg(null);
    if (!handleOk) {
      setMsg({
        ok: false,
        text: "X 계정은 영문·숫자·밑줄 1~15자로 입력해 주세요.",
      });
      return;
    }
    setSaving(true);
    const r = await sendCreatorReplySettings({
      wallVisible,
      xHandle,
      xTagAllowed,
    });
    setSaving(false);
    if (r.kind === "login") {
      router.push("/login?next=/creator/settings");
      return;
    }
    if (r.kind === "failed") {
      setMsg({ ok: false, text: r.message });
      return;
    }
    if (normalized === null) setXTagAllowed(false);
    setMsg({ ok: true, text: "감사 답장 설정이 저장되었습니다." });
    router.refresh();
  };

  return (
    <section id="reply" className={`card ${s.set}`} aria-labelledby="reply-set-h">
      <div className={s["set-head"]}>
        <h3 className="t-card" id="reply-set-h">
          감사 답장
        </h3>
      </div>
      <div className="sw-row">
        <label className={s.txt} htmlFor="reply-wall">
          <strong className="t-strong">답장 모음 공개</strong>
          <span className="t-meta">팬이 공개에 동의한 답장을 내 수령 확인일 3일 후부터 선물 링크 페이지에 표시</span>
        </label>
        <input className={s.switch} type="checkbox" role="switch" id="reply-wall" checked={wallVisible} onChange={(e) => setWallVisible(e.currentTarget.checked)} />
      </div>
      <div>
        <label className="label" htmlFor="reply-x">
          X 계정 (선택)
        </label>
        <div className={s["handle-row"]}>
          <span className={s["handle-host"]} aria-hidden="true">
            @
          </span>
          <input
            className="field"
            id="reply-x"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={16}
            value={xHandle}
            aria-describedby={msg && !msg.ok ? "reply-x-hint reply-set-msg-err" : "reply-x-hint"}
            aria-invalid={handleOk ? undefined : true}
            onChange={(e) => setXHandle(e.currentTarget.value)}
          />
        </div>
        <p className="t-meta hint" id="reply-x-hint">
          영문·숫자·밑줄 1~15자 · 선택 입력
        </p>
      </div>
      <div className="sw-row">
        <label className={s.txt} htmlFor="reply-tag">
          <strong className="t-strong">X 계정 태그 허용</strong>
          <span className="t-meta">
            팬이 답장 카드를 X에 공유할 때 내 계정 태그 포함
            <br />
            공유 문구: {preview}
          </span>
        </label>
        <input
          className={s.switch}
          type="checkbox"
          role="switch"
          id="reply-tag"
          checked={xTagAllowed}
          disabled={normalized === null}
          onChange={(e) => setXTagAllowed(e.currentTarget.checked)}
        />
      </div>
      <div>
        <button className="btn" type="button" aria-disabled={saving} onClick={() => void save()}>
          {saving ? "저장 중…" : "감사 답장 설정 저장"}
        </button>
        {/* 오류 문구는 reply-set-msg-err 로 그려진다 — X 계정 칸이 그 문구를 가리킨다 */}
        <SaveMessage id="reply-set-msg" msg={msg} />
      </div>
    </section>
  );
}
