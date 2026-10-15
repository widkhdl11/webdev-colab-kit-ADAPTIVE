"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { MyAccount } from "@/entities/fan/model/my-account";
import { MustDeliverNotice } from "@/entities/notification/ui/must-deliver-notice";
import { FAN_PROFILE_EDIT } from "@/entities/session/model/home-path";
import { postAccount } from "@/features/account-edit/api/save-account-client";
import { accountInputSchema } from "@/features/account-edit/model/account-input";
import { PasswordChangePanel } from "@/features/password-change/ui/password-change-panel";
import { PhoneChangePanel } from "@/features/phone-change/ui/phone-change-panel";
import s from "./my-info.module.css";

// 팬 계정 설정(design-rules 12절, 시안 docs/design/mockups/site/v21-addendum3/fan-account-settings.html, 입력형 720 — 00절 「본문 틀」).
// 보안(비밀번호·휴대폰) · 개인정보(아이디·이메일·회원 탈퇴) · 알림 세 카드. 지금 있는 기능만 옮겨 담았다:
// - 비밀번호 변경(session-login INV-L12)·번호 바꾸기(카카오 재인증, signup INV-U12)는 「바꾸기」를 눌러야 그 줄 아래에 칸이 펼쳐진다. 두 칸은 저장하기와 따로 서버에 보낸다.
// - 이메일·알림 둘은 아래 「저장하기」로 보낸다(/api/me). 이메일은 바로 바뀌지 않고 확인 메일의 링크를 눌러야 바뀐다(my-account INV-A7).
//   닉네임은 프로필 수정 화면에서 고친다 — 여기서는 지금 값을 그대로 실어 보낸다(내 정보 저장이 닉네임 칸을 같이 받는다).
// - 회원 탈퇴는 탈퇴 기능이 아직 없어 지금처럼 고객센터로 보낸다. 시안의 「마지막으로 바꾼 날」은 저장된 값이 없어 두지 않는다.
// 「되돌리기」는 폼 기본 동작(reset)으로 처음 값에 돌아가고, 알림 스위치도 처음 값으로 돌린다.

type Notice = { tone: "ok" | "error"; text: string } | null;

function Switch({ id, title, on, onChange }: { id: string; title: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.swRow}>
      <div className={s.swT} id={`${id}-l`}>
        <b>{title}</b>
      </div>
      <button className="sw" type="button" role="switch" aria-checked={on} aria-labelledby={`${id}-l`} onClick={() => onChange(!on)}>
        <span />
      </button>
    </div>
  );
}

