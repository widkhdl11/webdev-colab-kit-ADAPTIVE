import type { PasswordAttempts } from "./password-attempts";

// 시험 전용: 비밀번호 확인 횟수 기록(session-login INV-L14)의 가짜. locked 면 시작을 막고, 무엇이 불렸는지 적어 둔다.
export function fakePasswordAttempts(opts: { locked?: boolean; broken?: boolean } = {}) {
  const calls: string[] = [];
  let next = 1;
  const attempts: PasswordAttempts = {
    async begin(loginKey) {
      calls.push(`begin:${loginKey}`);
      if (opts.broken) throw new Error("기록 DB 가 응답하지 않는다");
      return opts.locked ? null : next++;
    },
    async finish(id, ok) {
      calls.push(`finish:${id}:${ok}`);
    },
    async clear(loginKey) {
      calls.push(`clear:${loginKey}`);
    },
  };
  return { attempts, calls };
}
