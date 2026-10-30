"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import type { MyAccount } from "@/entities/fan/model/my-account";
import { MustDeliverNotice } from "@/entities/notification/ui/must-deliver-notice";
import { FAN_PROFILE_EDIT } from "@/entities/session/model/home-path";
import { postAccount } from "@/features/account-edit/api/save-account-client";
import { sendFanAddressDelete } from "@/features/fan-address/api/send-fan-address";
import { FanAddressForm } from "@/features/fan-address/ui/fan-address-form";
import { planAccountSettingsSave } from "@/features/account-edit/model/settings-input";
import { PasswordChangePanel } from "@/features/password-change/ui/password-change-panel";
import { PhoneChangePanel } from "@/features/phone-change/ui/phone-change-panel";
import { ADDRESS_KEY_MISSING_TEXT } from "@/shared/ui/sealed-address-form";
import s from "./my-info.module.css";

// 팬 계정 설정(design-rules 27절 「계정 설정(팬)」, 2026-10-22 카드 d114 · 시안 docs/design/mockups/site/pilot-2026-10-22/me.html).
// 카드 없이 880 기둥 안 12열 4 + 8 묶음 넷 — 왼쪽 구간 이름, 오른쪽 줄(버튼은 줄 오른쪽). 순서는
// 보안 → 받을 주소 → 개인정보(아이디·이메일) → 알림 → 저장 줄 → 회원 탈퇴. 저장하기가 보내는 이메일·알림을 저장 줄 바로 위에 둔다.
// 지금 있는 기능만 옮겨 담았다:
// - 비밀번호 변경(session-login INV-L12)·번호 변경(카카오 재인증, signup INV-U12)은 「변경」을 눌러야 그 줄 아래에 칸이 펼쳐진다. 두 칸은 저장과 따로 서버에 보낸다.
// - 이메일·알림 둘은 아래 「저장」으로 보낸다(/api/me). 이메일은 바로 바뀌지 않고 확인 메일의 링크를 눌러야 바뀐다(my-account INV-A7).
//   닉네임은 프로필 수정 화면에서 고친다 — 여기서는 지금 값을 그대로 실어 보낸다(내 정보 저장이 닉네임 칸을 같이 받는다).
// - 회원 탈퇴는 다른 줄처럼 「탈퇴 안내」를 눌러야 펼쳐진다(문의만으로 삭제가 끝나는 것처럼 보이지 않게, 문구 다듬은본 10-26). 탈퇴 기능이 아직 없어 펼친 안에는 고객센터로 가는 링크만 둔다.
// - 알림 스위치 설명은 시안의 스위치별 문구 그대로다. 시안에 없는 안내 문구는 두지 않는다(2026-10-16 사용자 — 문구 남발 금지).
//   「아이디는 바꿀 수 없어요 …」 문장은 머리 설명·「프로필 수정」 버튼과 겹쳐 뺐다(카드 d114).
// 「되돌리기」는 폼 기본 동작(reset)으로 처음 값에 돌아가고, 알림 스위치도 처음 값으로 돌린다.
// - 받을 주소(address-protection INV-P17, 2026-10-17 카드 d100): 크리에이터 설정의 받는 주소와 같은 흐름 — 주소는 다시 보이지 않고 이름표와 등록한 날만.
//   「등록/변경」을 누르면 그 줄 아래에 입력 칸이 펼쳐지고, 저장은 아래 저장하기와 따로 서버에 보낸다(이 브라우저에서 봉인한 값만).
//   주소 입력도 폼이라 폼 안에 폼이 들어가지 않게, 계정 저장 폼은 아래 저장 줄만 감싸고 이메일 칸은 form 속성으로 그 폼에 붙인다.

type Notice = { tone: "ok" | "error"; text: string } | null;
type Reveal = "phone" | "password" | "leave" | "address" | "address-delete";

