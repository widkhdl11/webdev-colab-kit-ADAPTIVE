"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type {
  MyVerification,
  MyVerificationState,
} from "@/entities/creator/model/creator-verification";
import {
  CHANNEL_PLATFORM_LABEL,
  isChannelPlatform,
} from "@/entities/creator/model/channel-url";
import { MustDeliverNotice } from "@/entities/notification/ui/must-deliver-notice";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import {
  CREATOR_ACCOUNT,
  CREATOR_SETTINGS,
} from "@/entities/session/model/home-path";
import { sendCreatorNotify } from "@/features/creator-settings-save/api/send-creator-settings";
import { VerificationPanel } from "@/features/creator-verify/ui/verification-panel";
import { PasswordChangePanel } from "@/features/password-change/ui/password-change-panel";
import { PhoneChangePanel } from "@/features/phone-change/ui/phone-change-panel";
import { formatDate } from "@/shared/lib/format/datetime";
import s from "./creator-account.module.css";

// 크리에이터 계정 설정(design-rules 27절 「4파트 나머지 다섯 화면」, 2026-10-22 카드 d115 · 시안 docs/design/mockups/site/pilot-2026-10-22/creator-account.html).
// 2026-10-16 사용자 「만들어봐」 — 상세 설정 아래 접힌 「계정」 칸(본인 확인·알림·계정 보안)을 이 화면으로 옮겼다.
// 배치는 계정 설정(팬)과 같다: 카드 없이 880 기둥 안 12열 4 + 8 묶음 둘 — 보안(비밀번호·휴대폰 번호·채널 본인 확인) → 알림
// → 「상세 설정」 안내 줄 → 구분선 → 회원 탈퇴(맨 끝). 탈퇴 하나뿐이던 「개인정보」 카드는 없어졌다. 지금 있는 기능만 옮겨 담았다:
// - 비밀번호 변경(session-login INV-L12)·번호 바꾸기(카카오 재인증, signup INV-U12)·채널 본인 확인(creator-verification)은 버튼을 눌러야 그 줄 아래에 칸이 펼쳐진다.
// - 시안의 이메일·이름 바꾸기, 알림 종류별 스위치 넷은 크리에이터에게 지금 없는 기능이라 두지 않는다 — 알림은 카카오·이메일 두 칸(my-account INV-A11),
//   승인 요청처럼 꼭 가는 알림은 끄는 스위치 없이 「끌 수 없는 알림」으로 알린다(notifications INV-N6). 스위치는 누르는 즉시 저장하고, 실패하면 되돌린다.
// - 회원 탈퇴는 팬 화면과 같이 펼치면 고객센터 문의 링크만(탈퇴 기능이 아직 없다).

type Open = "password" | "phone" | "verify" | "leave" | null;
type Msg = { ok: boolean; text: string } | null;

