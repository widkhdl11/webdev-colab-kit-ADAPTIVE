"use client";

import { useState } from "react";

// 복사 버튼. 복사가 막힌 브라우저(권한·http)에서는 직접 옮겨 적으라고 알린다. 알림 문구는 부르는 쪽이 정한다.
export function CopyButton({
  text,
  label,
  className,
  copiedMessage,
  failedMessage,
}: {
  text: string;
  label: string;
  className?: string;
  copiedMessage: string;
  failedMessage: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          const failed = failedMessage;
          // http 주소·오래된 브라우저에는 navigator.clipboard 자체가 없다 — 그때도 같은 안내를 띄운다
          if (typeof navigator === "undefined" || !navigator.clipboard) {
            setMessage(failed);
            return;
          }
          navigator.clipboard
            .writeText(text)
            .then(() => setMessage(copiedMessage))
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
