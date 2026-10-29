"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { BlockedFan } from "@/entities/creator/api/blocked-senders";
import type { CreatorSettingsView } from "@/entities/creator/model/creator-settings";
import { formatDate } from "@/shared/lib/format/datetime";
import { statusTagClass } from "@/shared/ui/status-tone";
import type { MySignatureLink } from "@/entities/creator/api/signature-link-reads";
import { CREATOR_SIGNATURE_LINK } from "@/entities/session/model/home-path";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import type { MyAddressStatus } from "@/entities/address/api/my-address-status";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import { ADDRESS_KEY_MISSING_TEXT } from "@/features/creator-address/ui/address-copy";
import type { MyVerification, MyVerificationState } from "@/entities/creator/model/creator-verification";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { sendUnblock } from "@/features/creator-unblock/api/send-unblock";
import { isResting, type CalendarDate, type MyCreatorReceiving } from "@/entities/creator/model/receiving";
import { ReceivingSection } from "./receiving-section";
import { HardItemsSection } from "./hard-items-section";
import { LinkSection } from "./link-section";
import { ReplySettingsSection } from "./reply-settings-section";
import { FandomSection, type FandomSectionProps } from "./fandom-section";
import type { ReplySettings } from "@/entities/gift-reply/api/gift-reply-reads";
import type { MyCreatorLink } from "@/entities/creator/api/creator-link-reads";
import type { MyHardItems } from "@/entities/gift-item/model/hard-items";
import s from "./creator-settings.module.css";

// 크리에이터 상세 설정 (design-rules 12절 · 27절, 시안 docs/design/mockups/site/pilot-2026-10-22/settings.html). 틀 폭 1200 — 「팬덤」은 12열 7 + 5, 「주소와 설정」은 880 한 기둥.
// 위에서 아래: 팬덤(팬덤 이름·팬마크·테마 색·미리보기 — fandom-section) → 주소와 설정(접힌 칸: 받는 주소·받기 설정·차단한 팬·선물 링크·감사 답장)
// 본인 확인·알림·계정 보안은 크리에이터 계정 설정(/creator/account, widgets/creator-account)으로 옮겼다(2026-10-16).
// 사이드바 「주소 관리」 줄은 없어졌고(12절) 받는 주소는 이 화면의 접힌 칸이다. 옛 주소(/creator/settings#address · #blocked …)로 오면
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

