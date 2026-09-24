# 2026-09-24 — 자율 실행 루프의 권한 허용 목록 (결정 필요 — 아직 붙이지 않는다)

정본: docs/references/run-loop.md 4절. 재료: 킷 시험(요청 `fail-alert`, 3회차)의 `report/loop/permissions.json`.

## 킷 시험에서 실제로 일어난 일

- 권한 모드 `auto`(루프가 명시해서 넘김)로 세 회차를 돌렸다. **권한 거부 0건.**
- 세 회차가 쓴 도구(횟수): 셸 `cat` 10 · `node` 10 · `sed` 7 · `grep` 7 · `git` 4 · `python` 4 · `head` 1 · `mkdir` 1 · `cp` 1 ·
  편집(Edit) 7 · 읽기(Read) 2. 쓰기(Write)·검색 도구는 안 썼다.
- `auto` 는 목록이 아니라 판정기가 호출마다 허용 여부를 정한다. 그래서 「무엇이 허용되는가」가 레포 안 파일에 없다.

## 선택지

**A. 지금처럼 `auto` 로 둔다 (추천 — 지금은)**
비용: 허용 범위가 파일로 고정돼 있지 않다. 판정기가 바뀌면 루프의 권한도 조용히 바뀐다.
이유: 세 회차에서 거부가 0건이었고, 파괴적 git 명령·외부 전송은 기존 훅(block-danger·protect-files)이 루프 안에서도
그대로 막는다(비대화 모드에서도 프로젝트 훅이 돈다 — 실측). 목록을 고정하면 새 항목이 새 명령을 쓸 때마다 거부로
항목이 실패한다 — 제품 적용 전까지 표본이 더 필요하다.

**B. `default` 모드 + 루프 전용 허용 목록**
비용: 목록 밖 명령은 거부되고 항목이 실패한다(목록을 계속 늘려야 한다). 목록 파일이 보호 파일이어야 루프가 스스로 권한을 못 늘린다.
붙이는 것: `.claude/loop-settings.json`(새 보호 파일 — protect-files 목록에 더해야 한다) + 루프가 `--settings` 로 넘기기.

B 를 고를 때의 목록 초안(시험에서 쓴 것 + 끝내기 절차에 필요한 것):

```json
{
  "permissions": {
    "allow": [
      "Read", "Edit", "Write", "Glob", "Grep",
      "Bash(node:*)", "Bash(cat:*)", "Bash(sed:*)", "Bash(grep:*)", "Bash(head:*)", "Bash(tail:*)",
      "Bash(mkdir:*)", "Bash(cp:*)", "Bash(python:*)", "Bash(ls:*)", "Bash(wc:*)",
      "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)", "Bash(git show:*)",
      "Bash(git add:*)", "Bash(git commit:*)"
    ],
    "deny": [
      "Bash(git push:*)", "Bash(git reset:*)", "Bash(git rebase:*)", "Bash(git checkout:*)",
      "Bash(curl:*)", "Bash(wget:*)", "WebFetch", "WebSearch"
    ]
  }
}
```

넣지 않은 것: `git` 전체(`git:*` 는 push·force 까지 연다) · 외부 전송(curl·WebFetch) · 결제·배포 명령. 설계 G 의 제외 목록 그대로다.

## 판정 (B 를 고르면)

붙이기 전에 실패하고 붙인 뒤 통과하는 검사를 그때 만든다 — 가짜가 아닌 `claude -p --permission-mode default --settings …`
로 목록 안 명령(node -e)은 통과, 목록 밖 명령(curl)은 `permission_denials` 에 잡히는지 본다. 지금은 A 를 추천하므로 만들지 않았다.
