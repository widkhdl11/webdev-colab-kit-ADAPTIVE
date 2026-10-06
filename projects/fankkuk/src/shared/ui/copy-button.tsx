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
          const failed = "복사하지 못했어요. 위 주소를 직접 옮겨 적어 주세요.";
          // http 주소·오래된 브라우저에는 navigator.clipboard 자체가 없다 — 그때도 같은 안내를 띄운다
          if (typeof navigator === "undefined" || !navigator.clipboard) {
            setMessage(failed);
            return;
          }
          navigator.clipboard
            .writeText(text)
            .then(() => setMessage("주소를 복사했어요."))
            .catch(() => setMessage(failed));
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
