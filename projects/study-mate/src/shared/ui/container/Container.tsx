import type { ElementType, ReactNode } from "react";
import styles from "./container.module.css";

/** 화면 폭을 잡는 유일한 장치. 직접 max-width 를 적지 않는다. */
export function Container({
  as: Tag = "div",
  className,
  children,
}: {
  as?: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={className ? `${styles.wrap} ${className}` : styles.wrap}>{children}</Tag>;
}
