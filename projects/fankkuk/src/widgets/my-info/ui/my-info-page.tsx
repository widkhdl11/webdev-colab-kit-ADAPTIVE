"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { MyAccount } from "@/entities/fan/model/my-account";
import { MustDeliverNotice } from "@/entities/notification/ui/must-deliver-notice";
import { postAccount } from "@/features/account-edit/api/save-account-client";
import { accountInputSchema } from "@/features/account-edit/model/account-input";
import { PasswordChangePanel } from "@/features/password-change/ui/password-change-panel";
import { PhoneChangePanel } from "@/features/phone-change/ui/phone-change-panel";
import s from "./my-info.module.css";

// 계정 설정 본문(design-rules 00절 이름 메뉴 「계정 설정」). 시안: docs/design/mockups/site/v18/me.html (읽는 기둥 880, 네 칸 격자(최소 280) + 비밀번호·알림 판을 세로로 쌓음)
// 닉네임·이메일·알림 둘을 저장한다(/api/me). 이메일은 바로 바뀌지 않고 확인 메일의 링크를 눌러야 바뀐다(my-account INV-A7).
// 「번호 바꾸기」(카카오 재인증 + 지금 비밀번호, signup INV-U12)·「비밀번호 변경」(session-login INV-L12)은 버튼을 누르면 그 줄 아래에 칸이 펼쳐진다.
// 두 칸은 저장하기와 따로 서버에 보낸다 — 입력칸에 name 이 없어 아래 「저장하기」에 실리지 않는다.
// 「되돌리기」는 폼 기본 동작(reset)으로 처음 값에 돌아간다.

type Notice = { tone: "ok" | "error"; text: string } | null;