/** 접힌 칸 하나 — 시안 .fold(제목 · 오른쪽 짧은 상태 · 화살표). */
function Fold({ id, title, meta, children }: { id?: string; title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <details className={s.fold} id={id}>
      <summary>
        <span>{title}</span>
        {meta ? <span className={s.foldMeta}>{meta}</span> : null}
        <svg className={s.foldChev} viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={`stack ${s.foldBody}`}>{children}</div>
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
  settings,
  fandom,
  address,
  sealingKeyPem,
  blockedFans,
  verification,
  receiving,
  hardItems,
  today,
  link,
  replySettings,
  signatureLink,
}: {
  settings: CreatorSettingsView;
  /** 승인 서명 연결 여부와 연결한 때(approval-signature INV-S16) — 등록한 이름·생년월일·번호는 오지 않는다 */
  signatureLink: MySignatureLink;
  /** 팬덤 구간 — 팬덤 이름·테마 색·카드 미리보기에 쓰는 사진 주소(로그인한 크리에이터 본인 것) */
  fandom: FandomSectionProps;
  /** 답장 모음 보이기·X 계정·태그 허용 — 로그인한 크리에이터 본인 것(gift-reply INV-G8) */
  replySettings: ReplySettings;
  /** 링크용 아이디·남은 잠금 날·사진 경로 — 로그인한 크리에이터 본인 것(creator-link) */
  link: MyCreatorLink;
  /** 받는 상태·팬당 한도·생일·기념일 — 로그인한 크리에이터 본인 것(creator-receiving) */
  receiving: MyCreatorReceiving;
  /** 살아 있는 받기 어려운 품목 — 로그인한 크리에이터 본인 것(hard-items). 없거나 끝났으면 null */
  hardItems: MyHardItems | null;
  /** 한국 시간 오늘 — 서버가 정해 넘긴다(다시 받는 날 범위) */
  today: CalendarDate;
  address: MyAddressStatus;
  /** 주소 봉인 공개키(PEM). 없으면 주소 입력 대신 안내만 보인다. */
  sealingKeyPem: string | null;
  blockedFans: readonly BlockedFan[];
  verification: { state: MyVerificationState; rows: readonly MyVerification[]; apiPlatforms: readonly string[] };
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
        <h1 className="ph-title">상세 설정</h1>
        <p className="ph-desc">팬덤·받는 주소·선물 받기·차단한 팬·선물 링크·감사 답장을 관리합니다.</p>
      </header>

      <nav className={s.jump} aria-label="상세 설정 구간">
        <a href="#fandom">팬덤</a>
        <a href="#more">받는 주소·받기 설정·차단한 팬</a>
      </nav>

      <div className={`stack ${s.page}`}>
        <FandomSection {...fandom} />

        <section id="more" className={`${s.group} ${s.more}`} aria-labelledby="more-h">
          <h2 className={s.groupT} id="more-h">
            주소와 설정
          </h2>
          {/* 승인 서명 줄(UX 명세 signup.md 「크리에이터 설정 — 승인 서명 줄」, 시안 v43-signup/creator-settings-signature) — 묶음 맨 위.
              연결 전: 누르면 가입 5단계와 같은 카드로. 연결됨: 연결한 날과 「다시 연결」. 등록한 값은 다시 보이지 않는다(INV-S16) */}
          {signatureLink.linked ? (
            <div className={s.linkRow} data-signature-link="linked">
              <span>승인 서명</span>
              <span className={statusTagClass("success")}>연결됨</span>
              {signatureLink.linkedAt ? <span className={s.foldMeta}>{formatDate(signatureLink.linkedAt)}</span> : null}
              <Link className="btn btn--line btn--sm" href={CREATOR_SIGNATURE_LINK}>
                다시 연결
              </Link>
            </div>
          ) : (
            <Link className={`${s.linkRow} ${s.linkRowGo}`} href={CREATOR_SIGNATURE_LINK} data-signature-link="unlinked">
              <span>승인 서명 연결하기</span>
              <span className={s.foldMeta}>연결 전</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          )}
          <Fold id="address" title="받는 주소" meta={addressRegistered ? "등록됨" : "등록 전"}>
            <div className={`card card--soft ${s.inner}`}>
              <img className={`asset ${s["addr-ico"]}`} src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={72} height={72} />
              <p className="t-strong">{addressRegistered ? "주소 등록 완료" : "등록된 주소 없음"}</p>
              {addressRegistered ? <p data-address-on-file="">{addressOnFileText(addressOnFile)}</p> : null}
              <p className={s["body-gap"]}>{addressRegistered
                  ? "주소는 암호화해 보관합니다. 선물 승인 후 배송에 필요한 경우에만 확인합니다."
                  : "등록한 주소는 암호화해 보관합니다. 선물 승인 후 배송에 필요한 경우에만 확인합니다."}</p>
            </div>
            <p className="t-meta">{addressRegistered ? "송장 출력 전인 선물부터 변경된 주소로 배송됩니다." : "송장 출력 전인 선물부터 등록한 주소로 배송됩니다."}</p>
            <p className="t-meta">팬꾹은 채팅·이메일·전화로 주소를 요청하지 않습니다. 주소 재입력을 요구하는 연락에 응답하지 마세요.</p>
            <div>
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
              <p className={`t-meta ${s.msg}`} role="status">
                {addressMsg ?? ""}
              </p>
            </div>
          </Fold>

          <Fold id="receiving" title="받기 설정" meta={isResting(receiving.resumeOn, today) ? "쉬는 중" : "받는 중"}>
            <ReceivingSection initial={receiving} today={today} />
            <HardItemsSection initial={hardItems} today={today} />
          </Fold>

          <Fold id="blocked" title="차단한 팬" meta={`${blocked.length}명`}>
            {blocked.length === 0 ? (
              <p className="t-meta">차단한 팬이 없습니다.</p>
            ) : (
              <ul className="grid cols-2">
                {blocked.map((f, i) => (
                  <li key={f.blockId} className="card card--soft card-col">
                    <div className={s.who}>
                      <FaceAvatar index={i} />
                      <div>
                        <p className="t-strong">{f.fanNickname}</p>
                        <p className="t-meta">{formatDate(f.blockedAt)} 차단</p>
                      </div>
                    </div>
                    <div className="push">
                      <button
                        className="btn btn--line btn--sm btn--block"
                        type="button"
                        aria-label={`${f.fanNickname}님 차단 해제`}
                        onClick={() => {
                          setUnblockError(null);
                          setSheet({ kind: "unblock", fan: f });
                        }}
                      >
                        차단 해제
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-meta">차단을 해제해도 주소는 공개되지 않습니다. 새 선물은 건별로 카카오톡 서명을 거쳐 승인해야 배송됩니다.</p>
          </Fold>

          <Fold id="gift-link" title="선물 링크">
            <LinkSection initial={link} verified={verification.state.verified} />
          </Fold>

          <Fold id="thanks" title="감사 답장">
            <ReplySettingsSection initial={replySettings} />
          </Fold>
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
