"use client";

import Link from "next/link";
import { useId, type FormEvent } from "react";
import type { FanAccountView } from "@/entities/fan/api/sample-fan-account";
import s from "./my-info.module.css";

// 내 정보 — 개인정보 본문. 시안: docs/design/mockups/site/v4/my-info.html
// 겉모양만 있다. 저장·번호 바꾸기·비밀번호 변경은 아직 아무 일도 하지 않는다(로그인 방식 결정 대기).
// 「되돌리기」는 폼 기본 동작(reset)으로 처음 값에 돌아간다.

export function MyInfoPanel({ account, nickname }: { account: FanAccountView; nickname: string }) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  // 아직 저장하지 않는다 — 제출해도 페이지가 다시 열리지 않게만 막는다.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => e.preventDefault();

  return (
    <form onSubmit={onSubmit} aria-labelledby={f("h")}>
      <h2 className={s.h} id={f("h")}>
        개인정보
      </h2>
      <div className={s.form}>
        <div className={s.row}>
          <label className={s.lb} htmlFor={f("uid")}>
            아이디
          </label>
          <div>
            <input className="input" id={f("uid")} type="text" defaultValue={account.loginId} readOnly aria-describedby={f("uid-h")} />
            <p className="hint" id={f("uid-h")}>
              아이디는 바꿀 수 없어요.
            </p>
          </div>
        </div>
        <div className={s.row}>
          <label className={s.lb} htmlFor={f("nick")}>
            닉네임
          </label>
          <div>
            <input
              className="input"
              id={f("nick")}
              type="text"
              defaultValue={nickname}
              maxLength={12}
              autoComplete="nickname"
              aria-describedby={f("nick-h")}
            />
            <p className="hint" id={f("nick-h")}>
              크리에이터에게 보이는 이름이에요. (12자까지)
            </p>
          </div>
        </div>
        <div className={s.row}>
          <label className={s.lb} htmlFor={f("mail")}>
            이메일
          </label>
          <div>
            <input className="input" id={f("mail")} type="email" defaultValue={account.email} autoComplete="email" />
          </div>
        </div>
        <div className={s.row}>
          <label className={s.lb} htmlFor={f("tel")}>
            휴대폰 번호
          </label>
          <div>
            <div className={s["with-btn"]}>
              <input className="input" id={f("tel")} type="text" defaultValue={account.phoneMasked} readOnly aria-describedby={f("tel-h")} />
              <button className="btn btn--soft" type="button">
                번호 바꾸기
              </button>
            </div>
            <p className="hint" id={f("tel-h")}>
              바꾸려면 카카오 인증을 다시 받아요.
            </p>
          </div>
        </div>
        <div className={s.row}>
          <span className={s.lb}>비밀번호</span>
          <div>
            <button className="btn btn--soft" type="button">
              비밀번호 변경
            </button>
          </div>
        </div>
        <div className={s.row} role="group" aria-labelledby={f("noti")}>
          <span className={s.lb} id={f("noti")}>
            알림 받기
          </span>
          <div className={s.checks}>
            <label>
              <input type="checkbox" defaultChecked={account.notifyKakao} />
              카카오 알림톡으로 받기
            </label>
            <label>
              <input type="checkbox" defaultChecked={account.notifyEmail} />
              이메일로 받기
            </label>
            <p className={`hint ${s["hint-tight"]}`}>승인 결과, 입고, 출고, 배송 완료 소식을 보내 드려요.</p>
          </div>
        </div>
      </div>
      <div className={s["save-bar"]}>
        <Link className={s.leave} href="/support">
          회원 탈퇴
        </Link>
        <div className="row">
          <button className="btn btn--text" type="reset">
            되돌리기
          </button>
          <button className="btn" type="submit">
            저장하기
          </button>
        </div>
      </div>
    </form>
  );
}
