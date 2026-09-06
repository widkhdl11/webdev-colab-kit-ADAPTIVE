import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import styles from "./button.module.css";

/** 잉크 채움(주 행동) · 테두리(보조) · 점선(확정 전) · 민트 채움(완료된 상태) */
export type ButtonTone = "ink" | "outline" | "wait" | "joined";
export type ButtonSize = "sm" | "md" | "lg";

function classNames(tone: ButtonTone, size: ButtonSize, block: boolean, extra?: string) {
  const parts = [styles.btn, styles[tone]];
  if (size !== "md") parts.push(styles[size]);
  if (block) parts.push(styles.block);
  if (extra) parts.push(extra);
  return parts.join(" ");
}

type Shared = {
  tone?: ButtonTone;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * `ref` 를 받는 이유: 눌러서 화면이 바뀌는 자리(삭제의 두 단계 확인)에서 **초점을 따라
 * 옮겨야** 하기 때문이다. 안 옮기면 초점이 `document.body` 로 떨어져서, 화면을 보면서
 * 키보드만 쓰는 사용자는 Tab 을 문서 처음부터 다시 눌러야 한다 (2026-09-06 ui-reviewer).
 */
export function Button({
  tone = "outline",
  size = "md",
  block = false,
  className,
  children,
  ref,
  ...rest
}: Shared & ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} className={classNames(tone, size, block, className)} {...rest}>
      {children}
    </button>
  );
}

/** 이동이면 버튼이 아니라 링크다 — 생김새만 버튼과 같게 맞춘다 */
export function ButtonLink({
  href,
  tone = "outline",
  size = "md",
  block = false,
  className,
  children,
}: Shared & { href: string }) {
  return (
    <Link href={href} className={classNames(tone, size, block, className)}>
      {children}
    </Link>
  );
}
