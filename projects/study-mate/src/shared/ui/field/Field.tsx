import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { InputHTMLAttributes } from "react";
import styles from "./field.module.css";

/**
 * 라벨과 입력칸을 잇는 한 칸. 라벨을 자리표시 글자로 대신하지 않는다 —
 * 입력하기 시작하면 사라져서 무엇을 쓰는 칸이었는지 알 수 없게 된다.
 */
export function Field({
  id,
  label,
  hint,
  required = false,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? null : <span className={styles.required}> (선택)</span>}
      </label>
      {children}
      {hint ? (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={styles.control} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={styles.control} />;
}

export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <span className={styles.selectWrap}>
      <select {...props} className={styles.control}>
        {children}
      </select>
    </span>
  );
}

export function FieldRow({ columns = 2, children }: { columns?: 2 | 3; children: ReactNode }) {
  return (
    <div className={`${styles.row} ${columns === 3 ? styles.row3 : styles.row2}`}>{children}</div>
  );
}

export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {hint ? <p className={styles.sectionHint}>{hint}</p> : null}
      {children}
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
