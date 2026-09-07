import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/*
 * `route-links.test.ts` 가 쓰는 판정기 셋. 검사 파일과 나눠 둔 이유는 하나다 —
 * 이 파일에는 경로처럼 생긴 문자열(`"/posts"` 같은 예시)이 없어야 검사가 자기 자신을
 * 훑다가 헛 지적을 내지 않는다. 검사 파일은 `src/` 밖이라 훑지 않지만, 이 규칙을
 * 파일 나눔으로 눈에 보이게 해 둔다.
 */

/** 소스에서 주석을 지운다. 설명에 적힌 예시 경로가 죽은 링크로 잡히지 않게. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 실행 시점에 값이 정해지는 칸. 라우트의 동적 칸에만 맞는다. */
export const SLOT = "[?]";

/** 템플릿의 `${…}` 를 잠시 대신할 글자. 물음표가 없어야 질의 자르기와 안 섞인다. */
const MASK = "__RUNTIME_SLOT__";

/**
 * `src/app/posts/[id]/edit/page.tsx` → `/posts/[id]/edit`
 *
 * 아직 이 레포에 없는 라우트 문법을 만나면 **던진다.** 조용히 틀린 목록을 내놓으면
 * 그 목록을 상대로 한 검사가 전부 헛돈다.
 */
export function routesOf(files: readonly string[], appDir: string): string[] {
  return files
    .filter((f) => f.startsWith(appDir + sep) && f.endsWith(`${sep}page.tsx`))
    .map((f) => {
      const raw = relative(appDir, f).split(sep).slice(0, -1);
      if (raw.some((s) => s.startsWith("@") || s.startsWith("_")))
        throw new Error(`이 검사가 아직 모르는 라우트 문법: ${raw.join("/")}`);
      // 라우트 그룹 `(name)` 은 주소에 안 나온다
      const segs = raw.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
      return segs.length ? `/${segs.join("/")}` : "/";
    });
}

/** 라우트의 동적 칸은 아무 칸이나 받고, 경로의 실행 시점 칸은 동적 칸만 받는다. */
export function matchesRoute(path: string, routes: readonly string[]): boolean {
  const want = path.split("/").filter(Boolean);
  return routes.some((route) => {
    const have = route.split("/").filter(Boolean);
    if (have.length !== want.length) return false;
    return have.every((seg, i) => (seg.startsWith("[") ? true : want[i] === seg));
  });
}

/**
 * 소스에서 경로처럼 생긴 문자열을 뽑는다.
 *
 * **`href=` 라는 이름에 걸지 않는다.** 그러면 `footHref: …` 나 `more={{ href: … }}` 나
 * `redirect(…)` 를 놓친다 — 전부 소개 화면이 죽어 있던 것과 같은 모양으로 죽을 수 있다.
 *
 * 템플릿 문자열은 `${…}` 를 실행 시점 칸으로 바꿔서 본다. 값은 나중에 정해지지만
 * **고정된 앞뒤 칸은 지금 판정할 수 있다** — 그 자리의 오타가 그때 잡힌다.
 */
export function pathLiteralsOf(source: string): string[] {
  const code = withoutComments(source);
  const found: string[] = [];
  /** 질의·조각은 이미 떼어 낸 상태로 들어온다 — 여기서 또 떼면 `[?]` 의 물음표에 걸린다. */
  const push = (path: string) => {
    if (path.startsWith("/")) found.push(path === "/" ? "/" : path.replace(/\/$/, ""));
  };
  const cutQuery = (raw: string) => raw.split("?")[0].split("#")[0];

  // 따옴표 문자열. 앞에 글자·점·달러가 붙은 것은 경로가 아니다(주소·정규식 조각 등)
  // 질의·조각 글자(`?=&#%`)까지 받아 둔다. 안 받으면 `"/posts?category=1"` 이 아예
  // 안 걸려서, 질의가 붙은 링크는 있는 줄도 모르고 지나간다.
  for (const m of code.matchAll(/(?<![\w.$])['"](\/[A-Za-z0-9\-_.~/[\]?=&#%]*)['"]/g))
    push(cutQuery(m[1]));

  // 템플릿 문자열. 자리를 **질의를 뗀 뒤에** 채운다 — 실행 시점 칸을 먼저 넣으면 그
  // 안의 물음표를 질의 시작으로 읽어 경로가 중간에서 잘린다.
  for (const m of code.matchAll(/`(\/[^`]*)`/g)) {
    const cut = cutQuery(maskSlots(m[1]));

    // 한 칸이 글자와 실행 시점 값으로 **섞여** 있으면 판정하지 않는다.
    // `` `/posts${질의를 만드는 함수(...)}` `` 가 그 모양이다 — 붙은 값이 질의인지
    // 경로의 뒷글자인지 여기서는 알 수 없다. 아는 척하면 없는 경로를 지적하게 된다.
    const mixed = cut.split("/").some((seg) => seg.includes(MASK) && seg !== MASK);
    if (mixed) continue;

    push(cut.split(MASK).join(SLOT));
  }
  return found;
}

/** `${…}` 를 통째로 가린다. 중괄호가 안에 또 있어도(`${f({a:1})}`) 짝을 세어 넘긴다. */
function maskSlots(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "$" && text[i + 1] === "{") {
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth += 1;
        else if (text[j] === "}") depth -= 1;
        j += 1;
      }
      out += MASK;
      i = j - 1;
      continue;
    }
    out += text[i];
  }
  return out;
}

export function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
