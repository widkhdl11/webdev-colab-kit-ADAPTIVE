#!/usr/bin/env node
// 화면 문구 금지어 검사 — docs/copy/glossary.md 9절 코드 블록의 금지어를 src/ 의 한글 문자열에서 찾는다.
//
// - 금지어 목록은 실행할 때 glossary.md 에서 읽는다(여기에 복사하지 않는다).
// - 검사 대상: src/ 아래 .ts/.tsx, 시험 파일(*.test.*)은 뺀다.
// - 주석은 지우고 본다. 식별자는 ASCII 규칙이라, 주석을 지운 뒤 남은 한글은 문자열·템플릿·JSX 글자뿐이다.
// - 용어집 11절 「고정 문장」 표의 첫 열에 적힌 상수는 정의 부분(= 부터 문장 끝까지)을 건너뛴다.
// - 걸리면 「파일:줄 · 금지어 · 문구」를 한 줄씩 내고 종료 코드 1.
//
// 사용: node scripts/copy-lint.mjs [검사할 폴더]   (폴더를 안 주면 src/)
// TypeScript 7 은 JS API(createSourceFile)가 없어 작은 토크나이저를 직접 쓴다.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const glossaryPath = join(projectRoot, "docs", "copy", "glossary.md");
const scanRoot = resolve(process.argv[2] ?? join(projectRoot, "src"));

// ---------- 용어집 읽기 ----------

function readSection(text, number) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^## ${number}\\.`).test(l));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
}

function readForbiddenWords(text) {
  const section = readSection(text, 9);
  if (!section) throw new Error("glossary.md 에 9절이 없다");
  const open = section.findIndex((l) => l.startsWith("```"));
  const close = section.findIndex((l, i) => i > open && l.startsWith("```"));
  if (open < 0 || close < 0) throw new Error("glossary.md 9절에 코드 블록이 없다");
  const words = section.slice(open + 1, close).map((l) => l.trim()).filter(Boolean);
  if (words.length === 0) throw new Error("glossary.md 9절 코드 블록이 비어 있다");
  return words;
}

function readFixedConstants(text) {
  const section = readSection(text, 11);
  if (!section) return [];
  const names = [];
  for (const line of section) {
    const m = /^\|\s*`([A-Za-z_$][\w$]*)`\s*\|/.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

// ---------- 토크나이저: 주석을 공백으로 바꾸고, 문자열 안쪽 위치를 표시한다 ----------

const REGEX_PREV = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "~", "^"]);
const REGEX_PREV_WORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"]);

// 반환: code(주석을 공백으로 바꾼 글자, 줄바꿈 유지), inString(글자마다 문자열 안이면 true)
function stripComments(src) {
  const out = src.split("");
  const inString = new Uint8Array(src.length);
  let i = 0;
  let prevSig = ""; // 마지막 의미 있는 토큰(정규식 판단용)
  const templateStack = []; // 템플릿 ${ } 중첩: 각 원소는 그 안의 중괄호 깊이

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };

  const readQuoted = (quote) => {
    const start = i;
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] === "\\") i++;
      else if (src[i] === "\n") break; // 닫히지 않은 따옴표(JSX 글자의 ' 등)는 줄 끝에서 끊는다
      i++;
    }
    i++;
    for (let k = start; k < Math.min(i, src.length); k++) inString[k] = 1;
    prevSig = "str";
  };

  // 템플릿 글자 부분을 읽는다. ${ 를 만나면 코드로 돌아간다.
  const readTemplateChunk = () => {
    while (i < src.length) {
      const c = src[i];
      if (c === "\\") { inString[i] = 1; inString[i + 1] = 1; i += 2; continue; }
      if (c === "`") { inString[i] = 1; i++; prevSig = "str"; return; }
      if (c === "$" && src[i + 1] === "{") { i += 2; templateStack.push(0); prevSig = "{"; return; }
      inString[i] = 1;
      i++;
    }
  };

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      blank(start, i);
      continue;
    }
    if (c === "/" && n === "*") {
      const start = i;
      const end = src.indexOf("*/", i + 2);
      i = end < 0 ? src.length : end + 2;
      blank(start, i);
      continue;
    }
    if (c === '"' || c === "'") { readQuoted(c); continue; }
    if (c === "`") { inString[i] = 1; i++; readTemplateChunk(); continue; }
    if (c === "/" ) {
      const isRegex = prevSig === "" || REGEX_PREV.has(prevSig) || REGEX_PREV_WORDS.has(prevSig);
      if (isRegex) {
        i++;
        let inClass = false;
        while (i < src.length && src[i] !== "\n") {
          if (src[i] === "\\") { i += 2; continue; }
          if (src[i] === "[") inClass = true;
          else if (src[i] === "]") inClass = false;
          else if (src[i] === "/" && !inClass) break;
          i++;
        }
        i++;
        while (i < src.length && /[a-z]/i.test(src[i])) i++;
        prevSig = "regex";
        continue;
      }
    }
    if (templateStack.length > 0) {
      if (c === "{") templateStack[templateStack.length - 1]++;
      else if (c === "}") {
        if (templateStack[templateStack.length - 1] === 0) {
          templateStack.pop();
          i++;
          readTemplateChunk();
          continue;
        }
        templateStack[templateStack.length - 1]--;
      }
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) {
      const start = i;
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      prevSig = src.slice(start, i);
      continue;
    }
    prevSig = c;
    i++;
  }
  return { code: out.join(""), inString };
}

