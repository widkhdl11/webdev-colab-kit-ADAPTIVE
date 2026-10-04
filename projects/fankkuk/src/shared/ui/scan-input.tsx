"use client";

import { type Ref, useImperativeHandle, useRef, useState } from "react";
import w from "./work.module.css";

// 스캐너 입력 칸 (design-rules 8-1 — 작업 화면은 스캔 칸 하나가 맨 위, 커서가 늘 거기 있다).
// 바코드 스캐너는 글자를 친 뒤 Enter 를 보낸다. Enter 때 값을 넘기고 칸을 비운다.
// 처리 중에 들어온 스캔은 받지 않고 칸을 비운 뒤 「처리 중이라 받지 않았어요」를 보이고 읽어 준다 — 다시 스캔하게.

export type ScanInputHandle = { focus: () => void };

type Props = {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  busy: boolean;
  onScan: (value: string) => void;
  ref?: Ref<ScanInputHandle>;
};

export function ScanInput({ id, label, hint, placeholder, busy, onScan, ref }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [notice, setNotice] = useState("");
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);
  const hintId = `${id}-hint`;

  return (
    <div className={w.scan}>
      <label htmlFor={id}>{label}</label>
      <div className={w.scanRow}>
        <input
          ref={input}
          id={id}
          type="text"
          inputMode="none"
          autoComplete="off"
          spellCheck={false}
          // 작업 화면은 스캐너 입력을 바로 받아야 한다(8-1)
          autoFocus
          placeholder={placeholder}
          aria-describedby={hintId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (value.trim() === "") return;
            setValue("");
            if (busy) {
              setNotice("처리 중이라 받지 않았어요. 앞 결과가 나온 뒤 다시 스캔해 주세요.");
              return;
            }
            setNotice("");
            onScan(value);
          }}
        />
      </div>
      <p id={hintId} className={w.scanHint}>
        {hint}
      </p>
      <p className={w.scanNotice} role="status">
        {notice}
      </p>
    </div>
  );
}
