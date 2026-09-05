import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
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

export function Button({
  tone = "outline",
  size = "md",
  block = false,
  className,
  children,
  ...rest
}: Shared & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={classNames(tone, size, block, className)} {...rest}>
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
