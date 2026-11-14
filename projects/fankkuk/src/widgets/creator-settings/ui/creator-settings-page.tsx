"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { BlockedFan } from "@/entities/creator/api/blocked-senders";
import { formatDate } from "@/shared/lib/format/datetime";
import { statusTagClass } from "@/shared/ui/status-tone";
import type { MySignatureLink } from "@/entities/creator/api/signature-link-reads";
import { CREATOR_SIGNATURE_LINK } from "@/entities/session/model/home-path";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import { ADDRESS_KEY_MISSING_TEXT } from "@/features/creator-address/ui/address-copy";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { sendUnblock } from "@/features/creator-unblock/api/send-unblock";
import { isResting, type CalendarDate, type MyCreatorReceiving } from "@/entities/creator/model/receiving";
import { ReceivingSection } from "./receiving-section";
import { HardItemsSection } from "./hard-items-section";
import type { MyHardItems } from "@/entities/gift-item/model/hard-items";
import { SettingsIconSvg, type SettingsIcon } from "./settings-icons";
import s from "./creator-settings.module.css";

// 2026-11-13 같은 날 사용자 지시: 이 화면 이름을 「계정 설정」으로 바꾸고(주소 /creator/settings 그대로) 선물 받기 설정들 뒤에 「보안」(비밀번호 · 휴대폰 번호)과
// 「회원 탈퇴」를 같은 접힌 칸 모양으로 둔다(#security · #leave). 두 칸의 안쪽은 앱 레이어가 넘긴다(widgets/creator-account 의 부품 — 위젯끼리 import 하지 않는다).
// 2026-11-13 재분류(UX 명세 creator-profile, DECISIONS 같은 날): 팬덤 구역(팬덤 이름·팬마크·테마 색)과 선물 링크 주소는 프로필 수정 「채널」 탭으로 옮겼다 —
// 이 화면에는 승인 서명 줄·주소 설정·받기 설정·차단한 팬·보안·회원 탈퇴가 남는다(X 공유 설정은 2026-11-14 없앰, 생일과 기념일은 같은 날 프로필 탭으로).
// 본인 확인·알림·계정 보안은 크리에이터 계정 설정(/creator/account, widgets/creator-account)으로 옮겼다(2026-10-16).
// 사이드바 「주소 관리」 줄은 없어졌고(12절) 주소 설정은 이 화면의 접힌 칸이다. 옛 주소(/creator/settings#address · #blocked …)로 오면
// 그 칸을 감싼 접힌 칸을 펼친다 — 주소 끝 #이름이 가리키는 요소의 바깥 접힌 칸을 연다.
// 공개 이름·한 줄 소개·사진·태그·찾기 노출은 「프로필 수정」(/creator/profile)으로 옮겼다.
//
// 주소 등록·변경(address-protection INV-P13): 확인 창에서 주소를 입력하고 「카카오톡으로 서명하기」를 누르면 이 브라우저에서 봉인해 보낸다.
// 카카오 재서명 자리는 지금 로컬 가짜 서명 창구가 맡고(카드 d28), 운영에서는 서버가 창구가 없어 거부한다.
// 「등록됨」은 서버에 저장된 뒤에만 바뀐다. 처음 그리는 값은 DB 읽기 함수(my_creator_address_status)의 등록 여부다.
// 차단 풀기는 로그인 세션으로 저장한다(decline-block INV-D10, 카드 d26) — 풀어도 주소는 열리지 않고, 새 선물은 건마다 서명 승인이 있어야 나간다.
// 주소는 값을 받지 않는다 — 「등록돼 있는가」만 보여 준다.
// 채널 본인 확인 여부(creator-verification)는 선물 링크 칸이 쓴다(확인 전이면 링크를 만들 수 없다).

type SheetState = { kind: "address" } | { kind: "unblock"; fan: BlockedFan } | null;

/** 접힌 칸 · 승인 서명 줄 오른쪽 상태 뱃지(점 + 글자, design-rules 41절) — 초록 완료 · 노랑 쉬는 중 · 회색 아직 */
function StateBadge({ tone, text }: { tone: "success" | "warn" | "plain"; text: string }) {
  return <span className={statusTagClass(tone, `tag--dot ${s.badge}`)}>{text}</span>;
}

