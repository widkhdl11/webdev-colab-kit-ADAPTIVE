"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type {
  MyVerification,
  MyVerificationState,
} from "@/entities/creator/model/creator-verification";
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
import { CREATOR_CHANNEL_CREATE_PATH } from "@/shared/config/creator-paths";
import panel from "@/shared/ui/settings-panel.module.css";
import s from "./creator-account.module.css";

// 2026-11-13 재분류(UX 명세 creator-profile, DECISIONS 같은 날): 이 화면은 「알림 설정」으로 이름을 바꿔 알림만 남는다(주소 /creator/account 그대로).
// 보안(비밀번호·휴대폰 번호)·회원 탈퇴는 계정 설정(옛 상세 설정, /creator/settings)의 접힌 칸으로, 채널 소유자 확인은 프로필 수정 「채널」 탭으로 옮겼다
// (같은 날 사용자 지시로 프로필 수정 「계정」 탭을 없앰). 아래 구역 부품을 내보내 앱 레이어가 그 화면에 끼운다. 구역 안의 동작·문구는 그대로다.
// 채널 소유자 확인의 겉모양은 공용 settings-panel 판, 보안·회원 탈퇴의 겉모양은 계정 설정의 접힌 칸이 그린다.
// (아래는 옮기기 전 설명)
// 크리에이터 계정 설정(design-rules 27절 「4파트 나머지 다섯 화면」, 2026-10-22 카드 d115 · 시안 docs/design/mockups/site/pilot-2026-10-22/creator-account.html).
// 2026-10-16 사용자 「만들어봐」 — 상세 설정 아래 접힌 「계정」 칸(본인 확인·알림·계정 보안)을 이 화면으로 옮겼다.
// 배치는 계정 설정(팬)과 같다: 카드 없이 880 기둥 안 12열 4 + 8 묶음 둘 — 보안(비밀번호·휴대폰 번호·채널 본인 확인) → 알림
// → 「상세 설정」 안내 줄 → 구분선 → 회원 탈퇴(맨 끝). 탈퇴 하나뿐이던 「개인정보」 카드는 없어졌다. 지금 있는 기능만 옮겨 담았다:
// - 비밀번호 변경(session-login INV-L12)·번호 바꾸기(카카오 재인증, signup INV-U12)·채널 본인 확인(creator-verification)은 버튼을 눌러야 그 줄 아래에 칸이 펼쳐진다.
// - 시안의 이메일·이름 바꾸기, 알림 종류별 스위치 넷은 크리에이터에게 지금 없는 기능이라 두지 않는다 — 알림은 카카오·이메일 두 칸(my-account INV-A11),
//   승인 요청처럼 꼭 가는 알림은 끄는 스위치 없이 「끌 수 없는 알림」으로 알린다(notifications INV-N6). 스위치는 누르는 즉시 저장하고, 실패하면 되돌린다.
// - 회원 탈퇴는 팬 화면과 같이 펼치면 고객센터 문의 링크만(탈퇴 기능이 아직 없다).

