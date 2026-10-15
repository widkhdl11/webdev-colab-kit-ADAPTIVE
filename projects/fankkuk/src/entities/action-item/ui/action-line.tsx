import Link from "next/link";
import { ACTION_CENTER_HREF } from "../model/action-items";
import s from "./action-line.module.css";

// 처리할 일 한 줄 (action-center INV-J2, design-rules 12절, 시안 v21-addendum3/fan-home.html·fan-gift-status.html 의 .line-note).
// 숫자는 화면이 처리할 일 읽기 결과에서 센 줄 수를 그대로 받는다. 0 이면 아무것도 그리지 않는다.
// home = 홈(「처리할 일 N건이 있어요.」 · 확인하기), gift = 선물 상세 맨 위(「처리할 일 N건 — 확인해 주세요.」 · 처리할 일 보기).

type Props = { count: number; place: "home" | "gift" };

export function ActionLine({ count, place }: Props) {
  if (count <= 0) return null;
  return (
    <div className={s.line} role="status" data-testid="action-line">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M12 11h4" />
        <path d="M12 16h4" />
        <path d="M8 11h.01" />
        <path d="M8 16h.01" />
      </svg>
      <p>{place === "home" ? `처리할 일 ${count}건이 있어요.` : `처리할 일 ${count}건 — 확인해 주세요.`}</p>
      <Link href={ACTION_CENTER_HREF}>{place === "home" ? "확인하기" : "처리할 일 보기"}</Link>
    </div>
  );
}
