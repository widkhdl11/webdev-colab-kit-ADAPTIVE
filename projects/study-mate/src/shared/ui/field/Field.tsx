import { cloneElement, isValidElement, type ReactElement } from "react";
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
  // **힌트를 입력칸에 실제로 붙인다.** 전에는 `id` 만 만들어 두고 아무도 안 가리켰다 —
  // 눈으로는 힌트가 보이지만 읽어 주는 기계에는 없는 글이었고, 그래서 「PNG·1MB까지」 같은
  // 제한을 업로드가 실패한 뒤에야 알게 됐다(2026-09-06 ui-reviewer, 백로그에 열려 있던 건).
  //
  // 자식을 그냥 두지 않고 복제해 넘기는 이유는, 부르는 자리 열두 곳이 각각
  // `aria-describedby` 를 적게 하면 그중 하나를 빠뜨리는 날 아무도 안 잡기 때문이다.
  const hintId = hint ? `${id}-hint` : undefined;
  const described =
    hintId && isValidElement(children)
      ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
          "aria-describedby":
            [(children.props as { "aria-describedby"?: string })["aria-describedby"], hintId]
              .filter(Boolean)
              .join(" ") || undefined,
        })
      : children;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? null : <span className={styles.required}> (선택)</span>}
      </label>
      {described}
      {hint ? (
        <p className={styles.hint} id={hintId}>
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

/**
 * 제출 버튼이 앉는 자리. 「위쪽과 점선으로 가르고 26/20 띄운다」는 규칙이 네 파일에 각각
 * 적혀 있었다(2026-09-06 ui-reviewer) — `.section` 과 폼 둘의 `.actions` 와 스터디 상세의
 * `.block`. 폼 쪽 두 벌을 여기로 모은다. 다음 폼이 세 번째 치수를 부르지 않게.
 */
export function FormActions({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>;
}

/**
 * 실패 문구. `message` 가 `ReactNode` 인 이유는 문장 안에 갈 곳을 링크로 넣는 자리가
 * 생겼기 때문이다 — 「어디에서 다시 하라」를 위치로 말하면 화면 폭에 따라 틀린 말이 된다
 * (2026-09-07 ui-reviewer).
 */
export function FormError({ message }: { message: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}

/**
 * 성공 문구. 실패와 **같은 슬롯**이라 여백도 같은 값을 쓴다 — 뜻이 반대인 것은 색과
 * 테두리가 말한다.
 *
 * `role="status"` 인 이유: 화면을 안 보는 사용자에게 이 앱의 성공 문구가 처음 생겼다.
 * 특히 비밀번호 변경의 「다른 기기의 로그인은 끊었습니다」는 보안 결과 통지인데, 페이지
 * 이동도 포커스 이동도 없어서 이 속성이 없으면 무슨 일이 일어났는지 알 방법이 없다.
 * 실패가 `alert`(끼어든다) 이고 성공이 `status`(끝나면 읽는다) 인 것도 급함의 차이 그대로다.
 */
/**
 * 되묻는 문구(「정말 지웁니다」). 실패도 성공도 아닌 세 번째 슬롯이라 형광펜을 안 쓴다 —
 * 승인된 「파괴적 행동」 규칙이 색 대신 두 단계로 막기로 했기 때문이다.
 *
 * `role="alert"` 인 이유: 눌러서 나타나는 것이라 페이지 이동도 없고, 이것이 없으면
 * 화면을 안 보는 사용자는 무엇이 바뀌었는지 알 방법이 없다.
 */
export function FormConfirm({ children }: { children: ReactNode }) {
  return (
    <p className={styles.confirm} role="alert">
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p className={styles.notice} role="status">
      {children}
    </p>
  );
}