export function MyInfoPanel({ account }: { account: MyAccount }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [open, setOpen] = useState<"phone" | "password" | null>(null);
  const toggle = (which: "phone" | "password") => setOpen((cur) => (cur === which ? null : which));
  const toLogin = () => router.push("/login?next=/me");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const form = new FormData(e.currentTarget);
    const parsed = accountInputSchema.safeParse({
      nickname: String(form.get("nickname") ?? ""),
      email: String(form.get("email") ?? ""),
      notifyKakao: form.get("notifyKakao") === "on",
      notifyEmail: form.get("notifyEmail") === "on",
    });
    if (!parsed.success) {
      setNotice({ tone: "error", text: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." });
      return;
    }
    setSaving(true);
    setNotice(null);
    const outcome = await postAccount(parsed.data);
    setSaving(false);
    if (outcome.kind === "login") {
      toLogin();
      return;
    }
    if (outcome.kind === "failed") {
      setNotice({ tone: "error", text: outcome.message });
      return;
    }
    setNotice({
      tone: "ok",
      text: outcome.pendingEmail
        ? `저장했어요. 새 주소(${outcome.pendingEmail})로 확인 메일을 보냈어요.`
        : "저장했어요.",
    });
    router.refresh();
  };

  return (
    <form className={s.col} onSubmit={onSubmit} aria-labelledby={f("h")}>
      <header className="page-head">
        <h1 className="ph-title" id={f("h")}>
          계정 설정
        </h1>
        <p className="ph-desc">개인정보와 알림을 바꿀 수 있어요.</p>
      </header>
      <h2 className={s.sub}>개인정보</h2>
      {/* 저장 뒤 서버 값이 바뀌면 입력칸을 새로 그려 처음 값을 서버 값에 맞춘다 — 안 그러면 방금 적은 새 주소가 칸에 남아
          다음 저장이 같은 주소를 또 보낸다(2026-10-02 code-reviewer). 알림 칸은 이 밖에 있어 그대로 남는다. */}
      <div className="stack" key={`${account.nickname}|${account.email ?? ""}|${account.pendingEmail ?? ""}|${account.notifyKakao}|${account.notifyEmail}`}>
        <div className={s.fields}>
          <div className="part">
            <label className="label" htmlFor={f("uid")}>
              아이디
            </label>
            <input className="field" id={f("uid")} type="text" defaultValue={account.loginId} readOnly aria-describedby={f("uid-h")} />
            <p className="hint" id={f("uid-h")}>
              아이디는 바꿀 수 없어요.
            </p>
          </div>
          <div className="part">
            <label className="label" htmlFor={f("nick")}>
              닉네임
            </label>
            <input
              className="field"
              id={f("nick")}
              name="nickname"
              type="text"
              defaultValue={account.nickname}
              maxLength={12}
              required
              autoComplete="nickname"
              aria-describedby={f("nick-h")}
            />
            <p className="hint" id={f("nick-h")}>
              크리에이터에게 보이는 이름이에요. (12자까지)
            </p>
          </div>
          <div className="part">
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
            <p className="hint" id={f("mail-h")}>
              {account.pendingEmail
                ? `새 주소(${account.pendingEmail})로 확인 메일을 보냈어요. 메일의 링크를 누르면 그 주소로 바뀌어요.`
                : "바꾸면 새 주소로 확인 메일이 가요. 링크를 눌러야 바뀌어요."}
            </p>
          </div>
          <div className="part">
            <label className="label" htmlFor={f("tel")}>
              휴대폰 번호
            </label>
            <div className={s["with-btn"]}>
              <input className="field" id={f("tel")} type="text" value={account.phoneMasked ?? ""} readOnly aria-describedby={f("tel-h")} />
              <button className="btn btn--line" type="button" aria-expanded={open === "phone"} aria-controls={f("tel-panel")} onClick={() => toggle("phone")}>
                번호 바꾸기
              </button>
            </div>
            <p className="hint" id={f("tel-h")}>
              바꾸려면 카카오 인증을 다시 받아요.
            </p>
            {open === "phone" && <PhoneChangePanel id={f("tel-panel")} onLoginExpired={toLogin} onChanged={() => router.refresh()} />}
          </div>
        </div>
        <div className="part">
          <p className="t-card">비밀번호</p>
          <div className={`btnrow ${s.open}`}>
            <button className="btn btn--line" type="button" aria-expanded={open === "password"} aria-controls={f("pw-panel")} onClick={() => toggle("password")}>
              비밀번호 변경
            </button>
          </div>
          {open === "password" && <PasswordChangePanel id={f("pw-panel")} onLoginExpired={toLogin} />}
        </div>
        <div className="part" role="group" aria-labelledby={f("noti")} aria-describedby={`${f("noti-hint")} ${f("noti-must")}`}>
          <p className="t-card" id={f("noti")}>
            알림 받기
          </p>
          <div className={s.open}>
            <label className="check">
              <input type="checkbox" name="notifyKakao" defaultChecked={account.notifyKakao} />
              카카오 알림톡으로 받기
            </label>
            <label className="check">
              <input type="checkbox" name="notifyEmail" defaultChecked={account.notifyEmail} />
              이메일로 받기
            </label>
          </div>
          <p className="hint" id={f("noti-hint")}>보낸 선물이 사무실에 도착하고, 검수를 마치고, 크리에이터에게 출발할 때 알려 드려요.</p>
          {/* 꼭 가는 알림은 두 칸을 꺼도 간다(notifications INV-N6 표, 2026-10-12 문제집 D7) */}
          <MustDeliverNotice audience="fan" id={f("noti-must")} className={`t-meta ${s.must}`} titleClassName={s["must-t"]} />
        </div>
      </div>
      {/* 알림 칸은 늘 두고 글자만 바꾼다 — 칸이 새로 생기면 화면 읽기 프로그램이 읽지 않는 경우가 있다. */}
      <p className={`err ${s.msg}`} role="alert">
        {notice?.tone === "error" ? notice.text : ""}
      </p>
      <p className={`okmsg ${s.msg}`} role="status">
        {notice?.tone === "ok" ? notice.text : ""}
      </p>
      <div className={s["save-bar"]}>
        <Link className={s.leave} href="/support">
          회원 탈퇴
        </Link>
        <div className="btnrow">
          <button className="btn btn--text" type="reset" onClick={() => setNotice(null)}>
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