/** 칸 앞 하늘 동그라미 아이콘(40) — 접힌 칸이 펼쳐지면 하늘색 채움(시안 settings-account-20261113 .row-ico, 2026-11-14 사용자 「아이콘 넣기」) */
function RowIcon({ name }: { name: SettingsIcon }) {
  return (
    <span className={s.rowIco} aria-hidden="true">
      <SettingsIconSvg name={name} className={s.rowIcoSvg} />
    </span>
  );
}

/** 접힌 칸 하나 — 시안 .fold(아이콘 · 제목 · 오른쪽 짧은 상태 · 화살표). 상태가 글자면 흐린 글자, 뱃지면 그대로.
 *  칸들은 흰 카드 한 장(.acc) 안에 가는 줄로 이어 붙는다 — 칸마다 카드를 두지 않는다(design-prompt 6-5 1) */
function Fold({ id, icon, title, meta, children }: { id?: string; icon: SettingsIcon; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <details className={s.fold} id={id}>
      <summary>
        <RowIcon name={icon} />
        <span className={s.foldName} data-fold-name="">
          {title}
        </span>
        {typeof meta === "string" ? <span className={s.foldMeta}>{meta}</span> : (meta ?? null)}
        <svg className={s.foldChev} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.foldBody}>{children}</div>
    </details>
  );
}