export function MyInfoPanel({ account }: { account: MyAccount }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [open, setOpen] = useState<"phone" | "password" | null>(null);
  const [kakao, setKakao] = useState(account.notifyKakao);
  const [mail, setMail] = useState(account.notifyEmail);
  const toggle = (which: "phone" | "password") => setOpen((cur) => (cur === which ? null : which));
  const toLogin = () => router.push("/login?next=/me");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const form = new FormData(e.currentTarget);
    const parsed = accountInputSchema.safeParse({
      nickname: account.nickname,
      email: String(form.get("email") ?? ""),
      notifyKakao: kakao,
      notifyEmail: mail,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      // 닉네임은 이 화면에서 고치지 않는다 — 지금 닉네임이 새 규칙에 맞지 않으면 프로필 수정으로 안내한다
      const text = issue?.path[0] === "nickname" ? "닉네임을 프로필 수정에서 먼저 고쳐 주세요." : (issue?.message ?? "입력을 확인해 주세요.");
      return setNotice({ tone: "error", text });
    }
    setSaving(true);
    setNotice(null);
    const outcome = await postAccount(parsed.data);
    setSaving(false);
    if (outcome.kind === "login") return toLogin();
    if (outcome.kind === "failed") return setNotice({ tone: "error", text: outcome.message });
    setNotice({
      tone: "ok",
      text: outcome.pendingEmail ? `저장했어요. 새 주소(${outcome.pendingEmail})로 확인 메일을 보냈어요.` : "저장했어요.",
    });
    router.refresh();
  };

  return (
    <form className={s.col} onSubmit={onSubmit} aria-labelledby={f("h")}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title" id={f("h")}>
            계정 설정
          </h1>
          <Link className="btn btn--line btn--sm" href={FAN_PROFILE_EDIT}>
            프로필 수정
          </Link>
        </div>
        <p className="ph-desc">로그인과 알림에 관한 설정이에요. 닉네임은 프로필 수정에서 바꿔요.</p>
      </header>

      <section className={`card ${s.setCard}`} aria-labelledby={f("sec1")}>
        <h2 className={s.secT} id={f("sec1")}>
          보안
        </h2>
        <div className={s.reveal}>
          <div className={s.revealHead}>
            <p className={s.kvMain}>
              <span className={s.meta}>비밀번호</span>
            </p>
            <button className="btn btn--line btn--sm" type="button" aria-expanded={open === "password"} aria-controls={f("pw-panel")} onClick={() => toggle("password")}>
              바꾸기
            </button>
          </div>
          {open === "password" && (
            <div className={s.panel}>
              <PasswordChangePanel id={f("pw-panel")} onLoginExpired={toLogin} />
            </div>
          )}
        </div>
        <div className={s.reveal}>
          <div className={s.revealHead}>
            <p className={s.kvMain}>
              <span className={s.meta} id={f("tel-l")}>
                휴대폰 번호
              </span>
              <b>{account.phoneMasked ?? "등록된 번호가 없어요"}</b>
            </p>
            <button
              className="btn btn--line btn--sm"
              type="button"
              aria-expanded={open === "phone"}
              aria-controls={f("tel-panel")}
              aria-describedby={f("tel-h")}
              onClick={() => toggle("phone")}
            >
              바꾸기
            </button>
          </div>
          <p className={s.help} id={f("tel-h")}>
            바꾸려면 카카오 인증을 다시 받아요.
          </p>
          {open === "phone" && (
            <div className={s.panel}>
              <PhoneChangePanel id={f("tel-panel")} onLoginExpired={toLogin} onChanged={() => router.refresh()} />
            </div>
          )}
        </div>
      </section>

      <section className={`card ${s.setCard}`} aria-labelledby={f("sec2")}>
        <h2 className={s.secT} id={f("sec2")}>
          개인정보
        </h2>
        {/* 저장 뒤 서버 값이 바뀌면 입력칸을 새로 그려 처음 값을 서버 값에 맞춘다 — 안 그러면 방금 적은 새 주소가 칸에 남아
            다음 저장이 같은 주소를 또 보낸다(2026-10-02 code-reviewer). */}
        <div className={s.fields} key={`${account.email ?? ""}|${account.pendingEmail ?? ""}`}>
          <dl className={s.kv}>
            <dt>아이디</dt>
            <dd>{account.loginId}</dd>
          </dl>
          <div>
            <label className="label" htmlFor={f("mail")}>
              이메일
            </label>
            <input
              className="field"
              id={f("mail")}
              name="email"
              type="email"
              defaultValue={account.email ?? ""}
              maxLength={254}
              required
              autoComplete="email"
              aria-describedby={f("mail-h")}
            />
            <p className={s.help} id={f("mail-h")}>
              {account.pendingEmail
                ? `새 주소(${account.pendingEmail})로 확인 메일을 보냈어요. 메일의 링크를 누르면 그 주소로 바뀌어요.`
                : "바꾸면 새 주소로 확인 메일이 가요. 링크를 눌러야 바뀌어요."}
            </p>
          </div>
        </div>
        <p className={s.help}>
          아이디는 바꿀 수 없어요. 닉네임은{" "}
          <Link className={s.inlineLink} href={FAN_PROFILE_EDIT}>
            프로필 수정
          </Link>
          에서 바꿀 수 있어요.
        </p>
        <div className={s.reveal}>
          <div className={s.revealHead}>
            <p className={s.kvMain}>
              <span className={s.meta}>회원 탈퇴</span>
            </p>
            <Link className={`btn btn--sm ${s.danger}`} href="/support">
              탈퇴 문의
            </Link>
          </div>
        </div>
      </section>

      <section className={`card ${s.setCard}`} aria-labelledby={f("sec3")}>
        <h2 className={s.secT} id={f("sec3")}>
          알림
        </h2>
        <Switch id={f("n1")} title="카카오 알림톡으로 받기" on={kakao} onChange={setKakao} />
        <Switch id={f("n2")} title="이메일로 받기" on={mail} onChange={setMail} />
        <p className={s.help}>보낸 선물이 사무실에 도착하고, 검수를 마치고, 크리에이터에게 출발할 때 알려 드려요.</p>
        {/* 꼭 가는 알림은 두 칸을 꺼도 간다(notifications INV-N6 표, 2026-10-12 문제집 D7) */}
        <MustDeliverNotice audience="fan" id={f("noti-must")} className={`t-meta ${s.must}`} titleClassName={s["must-t"]} />
      </section>

      {/* 알림 칸은 늘 두고 글자만 바꾼다 — 칸이 새로 생기면 화면 읽기 프로그램이 읽지 않는 경우가 있다. */}
      <p className={`err ${s.msg}`} role="alert">
        {notice?.tone === "error" ? notice.text : ""}
      </p>
      <p className={`okmsg ${s.msg}`} role="status">
        {notice?.tone === "ok" ? notice.text : ""}
      </p>
      <div className={s["save-bar"]}>
        <div className="btnrow">
          <button
            className="btn btn--text"
            type="reset"
            onClick={() => {
              setNotice(null);
              setKakao(account.notifyKakao);
              setMail(account.notifyEmail);
            }}
          >
            되돌리기
          </button>
          <button className="btn" type="submit" aria-disabled={saving} aria-busy={saving}>
            {saving ? "저장하는 중" : "저장하기"}
          </button>
        </div>
      </div>
    </form>
  );
}