type Open = "password" | "phone" | null;
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
  describedBy?: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={`${s.item} ${s.swItem}`}>
      <button
        className={s.swBtn}
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-l`}
        aria-describedby={describedBy}
        aria-disabled={busy}
        // 저장 중 다시 누르기는 저장 함수 맨 앞에서 한 번만 막는다 — 여기서도 막으면 두 장치가 겹쳐 어느 쪽도 시험이 붙들지 못했다
        onClick={() => onChange(!on)}
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

/** 보안 줄 둘 — 비밀번호 · 휴대폰 번호(버튼을 눌러야 그 줄 아래에 칸이 펼쳐진다). 계정 설정(/creator/settings)의 「보안」 접힌 칸 안.
 *  겉모양(접힌 칸 · 제목 「보안」)은 계정 설정 화면이 그린다 — 여기는 줄만. 로그인이 끊기면 계정 설정으로 돌아온다 */
export function CreatorSecurityRows({ phoneMasked }: { phoneMasked: string | null }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const router = useRouter();
  const toLogin = () => router.push(`/login?next=${encodeURIComponent(CREATOR_SETTINGS)}`);
  const [open, setOpen] = useState<Open>(null);
  const toggle = (which: Exclude<Open, null>) =>
    setOpen((cur) => (cur === which ? null : which));
  return (
    <div className={`${s.wrap} ${s.rows}`} data-ca-group="security">
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
            변경
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
            변경
          </button>
        </div>
        {open === "phone" && (
          <div className={s.panel}>
            <PhoneChangePanel id={f("tel-panel")} onLoginExpired={toLogin} onChanged={() => router.refresh()} />
          </div>
        )}
      </div>
    </div>
  );
}

export type CreatorVerificationProps = {
  state: MyVerificationState;
  rows: readonly MyVerification[];
  apiPlatforms: readonly string[];
  /** 로그인 아이디 — 팬꾹 링크 미리 확인용(signup INV-U14) */
  loginId?: string | null;
};

/** 채널 소유자 확인 한 줄 — 줄과 펼친 본문을 부품이 함께 그린다. 프로필 수정 「채널」 탭 */
export function CreatorChannelOwnerRow({ verification }: { verification: CreatorVerificationProps }) {
  const id = useId();
  return (
    // 이름(h2)은 채널 유무에 따라 이 줄 또는 VerificationPanel 이 그린다 — 어느 쪽이든 같은 id 라 판이 그 제목으로 이름을 읽는다
    <section className={`${s.wrap} ${panel.panel}`} aria-labelledby={`${id}-h`} data-ca-group="channel">
      {/* 채널 소유자 확인 — 줄과 펼친 본문을 부품이 함께 그린다(시안 channel-link-verify-20261102 #acct-verified·#acct-recheck, design-rules 42절) */}
      {/* 줄 이름 「채널 소유자 확인」이 곧 판 제목(h2) — 제목을 두 번 두지 않는다 */}
      <div className={`${s.item} ${s.inPanel}`} id="verify">
        {verification.state.name === null ? (
          // signup INV-U21: 채널이 없으면 ①②(팬꾹 링크·채널 주소)를 보이지 않고 채널 만들기로 보낸다(UX 명세 「가입 밖에서 바뀌는 것」)
          <div className={s.row}>
            <div className={s.txt}>
              <h2 className={panel.titleText} id={`${id}-h`}>
                채널 소유자 확인
              </h2>
              <span className={s.v}>채널 없음</span>
            </div>
            <Link className="btn btn--line btn--sm" href={CREATOR_CHANNEL_CREATE_PATH}>
              채널 만들기
            </Link>
          </div>
        ) : (
          <VerificationPanel
            variant="account"
            state={verification.state}
            rows={verification.rows}
            loginId={verification.loginId ?? null}
            titleAs="h2"
            titleClassName={panel.titleText}
            titleId={`${id}-h`}
          />
        )}
      </div>
    </section>
  );
}

/** 회원 탈퇴 — 고객센터 문의 링크만(탈퇴 기능이 아직 없다). 계정 설정의 「회원 탈퇴」 접힌 칸 안 — 접힌 칸을 펼치는 것이 옛 「탈퇴 안내」 버튼을 대신한다 */
export function CreatorLeaveBody() {
  return (
    <div className={s.wrap} data-ca-group="leave">
      <Link className="btn btn--line btn--sm" href="/support">
        탈퇴 문의
      </Link>
    </div>
  );
}

/** 알림 설정(/creator/account) — 알림 묶음 하나(2026-11-13 리뷰: 상세 설정 안내 줄은 명세에 없어 뺐다) */
export function CreatorAccountPage({
  notify,
}: {
  notify: { kakao: boolean; email: boolean; instant: boolean };
}) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const router = useRouter();
  const toLogin = () => router.push(`/login?next=${CREATOR_ACCOUNT}`);
  const [alarm, setAlarm] = useState(notify);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  // 스위치는 누르는 즉시 저장한다. 실패하면 화면 값을 저장된 값으로 되돌린다.
  const toggleNotify = async (key: "kakao" | "email" | "instant", value: boolean) => {
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
      setMsg({ ok: true, text: "알림 설정이 저장되었습니다." });
      return;
    }
    setAlarm(before);
    setMsg({ ok: false, text: r.message });
  };

  return (
    // 2026-11-14 재디자인(시안 settings-account-20261113 #notify · #notify-fail): 폭 --col-form 720, 스위치 셋은 흰 카드 한 장 안 줄 80(줄 전체가 누르는 칸),
    // 저장 결과는 그 카드 안 아래 한 줄, 끌 수 없는 알림은 카드 밖 하늘 상자 + ⓘ 아이콘. 동작·문구는 그대로
    <div className={`${s.wrap} ${s.notifyPage}`}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">알림 설정</h1>
        </div>
        <p className="ph-desc">알림을 관리합니다.</p>
      </header>

      <section className={s.notifyStack} aria-labelledby={f("sec2")} data-ca-group="notify">
        <h2 className={s.secH} id={f("sec2")}>
          알림
        </h2>
        <div className={s.swCard}>
          {/* 스위치 이름은 팬 계정 설정과 같다(design-rules 12절 「계정 설정」) */}
          <Switch
            id={f("n1")}
            title="카카오톡 알림"
            desc="필수 알림 외 소식을 알림톡으로 수신"
            on={alarm.kakao}
            busy={saving}
            describedBy={f("must")}
            onChange={(v) => void toggleNotify("kakao", v)}
          />
          <Switch
            id={f("n2")}
            title="이메일 알림"
            desc="동일한 소식을 확인된 이메일로 수신"
            on={alarm.email}
            busy={saving}
            describedBy={f("must")}
            onChange={(v) => void toggleNotify("email", v)}
          />
          {/* 상태 알림 다섯은 기본이 하루 한 번 묶음(notification-batching INV-NB5, UX 명세 notify-settings) — 필수 알림과 상관없어 안내를 잇지 않는다 */}
          <Switch
            id={f("n3")}
            title="선물 소식 바로 받기"
            desc="끄면 하루 한 번 오후 7시에 모아서 보냅니다"
            on={alarm.instant}
            busy={saving}
            onChange={(v) => void toggleNotify("instant", v)}
          />
          {/* 저장 결과 — 바뀐 스위치 가까이, 스위치 카드 안 아래 한 줄. 실패는 alert, 성공은 status 두 줄(팬 계정 설정과 같다).
              늘 두고 글자만 바꾼다(빈 칸은 공통 .err:empty·.okmsg:empty, 둘 다 비면 줄 자체가 자리를 비운다) */}
          <div className={s.msgs} data-ca-msg="">
            <p className={`err ${s.msg}`} role="alert">
              {msg && !msg.ok ? msg.text : ""}
            </p>
            <p className={`okmsg ${s.msg}`} role="status">
              {msg?.ok ? msg.text : ""}
            </p>
          </div>
        </div>
        {/* 꼭 가는 알림(승인 요청·돌려보내는 선물 등)은 두 칸을 꺼도 간다(notifications INV-N6 표, 2026-10-12 문제집 D7) — 접지 않고 늘 보인다(my-account INV-A11) */}
        <div className={s.must}>
          <span className={s.mustIco} aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </span>
          <MustDeliverNotice
            audience="creator"
            id={f("must")}
            className={s.mustP}
            titleClassName={s.mustT}
            bodyClassName={s.mustL}
            extra={`승인 요청은 ${APPROVAL_DEADLINE_DAYS}일 동안 응답하지 않으면 자동 반려됩니다.`}
          />
        </div>
      </section>
    </div>
  );
}