// 고정 문장 상수의 정의 범위(글자 위치)를 찾는다: `const NAME =` 부터 깊이 0 의 ; 또는 줄바꿈까지.
function fixedRanges(code, inString, names) {
  const ranges = [];
  for (const name of names) {
    const re = new RegExp(`\\bconst\\s+${name.replace(/\$/g, "\\$")}\\b[^=]*=`, "g");
    let m;
    while ((m = re.exec(code))) {
      if (inString[m.index]) continue;
      let i = m.index + m[0].length;
      let depth = 0;
      let seenValue = false;
      for (; i < code.length; i++) {
        const c = code[i];
        if (inString[i]) { seenValue = true; continue; }
        if (c === "(" || c === "[" || c === "{") { depth++; seenValue = true; }
        else if (c === ")" || c === "]" || c === "}") depth--;
        else if (depth <= 0 && c === ";") break;
        else if (depth <= 0 && c === "\n" && seenValue) break;
        else if (!/\s/.test(c)) seenValue = true;
      }
      ranges.push([m.index, i]);
    }
  }
  return ranges;
}

// ---------- 파일 순회 ----------

function listFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry) && !/\.d\.ts$/.test(entry)) files.push(full);
  }
  return files;
}

// ---------- 실행 ----------

const glossary = readFileSync(glossaryPath, "utf8");
const forbidden = readForbiddenWords(glossary);
const fixedNames = readFixedConstants(glossary);

const hits = [];
for (const file of listFiles(scanRoot)) {
  const src = readFileSync(file, "utf8");
  if (!/[가-힣]/.test(src)) continue;
  const { code, inString } = stripComments(src);
  const skip = fixedRanges(code, inString, fixedNames);
  const lineStarts = [0];
  for (let k = 0; k < code.length; k++) if (code[k] === "\n") lineStarts.push(k + 1);
  const lineOf = (pos) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo;
  };
  for (const word of forbidden) {
    // 영문 금지어(BJ 등)는 식별자 안에서 잡히지 않게 낱말 단위로만 본다(APPROVAL_SUBJECT 의 BJ). JSX 글자도 잡힌다. 한글 금지어는 그대로.
    const ascii = /^[\x20-\x7E]+$/.test(word) && /[A-Za-z]/.test(word);
    const wordChar = (c) => c !== undefined && /[A-Za-z0-9_]/.test(c);
    const counts = (p) => !ascii || (!wordChar(code[p - 1]) && !wordChar(code[p + word.length]));
    let pos = code.indexOf(word);
    while (pos >= 0) {
      if (counts(pos) && !skip.some(([a, b]) => pos >= a && pos < b)) {
        const ln = lineOf(pos);
        const lineText = src.slice(lineStarts[ln], (lineStarts[ln + 1] ?? src.length + 1) - 1).trim();
        hits.push({ file: relative(projectRoot, file).replace(/\\/g, "/"), line: ln + 1, word, text: lineText.length > 140 ? `${lineText.slice(0, 140)}…` : lineText });
      }
      pos = code.indexOf(word, pos + word.length);
    }
  }
}

hits.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
for (const h of hits) console.log(`${h.file}:${h.line} · ${h.word} · ${h.text}`);
const fileCount = new Set(hits.map((h) => h.file)).size;
console.log(`\n금지어 ${hits.length}건 · 파일 ${fileCount}개 (금지어 ${forbidden.length}개, 고정 문장 상수 ${fixedNames.length}개 건너뜀)`);
process.exit(hits.length > 0 ? 1 : 0);
