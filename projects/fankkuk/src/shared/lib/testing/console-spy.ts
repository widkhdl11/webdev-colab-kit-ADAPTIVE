import { vi } from "vitest";

// 시험 전용: console 의 모든 출력 함수를 엿보고, 나온 인자 안에 어떤 값이 들어 있었는지 판정한다.
// 로그에 남으면 안 되는 값이 실제 호출에서 새지 않는지 확인할 때 쓴다 — 소스를 훑지 않고 함수를 실제로 부른 뒤 본다.

const METHODS = ["log", "info", "warn", "error", "debug", "trace"] as const;

function textOf(arg: unknown): string {
  if (arg instanceof Error) return `${arg.name} ${arg.message} ${arg.stack ?? ""} ${textOf((arg as { cause?: unknown }).cause)}`;
  if (typeof arg === "string") return arg;
  if (arg === undefined) return "";
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

export type ConsoleSpy = {
  /** console 이 받은 호출마다 인자 목록 */
  calls: unknown[][];
  /** 그 값이 어느 호출의 어느 인자에라도 들어 있었나 */
  leaked: (value: string) => boolean;
  restore: () => void;
};

export function spyConsole(): ConsoleSpy {
  const calls: unknown[][] = [];
  const spies = METHODS.map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      calls.push(args);
    }),
  );
  return {
    calls,
    leaked: (value) => calls.some((args) => args.some((a) => textOf(a).includes(value))),
    restore: () => spies.forEach((s) => s.mockRestore()),
  };
}
