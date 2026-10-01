"use client";

import { useState } from "react";

// 주소 복사 버튼. 복사가 막힌 브라우저(권한·http)에서는 직접 옮겨 적으라고 알린다.
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          navigator.clipboard
            .writeText(text)
            .then(() => setMessage("주소를 복사했어요."))
            .catch(() => setMessage("복사하지 못했어요. 위 주소를 직접 옮겨 적어 주세요."));
        }}
      >
        {label}
      </button>
      <p className="hint" role="status">
        {message}
      </p>
    </>
  );
}