// 줄 전체가 누르는 칸(높이 64) — 이름·설명·막대가 한 스위치 버튼 안에 있다(계정 설정(팬) my-info-page 의 Switch 와 같은 모양)
function Switch({
  id,
  title,
  desc,
  on,
  busy,
  describedBy,
  onChange,
}: {
  id: string;
  title: string;
  desc: string;
  on: boolean;
  busy: boolean;
  describedBy: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={s.item}>
      <button
        className={s.swBtn}
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-l`}
        aria-describedby={describedBy}
        aria-disabled={busy}
        onClick={() => {
          if (!busy) onChange(!on);
        }}
      >
        <span className={s.txt} id={`${id}-l`}>
          <span className={s.k}>{title}</span>
          <span className={s.sub}>{desc}</span>
        </span>
        <span className={s.trk} aria-hidden="true" />
      </button>
    </div>
  );
}

/** 본인 확인 줄의 짧은 상태 — 확인됐으면 「치지직 채널 「채널 이름」 확인됨 · 날짜」(시안 그대로). */
function verifyMeta(state: MyVerificationState): string {
  if (!state.verified) return "확인 전";
  const platform =
    state.platform && isChannelPlatform(state.platform)
      ? `${CHANNEL_PLATFORM_LABEL[state.platform]} 채널 `
      : "";
  const title = state.channelTitle ? `「${state.channelTitle}」 ` : "";
  return `${platform}${title}확인됨${state.verifiedAt ? ` · ${formatDate(state.verifiedAt)}` : ""}`;
}

export function CreatorAccountPage({
  phoneMasked,
  notify,
  verification,
}: {
  phoneMasked: string | null;
  notify: { kakao: boolean; email: boolean };
  verification: {
    state: MyVerificationState;
    rows: readonly MyVerification[];
    apiPlatforms: readonly string[];
  };
}) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const toggle = (which: Exclude<Open, null>) =>
    setOpen((cur) => (cur === which ? null : which));
  const toLogin = () => router.push(`/login?next=${CREATOR_ACCOUNT}`);
  const [alarm, setAlarm] = useState(notify);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  // 스위치는 누르는 즉시 저장한다. 실패하면 화면 값을 저장된 값으로 되돌린다.
  const toggleNotify = async (key: "kakao" | "email", value: boolean) => {
    if (saving) return;
    const before = alarm;
    const next = { ...alarm, [key]: value };
    setAlarm(next);
    setSaving(true);
    setMsg(null);
    const r = await sendCreatorNotify(next);
    setSaving(false);
    if (r.kind === "login") {
      toLogin();
      return;
    }
    if (r.kind === "ok") {
      setMsg({ ok: true, text: "알림 설정을 저장했어요." });
      return;
    }
    setAlarm(before);
    setMsg({ ok: false, text: r.message });
  };

  return (
    <div className={s.wrap}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">계정 설정</h1>
        </div>
        <p className="ph-desc">로그인과 내 정보, 알림을 관리해요.</p>
      </header>

      <section className={s.grp} aria-labelledby={f("sec1")} data-ca-group="security">
        <h2 className={s.nm} id={f("sec1")}>
          보안
        </h2>
        <div className={s.rows}>
          <div className={s.item}>
            <div className={s.row}>
              <p className={s.txt}>
                <span className={s.k}>비밀번호</span>
              </p>
              <button
                className="btn btn--line btn--sm"
                type="button"
                aria-expanded={open === "password"}
                aria-controls={f("pw-panel")}
                onClick={() => toggle("password")}
              >
                바꾸기
              </button>
            </div>
            {open === "password" && (
              <div className={s.panel}>
                <PasswordChangePanel id={f("pw-panel")} onLoginExpired={toLogin} />
              </div>
            )}
          </div>
          <div className={s.item}>
            <div className={s.row}>
              <p className={s.txt}>
                <span className={s.k}>휴대폰 번호</span>
                <span className={s.v}>{phoneMasked ?? "등록된 번호가 없어요"}</span>
              </p>
              <button
                className="btn btn--line btn--sm"
                type="button"
                aria-expanded={open === "phone"}
                aria-controls={f("tel-panel")}
                onClick={() => toggle("phone")}
              >
                바꾸기
              </button>
            </div>
            {open === "phone" && (
              <div className={s.panel}>
                <PhoneChangePanel id={f("tel-panel")} onLoginExpired={toLogin} onChanged={() => router.refresh()} />
              </div>
            )}
          </div>
          <div className={s.item} id="verify">
            <div className={s.row}>
              <p className={s.txt}>
                <span className={s.k}>채널 본인 확인</span>
                <span className={s.v}>{verifyMeta(verification.state)}</span>
              </p>
              <button
                className="btn btn--line btn--sm"
                type="button"
                aria-expanded={open === "verify"}
                aria-controls={f("verify-panel")}
                onClick={() => toggle("verify")}
              >
                {verification.state.verified ? "다시 확인" : "확인하기"}
              </button>
            </div>
            {open === "verify" && (
              <div className={s.panel} id={f("verify-panel")}>
                <VerificationPanel state={verification.state} rows={verification.rows} apiPlatforms={verification.apiPlatforms} />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={s.grp} aria-labelledby={f("sec2")} data-ca-group="notify">
        <h2 className={s.nm} id={f("sec2")}>
          알림
        </h2>
        <div className={s.rows}>
          {/* 스위치 이름은 팬 계정 설정과 같다(design-rules 12절 「계정 설정」) */}
          <Switch
            id={f("n1")}
            title="카카오 알림톡으로 받기"
            desc="그 밖의 소식을 카카오톡으로 받아요."
            on={alarm.kakao}
            busy={saving}
            describedBy={f("must")}
            onChange={(v) => void toggleNotify("kakao", v)}
          />
          <Switch
            id={f("n2")}
            title="이메일로 받기"
            desc="같은 소식을 확인된 이메일로 받아요."
            on={alarm.email}
            busy={saving}
            describedBy={f("must")}
            onChange={(v) => void toggleNotify("email", v)}
          />
          {/* 꼭 가는 알림(승인 요청·돌려보내는 선물 등)은 두 칸을 꺼도 간다(notifications INV-N6 표, 2026-10-12 문제집 D7) — 접지 않고 늘 보인다(my-account INV-A11) */}
          <MustDeliverNotice
            audience="creator"
            id={f("must")}
            className={s.must}
            titleClassName={s.mustT}
            bodyClassName={s.mustL}
            extra={`승인 요청은 놓치면 ${APPROVAL_DEADLINE_DAYS}일 뒤 자동으로 반려돼요.`}
          />
          {/* 저장 결과 — 바뀐 스위치 가까이, 알림 묶음 끝. 실패는 alert, 성공은 status 두 줄(팬 계정 설정과 같다).
              늘 두고 글자만 바꾼다(빈 칸은 공통 .err:empty·.okmsg:empty) */}
          <div className={s.msgs} data-ca-msg="">
            <p className={`err ${s.msg}`} role="alert">
              {msg && !msg.ok ? msg.text : ""}
            </p>
            <p className={`okmsg ${s.msg}`} role="status">
              {msg?.ok ? msg.text : ""}
            </p>
          </div>
        </div>
      </section>

      <p className={s.more} role="note">
        받는 주소 · 차단한 팬 · 받기 설정은{" "}
        <Link className={s.moreLink} href={`${CREATOR_SETTINGS}#more`}>
          상세 설정
        </Link>
        에 있어요.
      </p>

      <div className={s.quit} data-ca-group="leave">
        <div className={s.row}>
          <p className={s.txt}>
            <span className={s.k}>회원 탈퇴</span>
            <span className={s.sub}>계정과 프로필을 삭제해요</span>
          </p>
          <button
            className={`btn btn--sm ${s.danger}`}
            type="button"
            aria-expanded={open === "leave"}
            aria-controls={f("leave-panel")}
            onClick={() => toggle("leave")}
          >
            탈퇴하기
          </button>
        </div>
        {open === "leave" && (
          <div className={s.panel} id={f("leave-panel")}>
            <Link className="btn btn--line btn--sm" href="/support">
              탈퇴 문의
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