// 줄 전체가 누르는 칸(높이 64) — 스위치 버튼 안에 이름·설명을 넣고, 이름은 지금처럼 aria-labelledby 로 붙인다
function Switch({ id, title, desc, on, onChange }: { id: string; title: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={s.item}>
      <button className={s.swBtn} type="button" role="switch" aria-checked={on} aria-labelledby={`${id}-l`} onClick={() => onChange(!on)}>
        <span className={s.txt} id={`${id}-l`}>
          <span className={s.k}>{title}</span>
          <span className={s.sub}>{desc}</span>
        </span>
        <span className={s.trk} aria-hidden="true" />
      </button>
    </div>
  );
}

export function MyInfoPanel({
  account,
  accountId,
  address,
  sealingKeyPem,
}: {
  account: MyAccount;
  /** 로그인한 팬의 계정 ID — 받을 주소를 봉인할 때 묶는다(INV-P17) */
  accountId: string;
  /** 받을 주소 상태. 읽지 못했으면 null — 그 줄만 안내로 바뀐다 */
  address: MyFanAddressStatus | null;
  /** 주소 봉인 공개키(PEM). 없으면 입력 대신 안내만 보인다 */
  sealingKeyPem: string | null;
}) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [open, setOpen] = useState<Reveal | null>(null);
  const [addressOnFile, setAddressOnFile] = useState(address);
  const [addressMsg, setAddressMsg] = useState<Notice>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [kakao, setKakao] = useState(account.notifyKakao);
  const [mail, setMail] = useState(account.notifyEmail);
  const [instant, setInstant] = useState(account.notifyInstant);
  const toggle = (which: Reveal) => {
    if (which === "address" || which === "address-delete") setAddressMsg(null);
    setOpen((cur) => (cur === which ? null : which));
  };
  const toLogin = () => router.push("/login?next=/me");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const form = new FormData(e.currentTarget);
    // 닉네임은 이 화면에서 고치지 않는다 — 지금 값을 그대로 싣는다(planAccountSettingsSave)
    const plan = planAccountSettingsSave({ nickname: account.nickname, email: String(form.get("email") ?? ""), notifyKakao: kakao, notifyEmail: mail, notifyInstant: instant });
    if (!plan.ok) return setNotice({ tone: "error", text: plan.message });
    setSaving(true);
    setNotice(null);
    const outcome = await postAccount(plan.input);
    setSaving(false);
    if (outcome.kind === "login") return toLogin();
    if (outcome.kind === "failed") return setNotice({ tone: "error", text: outcome.message });
    setNotice({
      tone: "ok",
      text: outcome.pendingEmail ? `저장되었습니다. 새 이메일(${outcome.pendingEmail})로 확인 메일을 보냈습니다.` : "저장되었습니다.",
    });
    router.refresh();
  };

  const deleteAddress = async () => {
    if (addressBusy) return;
    setAddressBusy(true);
    const outcome = await sendFanAddressDelete();
    setAddressBusy(false);
    if (outcome.kind === "login") return toLogin();
    if (outcome.kind !== "ok") {
      return setAddressMsg({ tone: "error", text: outcome.kind === "refused" ? outcome.message : "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    setAddressOnFile({ registered: false, label: null, updatedAt: null });
    setOpen(null);
    setAddressMsg({ tone: "ok", text: "받을 주소가 삭제되었습니다." });
    router.refresh();
  };

  const addressRegistered = addressOnFile?.registered ?? false;

  return (
    <div className={s.wrap}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title" id={f("h")}>
            계정 설정
          </h1>
          <Link className="btn btn--line btn--sm" href={FAN_PROFILE_EDIT}>
            프로필 수정
          </Link>
        </div>
        <p className="ph-desc">보안·받을 주소·알림을 관리합니다. 닉네임은 ‘프로필 수정’에서 변경해 주세요.</p>
      </header>

      <section className={s.grp} aria-labelledby={f("sec1")} data-me-group="security">
        <h2 className={s.nm} id={f("sec1")}>
          보안
        </h2>
        <div className={s.rows}>
          <div className={s.item}>
            <div className={s.row}>
              <p className={s.txt}>
                <span className={s.k}>비밀번호</span>
              </p>
              <button className="btn btn--line btn--sm" type="button" aria-expanded={open === "password"} aria-controls={f("pw-panel")} onClick={() => toggle("password")}>
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
                <span className={s.k} id={f("tel-l")}>
                  휴대폰 번호
                </span>
                <span className={s.v}>{account.phoneMasked ?? "등록된 번호 없음"}</span>
              </p>
              <button className="btn btn--line btn--sm" type="button" aria-expanded={open === "phone"} aria-controls={f("tel-panel")} onClick={() => toggle("phone")}>
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
      </section>

      <section className={s.grp} aria-labelledby={f("sec-addr")} data-me-group="address">
        <h2 className={s.nm} id={f("sec-addr")}>
          받을 주소
        </h2>
        <div className={s.rows}>
          <div className={s.item}>
            <div className={s.row}>
              <p className={s.txt}>
                <span className={s.v} data-address-on-file="">
                  {addressOnFile === null ? "주소 정보를 불러오지 못했습니다" : addressRegistered ? addressOnFileText(addressOnFile) : "등록된 주소 없음"}
                </span>
              </p>
              {addressOnFile !== null ? (
                <div className={s.act}>
                  <button className="btn btn--line btn--sm" type="button" aria-expanded={open === "address"} aria-controls={f("addr-panel")} onClick={() => toggle("address")}>
                    {addressRegistered ? "변경" : "등록"}
                  </button>
                  {addressRegistered ? (
                    <button
                      className="btn btn--line btn--sm"
                      type="button"
                      aria-expanded={open === "address-delete"}
                      aria-controls={f("addr-del-panel")}
                      onClick={() => toggle("address-delete")}
                    >
                      삭제
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {open === "address" && (
              <div className={s.panel} id={f("addr-panel")}>
                {sealingKeyPem ? (
                  <FanAddressForm
                    accountId={accountId}
                    sealingKeyPem={sealingKeyPem}
                    initialLabel={addressOnFile?.label ?? null}
                    autoFocusFirst
                    onSaved={(label) => {
                      // 서버에 저장된 뒤에만 바뀐다 — 「등록한 날」은 다음에 화면을 열면 서버에 저장된 시각으로 바뀐다
                      setAddressMsg({ tone: "ok", text: addressRegistered ? "받을 주소가 변경되었습니다." : "받을 주소가 등록되었습니다." });
                      setAddressOnFile({ registered: true, label, updatedAt: new Date().toISOString() });
                      setOpen(null);
                      router.refresh();
                    }}
                    onCancel={() => setOpen(null)}
                    onLoginExpired={toLogin}
                  />
                ) : (
                  <p className="err" role="status">
                    {ADDRESS_KEY_MISSING_TEXT}
                  </p>
                )}
              </div>
            )}
            {open === "address-delete" && (
              <div className={s.panel} id={f("addr-del-panel")}>
                <p className={s.sub}>이미 ‘받기’를 누른 선물은 당시 등록된 주소로 배송됩니다.</p>
                <div className={`btnrow ${s.panelBtns}`}>
                  <button className="btn btn--line btn--sm" type="button" onClick={() => setOpen(null)}>
                    취소
                  </button>
                  <button
                    className={`btn btn--sm ${s.danger}`}
                    type="button"
                    aria-disabled={addressBusy || undefined}
                    aria-busy={addressBusy || undefined}
                    onClick={() => void deleteAddress()}
                  >
                    {addressBusy ? "삭제 중…" : "주소 삭제"}
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className={`${addressMsg?.tone === "error" ? "err" : "okmsg"} ${s.msg}`} role="status">
            {addressMsg?.text ?? ""}
          </p>
        </div>
      </section>

      <section className={s.grp} aria-labelledby={f("sec2")} data-me-group="personal">
        <h2 className={s.nm} id={f("sec2")}>
          개인정보
        </h2>
        {/* 저장 뒤 서버 값이 바뀌면 입력칸을 새로 그려 처음 값을 서버 값에 맞춘다 — 안 그러면 방금 적은 새 주소가 칸에 남아
            다음 저장이 같은 주소를 또 보낸다(2026-10-02 code-reviewer). */}
        <div className={s.rows} key={`${account.email ?? ""}|${account.pendingEmail ?? ""}`}>
          <div className={s.item}>
            <dl className={`${s.row} ${s.txt}`}>
              <dt className={s.k}>아이디</dt>
              <dd className={s.v}>{account.loginId}</dd>
            </dl>
          </div>
          <div className={`${s.item} ${s.fieldRow}`}>
            <label className={s.k} htmlFor={f("mail")}>
              이메일
            </label>
            <input
              className="field"
              id={f("mail")}
              form={f("form")}
              name="email"
              type="email"
              defaultValue={account.email ?? ""}
              maxLength={254}
              required
              autoComplete="email"
              aria-describedby={f("mail-h")}
            />
            <p className={s.sub} id={f("mail-h")}>
              {account.pendingEmail
                ? `새 이메일(${account.pendingEmail})로 확인 메일을 보냈습니다. 메일의 링크에서 확인을 마치면 변경됩니다.`
                : "새 이메일로 확인 메일을 발송합니다. 메일의 링크에서 확인을 마치면 변경됩니다."}
            </p>
          </div>
        </div>
      </section>

      <section className={s.grp} aria-labelledby={f("sec3")} data-me-group="notify">
        <h2 className={s.nm} id={f("sec3")}>
          알림
        </h2>
        <div className={s.rows}>
          <Switch id={f("n1")} title="카카오톡 알림" desc="승인·배송 등 선물 관련 알림톡 수신" on={kakao} onChange={setKakao} />
          <Switch id={f("n2")} title="이메일 알림" desc="영수증·안내 메일 수신" on={mail} onChange={setMail} />
          {/* 상태 알림 다섯은 기본이 하루 한 번 묶음(notification-batching INV-NB5, UX 명세 notify-settings) */}
          <Switch id={f("n3")} title="선물 소식 바로 받기" desc="끄면 하루 한 번 오후 7시에 모아서 보냅니다" on={instant} onChange={setInstant} />
          {/* 꼭 가는 알림은 두 칸을 꺼도 간다(notifications INV-N6 표, 2026-10-12 문제집 D7) — 접지 않고 늘 보인다(my-account INV-A11) */}
          <MustDeliverNotice audience="fan" id={f("noti-must")} className={s.must} titleClassName={s.mustT} bodyClassName={s.mustL} />
        </div>
      </section>

      {/* 저장 줄 — 저장하기가 보내는 이메일·알림 바로 아래. 767 이하에서는 화면 아래에 붙는다.
          알림 칸은 늘 두고 글자만 바꾼다 — 칸이 새로 생기면 화면 읽기 프로그램이 읽지 않는 경우가 있다. */}
      <form className={s.end} id={f("form")} onSubmit={onSubmit} aria-labelledby={f("h")} data-me-save="">
        <p className={`err ${s.msg}`} role="alert">
          {notice?.tone === "error" ? notice.text : ""}
        </p>
        <p className={`okmsg ${s.msg}`} role="status">
          {notice?.tone === "ok" ? notice.text : ""}
        </p>
        <div className={`btnrow ${s.btns}`}>
          <button
            className="btn btn--text"
            type="reset"
            onClick={() => {
              setNotice(null);
              setKakao(account.notifyKakao);
              setMail(account.notifyEmail);
              setInstant(account.notifyInstant);
            }}
          >
            되돌리기
          </button>
          <button className="btn" type="submit" aria-disabled={saving} aria-busy={saving}>
            {saving ? "저장 중" : "저장"}
          </button>
        </div>
      </form>

      <div className={s.quit} data-me-group="leave">
        <div className={s.row}>
          <p className={s.txt}>
            <span className={s.k}>회원 탈퇴</span>
            <span className={s.sub}>탈퇴 문의 및 절차 안내</span>
          </p>
          <button className={`btn btn--sm ${s.danger}`} type="button" aria-expanded={open === "leave"} aria-controls={f("leave-panel")} onClick={() => toggle("leave")}>
            탈퇴 안내
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