/** 주소 끝 #이름이 접힌 칸 안(또는 접힌 칸 자체)을 가리키면 그 칸을 펼치고 그 자리로 간다 — 옛 링크(#address · #blocked …)를 위해. */
function useOpenFoldForHash(): void {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      const fold = target?.closest("details");
      if (!target || !fold) return;
      fold.open = true;
      target.scrollIntoView({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
}

export function CreatorSettingsPage({
  address,
  sealingKeyPem,
  blockedFans,
  receiving,
  hardItems,
  today,
  signatureLink,
  security,
  leave,
}: {
  /** 「보안」 접힌 칸 안쪽 — 비밀번호 · 휴대폰 번호 줄(앱 레이어가 넘긴다) */
  security: ReactNode;
  /** 「회원 탈퇴」 접힌 칸 안쪽 — 탈퇴 문의 링크 */
  leave: ReactNode;
  /** 승인 서명 연결 여부와 연결한 때(approval-signature INV-S16) — 등록한 이름·생년월일·번호는 오지 않는다 */
  signatureLink: MySignatureLink;
  /** 받는 상태 — 로그인한 크리에이터 본인 것(creator-receiving). 팬당 한도는 2026-11-14 없앰, 생일·기념일은 같은 날 프로필 탭으로 */
  receiving: MyCreatorReceiving;
  /** 살아 있는 받기 어려운 품목 — 로그인한 크리에이터 본인 것(hard-items). 없거나 끝났으면 null */
  hardItems: MyHardItems | null;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다(다시 받는 날 범위) */
  today: CalendarDate;
  address: MyAddressStatus;
  /** 주소 봉인 공개키(PEM). 없으면 주소 입력 대신 안내만 보인다. */
  sealingKeyPem: string | null;
  blockedFans: readonly BlockedFan[];
}) {
  const router = useRouter();
  useOpenFoldForHash();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [addressRegistered, setAddressRegistered] = useState(address.registered);
  // 등록한 주소의 이름표와 바꾼 날 — 주소 자체는 본인에게도 보이지 않는다(address-protection INV-P16)
  const [addressOnFile, setAddressOnFile] = useState({ label: address.label, updatedAt: address.updatedAt });
  // 저장된 뒤에만 띄우는 확인 문구 — 바꾼 뒤에도 같은 「등록됨」이라 문구가 없으면 바뀌었는지 알 수 없다
  const [addressMsg, setAddressMsg] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(blockedFans);
  const [saving, setSaving] = useState(false);
  const [unblockError, setUnblockError] = useState<string | null>(null);

  // 서버에 저장된 뒤에만 목록에서 뺀다. 실패하면 창을 닫지 않고 이유를 보인다.
  const confirmUnblock = async (fan: BlockedFan) => {
    if (saving) return;
    setSaving(true);
    setUnblockError(null);
    const r = await sendUnblock(fan.blockId);
    setSaving(false);
    if (r.kind === "ok") {
      setBlocked((list) => list.filter((f) => f.blockId !== fan.blockId));
      setSheet(null);
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setUnblockError(r.kind === "refused" ? r.message : "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  };

  return (
    <div className={s.root}>
      <header className="page-head">
        <h1 className="ph-title" id="settings-h">
          계정 설정
        </h1>
        {/* 화면에 나오는 순서대로 — 카카오톡 인증 알림 줄 → 주소 설정 → 받기 설정(선물 받기 · 받기 어려운 선물) → 차단한 팬 → 보안 → 회원 탈퇴 */}
        <p className="ph-desc">카카오톡 인증 알림·주소 설정·선물 받기·차단한 팬·보안·회원 탈퇴를 관리합니다.</p>
      </header>

      <div className={s.page}>
        {/* 이 묶음이 화면 전체다(팬덤이 빠지고 보안·회원 탈퇴가 들어옴) — 따로 제목을 두지 않고 h1 「계정 설정」으로 이름을 읽는다(2026-11-13 ux 리뷰).
            시안 settings-account-20261113: 카카오톡 인증 알림 상태 줄 한 장 → 선물 받는 설정 셋(흰 카드 한 장, 가는 줄) → 보안·회원 탈퇴(카드 한 장), 덩어리 사이 32 */}
        <section id="more" className={s.group} aria-labelledby="settings-h">
          {/* 승인 서명 줄(UX 명세 signup.md 「크리에이터 설정 — 승인 서명 줄」, 시안 v43-signup/creator-settings-signature) — 묶음 맨 위, 접는 칸이 아니라 상태 줄 하나.
              연결 전: 누르면 승인 서명 연결 카드로(장애 대비 길로 가입한 크리에이터, signup INV-U20). 연결됨: 연결한 날과 「다시 연결」. 등록한 값은 다시 보이지 않는다(INV-S16) */}
          {signatureLink.linked ? (
            <div className={s.linkRow} data-signature-link="linked">
              <RowIcon name="chat" />
              <span className={s.foldName}>카카오톡 인증 알림</span>
              <StateBadge tone="success" text="연결됨" />
              {signatureLink.linkedAt ? <span className={s.foldMeta}>{formatDate(signatureLink.linkedAt)}</span> : null}
              <Link className="btn btn--line btn--sm" href={CREATOR_SIGNATURE_LINK}>
                다시 연결
              </Link>
            </div>
          ) : (
            <Link className={`${s.linkRow} ${s.linkRowGo}`} href={CREATOR_SIGNATURE_LINK} data-signature-link="unlinked">
              <RowIcon name="chat" />
              <span className={s.foldName}>카카오톡 인증 알림 연결</span>
              <StateBadge tone="plain" text="연결 전" />
              <svg className={s.foldChev} viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          )}

          <div className={s.acc}>
            <Fold id="address" icon="pin" title="주소 설정" meta={addressRegistered ? <StateBadge tone="success" text="등록됨" /> : <StateBadge tone="plain" text="등록 전" />}>
              <div className={s.note}>
                <img className={`asset ${s["addr-ico"]}`} src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={56} height={56} />
                <div className={s.noteText}>
                  <p className="t-strong">{addressRegistered ? "주소 등록 완료" : "등록된 주소 없음"}</p>
                  {addressRegistered ? <p data-address-on-file="">{addressOnFileText(addressOnFile)}</p> : null}
                  <p className={`t-meta ${s["body-gap"]}`}>{addressRegistered
                      ? "주소는 암호화해 보관합니다. 선물 승인 후 배송에 필요한 경우에만 확인합니다."
                      : "등록한 주소는 암호화해 보관합니다. 선물 승인 후 배송에 필요한 경우에만 확인합니다."}</p>
                </div>
              </div>
              <div className={s.grpF}>
                <p className="t-meta">{addressRegistered ? "송장 출력 전인 선물부터 변경된 주소로 배송됩니다." : "송장 출력 전인 선물부터 등록한 주소로 배송됩니다."}</p>
                <p className="t-meta">팬꾹은 채팅·이메일·전화로 주소를 요청하지 않습니다. 주소 재입력을 요구하는 연락에 응답하지 마세요.</p>
              </div>
              <div>
                <div className={s.actions}>
                  <button
                    className="btn btn--line"
                    type="button"
                    onClick={() => {
                      setAddressMsg(null);
                      setSheet({ kind: "address" });
                    }}
                  >
                    {addressRegistered ? "주소 변경" : "주소 등록"}
                  </button>
                </div>
                <p className={`okmsg ${s.msg}`} role="status">
                  {addressMsg ?? ""}
                </p>
              </div>
            </Fold>

            <Fold id="receiving" icon="gift" title="받기 설정" meta={isResting(receiving.resumeOn, today) ? <StateBadge tone="warn" text="쉬는 중" /> : <StateBadge tone="success" text="받는 중" />}>
              <ReceivingSection initial={receiving} today={today} />
              <HardItemsSection initial={hardItems} today={today} />
            </Fold>

            <Fold id="blocked" icon="ban" title="차단한 팬" meta={`${blocked.length}명`}>
              {blocked.length === 0 ? (
                <p className="t-meta">차단한 팬이 없습니다.</p>
              ) : (
                <ul className={s.fans}>
                  {blocked.map((f, i) => (
                    <li key={f.blockId}>
                      <FaceAvatar index={i} className={s.face} />
                      <div className={s.fanWho}>
                        <p className={`t-strong ${s.fanName}`}>{f.fanNickname}</p>
                        <p className="t-meta">{formatDate(f.blockedAt)} 차단</p>
                      </div>
                      <button
                        className="btn btn--line btn--sm"
                        type="button"
                        aria-label={`${f.fanNickname}님 차단 해제`}
                        onClick={() => {
                          setUnblockError(null);
                          setSheet({ kind: "unblock", fan: f });
                        }}
                      >
                        차단 해제
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="t-meta">차단을 해제해도 주소는 공개되지 않습니다. 새 선물은 건별로 카카오톡 서명을 거쳐 승인해야 배송됩니다.</p>
            </Fold>
          </div>

          {/* 선물 받기 설정들 뒤 — 보안 · 회원 탈퇴(2026-11-13 프로필 수정 「계정」 탭에서 옮김). 같은 접힌 칸 모양, 선물 설정과 다른 카드 한 장(여백 32로 나눔) */}
          <div className={s.acc}>
            <Fold id="security" icon="shield" title="보안">
              {security}
            </Fold>
            <Fold id="leave" icon="out" title="회원 탈퇴">
              {leave}
            </Fold>
          </div>
        </section>
      </div>

      <BottomSheet
        open={sheet !== null}
        title={sheet?.kind === "unblock" ? `${sheet.fan.fanNickname}님의 차단을 해제할까요?` : addressRegistered ? "주소를 바꿀까요?" : "주소를 등록할까요?"}
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === "unblock" ? (
          <>
            <p>차단을 해제하면 이 팬이 다시 선물을 보낼 수 있습니다. 기존 선물의 처리 상태는 변경되지 않습니다.</p>
            <p className={`t-meta ${s["sheet-sub"]}`}>새 선물도 건별로 카카오톡 서명을 거쳐 승인해야 배송을 위해 주소를 확인할 수 있습니다.</p>
            {unblockError ? (
              <p className={`err ${s["sheet-err"]}`} role="alert">
                {unblockError}
              </p>
            ) : null}
            <div className={s["sheet-btns"]}>
              <button className="btn btn--line" type="button" onClick={() => setSheet(null)}>
                취소
              </button>
              <button className="btn" type="button" aria-disabled={saving} onClick={() => void confirmUnblock(sheet.fan)}>
                {saving ? "저장 중…" : "차단 해제"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>주소 {addressRegistered ? "변경" : "등록"}에는 카카오톡 인증서 서명이 필요합니다. 로그인만으로는 처리할 수 없습니다.</p>
            <p className={`t-meta ${s["sheet-sub"]}`}>
              {addressRegistered
                ? "새 주소는 입력한 기기에서 암호화한 뒤 전송합니다. 송장 출력 전인 선물부터 변경된 주소로 배송됩니다."
                : "주소는 입력한 기기에서 암호화한 뒤 전송합니다. 송장 출력 전인 선물부터 등록한 주소로 배송됩니다."}
            </p>
            {sealingKeyPem ? (
              <AddressChangeForm
                creatorId={address.creatorId}
                sealingKeyPem={sealingKeyPem}
                initialLabel={addressOnFile.label}
                onSaved={(label) => {
                  // 서버에 저장된 뒤에만 「등록됨」으로 바꾼다
                  setAddressMsg(addressRegistered ? "주소가 변경되었습니다." : "주소가 등록되었습니다.");
                  setAddressRegistered(true);
                  setAddressOnFile({ label, updatedAt: new Date().toISOString() });
                  setSheet(null);
                  router.refresh();
                }}
                onCancel={() => setSheet(null)}
                onLoginExpired={() => router.push("/login")}
              />
            ) : (
              <>
                <p className={`err ${s["sheet-err"]}`} role="status">
                  {ADDRESS_KEY_MISSING_TEXT}
                </p>
                <div className={s["sheet-btns"]}>
                  <button className="btn btn--line" type="button" onClick={() => setSheet(null)}>
                    취소
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  );
}
