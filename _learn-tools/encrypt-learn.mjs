#!/usr/bin/env node
/**
 * Build learn/ from plaintext courses in learn-src/, then encrypt every HTML
 * page with StatiCrypt. The password comes from LEARN_PASSWORD or
 * STATICRYPT_PASSWORD and is never written to disk.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(toolsDir, "..");
const sourceRoot = path.join(root, "learn-src");
const outputRoot = path.join(root, "learn");
const staticryptBin = path.join(toolsDir, "node_modules", "staticrypt", "cli", "index.js");
const templatePath = path.join(toolsDir, "password-template.html");
const hubCssPath = path.join(toolsDir, "hub.css");

// Public salt, also embedded in every encrypted page. Pinned so a remembered
// password hash still opens pages after a rebuild.
const SALT = "3063e6cf082b503c815bff779d5e9703";

const COURSES = [
  { dir: "policy-gradients", title: "Policy gradients" },
  { dir: "rl-environments", title: "RL environments" },
];

const NOTES_CANARIES = ["Morning Newspaper", "Balona", "/home/box/agent-data"];

marked.use({ gfm: true, breaks: false });

function fail(message) {
  console.error(message);
  process.exit(1);
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function rewriteLinks(text) {
  return text
    .replaceAll("../../teach-policy-gradients/", "../../policy-gradients/")
    .replaceAll("../teach-policy-gradients/", "../policy-gradients/");
}

function linkSisterCourse(markdown) {
  const rewritten = rewriteLinks(markdown)
    .replaceAll("`/workspace/teach-policy-gradients/`", "[Policy gradients](../policy-gradients/)")
    .replaceAll("/workspace/teach-policy-gradients/", "../policy-gradients/");
  return rewritten.replace(
    "Sister course: PG Tutor `../policy-gradients/` — Lesson 14 (reward over-optimisation), Lesson 16 (GRPO).",
    "Sister course: [Policy gradients](../policy-gradients/) — [Lesson 14](../policy-gradients/lessons/0014-reward-overoptimization.html) (reward over-optimisation), [Lesson 16](../policy-gradients/lessons/0016-grpo-group-relative-advantage.html) (GRPO)."
  );
}

function whyBlurb(markdown) {
  const parts = markdown.split(/\n(?=## )/);
  const why = parts.find((part) => part.startsWith("## Why"));
  if (!why) return "";
  return why.replace(/^## Why\s*/, "").replace(/\s+/g, " ").trim();
}

function splitLeadingH1(markdown) {
  const match = markdown.match(/^#\s+(.+)\r?\n+([\s\S]*)$/);
  if (!match) return { title: "Notes", body: markdown };
  return { title: match[1].trim(), body: match[2] };
}

function extractH1(html, file) {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) fail(`No h1 in ${file}`);
  return decodeEntities(match[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function listHtml(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".html"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function itemLabel(filename, title) {
  const match = filename.match(/^(\d+)-/);
  if (!match) return title;
  return `${Number(match[1])}. ${title}`;
}

function page({ title, kicker, heading, lede, cssHref, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <link rel="stylesheet" href="${esc(cssHref)}" />
</head>
<body>
  <article class="lesson">
    <header class="lesson-header">
      <p class="lesson-kicker">${kicker}</p>
      <h1>${esc(heading)}</h1>
      ${lede ? `<p class="lesson-win">${esc(lede)}</p>` : ""}
    </header>
    ${body}
  </article>
</body>
</html>
`;
}

function toc(files, dir, hrefPrefix) {
  return files
    .map((name) => {
      const html = fs.readFileSync(path.join(dir, name), "utf8");
      const title = extractH1(html, path.join(dir, name));
      return `      <li><a href="${esc(hrefPrefix + name)}">${esc(itemLabel(name, title))}</a></li>`;
    })
    .join("\n");
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function redact(text, password) {
  return text.split(password).join("[redacted]");
}

function runStaticrypt(password, args) {
  const result = spawnSync(process.execPath, [staticryptBin, ...args], {
    cwd: root,
    env: { ...process.env, STATICRYPT_PASSWORD: password },
    encoding: "utf8",
  });
  const output = redact(`${result.stdout || ""}${result.stderr || ""}`, password);
  if (output.trim()) process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  if (result.status !== 0) fail(`staticrypt exited ${result.status}`);
}

function buildStage(stage) {
  fs.mkdirSync(stage, { recursive: true });
  fs.mkdirSync(path.join(stage, "assets"), { recursive: true });
  fs.copyFileSync(hubCssPath, path.join(stage, "assets", "hub.css"));

  const cards = [];
  for (const course of COURSES) {
    const src = path.join(sourceRoot, course.dir);
    if (!fs.existsSync(path.join(src, "lessons"))) fail(`Missing ${path.join(src, "lessons")}`);
    const dest = path.join(stage, course.dir);
    for (const sub of ["assets", "lessons", "reference"]) {
      const from = path.join(src, sub);
      if (fs.existsSync(from)) copyDir(from, path.join(dest, sub));
    }
    for (const file of walk(dest).filter((file) => file.endsWith(".html"))) {
      fs.writeFileSync(file, rewriteLinks(fs.readFileSync(file, "utf8")));
    }

    const lessons = listHtml(path.join(dest, "lessons"));
    const references = listHtml(path.join(dest, "reference"));
    const missionPath = path.join(src, "MISSION.md");
    const resourcesPath = path.join(src, "RESOURCES.md");
    const mission = fs.existsSync(missionPath) ? fs.readFileSync(missionPath, "utf8") : "";
    const blurb = mission ? whyBlurb(mission) : "";

    const lessonItems = toc(lessons, path.join(dest, "lessons"), "lessons/");
    const referenceItems = toc(references, path.join(dest, "reference"), "reference/");
    const docs = [];
    if (mission) docs.push(`<a href="mission.html">Mission</a>`);
    if (fs.existsSync(resourcesPath)) docs.push(`<a href="resources.html">Resources</a>`);

    const indexBody = `
    ${docs.length ? `<p class="nav-links">${docs.join(" · ")}</p>` : ""}
    <h2>Lessons</h2>
    <ol class="toc">
${lessonItems}
    </ol>
    ${
      references.length
        ? `<h2>Reference</h2>
    <ol class="toc">
${referenceItems}
    </ol>`
        : ""
    }
    <p class="nav-links back"><a href="../index.html">All courses</a></p>`;

    fs.writeFileSync(
      path.join(dest, "index.html"),
      page({
        title: course.title,
        kicker: `<a href="../index.html">Learn</a> · Course`,
        heading: course.title,
        lede: blurb,
        cssHref: "../assets/hub.css",
        body: indexBody,
      })
    );

    for (const [filename, sourcePath] of [
      ["mission.html", missionPath],
      ["resources.html", resourcesPath],
    ]) {
      if (!fs.existsSync(sourcePath)) continue;
      const raw = linkSisterCourse(fs.readFileSync(sourcePath, "utf8"));
      const { title, body } = splitLeadingH1(raw);
      fs.writeFileSync(
        path.join(dest, filename),
        page({
          title: `${title} · ${course.title}`,
          kicker: `<a href="../index.html">Learn</a> · <a href="index.html">${esc(course.title)}</a>`,
          heading: title,
          lede: "",
          cssHref: "../assets/hub.css",
          body: `<div class="prose">${marked.parse(body)}</div>
    <p class="nav-links back"><a href="index.html">${esc(course.title)}</a> · <a href="../index.html">All courses</a></p>`,
        })
      );
    }

    const meta = [
      `${lessons.length} ${lessons.length === 1 ? "lesson" : "lessons"}`,
      references.length ? `${references.length} reference ${references.length === 1 ? "sheet" : "sheets"}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    cards.push(`      <li>
        <p class="course-meta">${esc(meta)}</p>
        <a class="course-title" href="${esc(course.dir)}/index.html">${esc(course.title)}</a>
        ${blurb ? `<p>${esc(blurb)}</p>` : ""}
      </li>`);
  }

  fs.writeFileSync(
    path.join(stage, "index.html"),
    page({
      title: "Learn",
      kicker: "Ronald Richman",
      heading: "Learning notes",
      lede: "Policy gradients, and the environments those algorithms train on.",
      cssHref: "assets/hub.css",
      body: `    <ul class="courses">
${cards.join("\n")}
    </ul>
    <p class="nav-links back"><a href="../">Site home</a></p>`,
    })
  );
}

function encrypt(password, stageParent) {
  const stage = path.join(stageParent, "learn");
  const encryptedParent = path.join(stageParent, "encrypted");
  buildStage(stage);
  runStaticrypt(password, [
    stage,
    "--recursive",
    "--directory",
    encryptedParent,
    "--config",
    "false",
    "--salt",
    SALT,
    "--short",
    "--remember",
    "0",
    "--template",
    templatePath,
    "--template-title",
    "Learning notes",
    "--template-instructions",
    "Enter the password. Remember me is on, so this browser only asks once.",
    "--template-button",
    "Open",
    "--template-color-primary",
    "#1a5f7a",
    "--template-color-secondary",
    "#fffff8",
    "--template-error",
    "That password did not match.",
    "--template-placeholder",
    "Password",
    "--template-remember",
    "Remember me",
  ]);
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.cpSync(path.join(encryptedParent, "learn"), outputRoot, { recursive: true });
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) fail(`${label} is missing ${needle}`);
}

function assertExcludes(text, needle, label) {
  if (text.includes(needle)) fail(`${label} still contains ${needle}`);
}

function verify(password, stageParent) {
  const decryptedParent = path.join(stageParent, "decrypted");
  runStaticrypt(password, [
    outputRoot,
    "--decrypt",
    "--recursive",
    "--directory",
    decryptedParent,
    "--config",
    "false",
    "--salt",
    SALT,
    "--short",
  ]);
  const plainRoot = path.join(decryptedParent, "learn");
  const encryptedHtml = walk(outputRoot).filter((file) => file.endsWith(".html"));
  const plainHtml = walk(plainRoot).filter((file) => file.endsWith(".html"));
  if (encryptedHtml.length !== plainHtml.length) {
    fail(`Encrypted ${encryptedHtml.length} HTML files but decrypted ${plainHtml.length}`);
  }
  if (encryptedHtml.length < 40) fail(`Expected the full course set, encrypted ${encryptedHtml.length} pages`);

  for (const file of walk(outputRoot)) {
    const text = fs.readFileSync(file);
    const asString = text.toString("utf8");
    if (asString.includes(password)) fail(`Password leaked into ${path.relative(root, file)}`);
    for (const canary of NOTES_CANARIES) {
      if (asString.includes(canary)) fail(`Notes leaked into ${path.relative(root, file)}`);
    }
    if (file.endsWith(".md")) fail(`Markdown was published: ${path.relative(root, file)}`);
    if (!file.endsWith(".html")) continue;
    if (!asString.startsWith("<!DOCTYPE html>")) fail(`${path.relative(root, file)} is not a StatiCrypt page`);
    assertIncludes(asString, 'name="remember" checked', path.relative(root, file));
    assertIncludes(asString, SALT, path.relative(root, file));
    assertIncludes(asString, "Remember me", path.relative(root, file));
    assertExcludes(asString, '<article class="lesson"', path.relative(root, file));
    assertExcludes(asString, "Quiz.mount", path.relative(root, file));
    assertExcludes(asString, "teach-policy-gradients", path.relative(root, file));
  }

  const hub = fs.readFileSync(path.join(plainRoot, "index.html"), "utf8");
  assertIncludes(hub, 'href="policy-gradients/index.html"', "hub");
  assertIncludes(hub, 'href="rl-environments/index.html"', "hub");
  assertIncludes(hub, "Learning notes", "hub");

  const pgIndex = fs.readFileSync(path.join(plainRoot, "policy-gradients", "index.html"), "utf8");
  const pgLessons = listHtml(path.join(sourceRoot, "policy-gradients", "lessons"));
  const pgRefs = listHtml(path.join(sourceRoot, "policy-gradients", "reference"));
  for (const name of pgLessons) assertIncludes(pgIndex, `lessons/${name}`, "policy gradients index");
  for (const name of pgRefs) assertIncludes(pgIndex, `reference/${name}`, "policy gradients index");
  assertIncludes(pgIndex, "The score-function identity", "policy gradients index");
  assertIncludes(pgIndex, "href=\"mission.html\"", "policy gradients index");
  assertIncludes(pgIndex, "href=\"resources.html\"", "policy gradients index");

  const rlIndex = fs.readFileSync(path.join(plainRoot, "rl-environments", "index.html"), "utf8");
  assertIncludes(rlIndex, "lessons/0001-what-is-an-rl-environment.html", "rl index");
  assertIncludes(rlIndex, "reference/anatomy.html", "rl index");
  assertIncludes(rlIndex, "reference/glossary.html", "rl index");
  assertIncludes(rlIndex, "What is an RL environment?", "rl index");

  const lesson = fs.readFileSync(
    path.join(plainRoot, "policy-gradients", "lessons", "0001-score-function-identity.html"),
    "utf8"
  );
  assertIncludes(lesson, "../assets/lesson.css", "lesson 1");
  assertIncludes(lesson, "../assets/quiz.js", "lesson 1");
  assertIncludes(lesson, "../reference/0001-score-function.html", "lesson 1");
  assertIncludes(lesson, "Quiz.mount", "lesson 1");

  const rlLesson = fs.readFileSync(
    path.join(plainRoot, "rl-environments", "lessons", "0001-what-is-an-rl-environment.html"),
    "utf8"
  );
  assertIncludes(rlLesson, "../assets/lesson.css", "rl lesson");
  assertIncludes(rlLesson, "../assets/rl-env.css", "rl lesson");
  assertIncludes(rlLesson, "../assets/quiz.js", "rl lesson");
  assertIncludes(
    rlLesson,
    "../../policy-gradients/lessons/0016-grpo-group-relative-advantage.html",
    "rl lesson"
  );
  assertExcludes(rlLesson, "teach-policy-gradients", "rl lesson");

  const mission = fs.readFileSync(path.join(plainRoot, "policy-gradients", "mission.html"), "utf8");
  assertIncludes(mission, "Success looks like", "mission");
  const rlMission = fs.readFileSync(path.join(plainRoot, "rl-environments", "mission.html"), "utf8");
  assertIncludes(rlMission, 'href="../policy-gradients/"', "rl mission");
  assertExcludes(rlMission, "/workspace/", "rl mission");
  const resources = fs.readFileSync(path.join(plainRoot, "rl-environments", "resources.html"), "utf8");
  assertIncludes(resources, "../policy-gradients/lessons/0016-grpo-group-relative-advantage.html", "resources");

  for (const rel of [
    "policy-gradients/assets/lesson.css",
    "policy-gradients/assets/quiz.js",
    "policy-gradients/assets/curve-plot.js",
    "rl-environments/assets/lesson.css",
    "rl-environments/assets/quiz.js",
    "rl-environments/assets/anatomy.js",
    "rl-environments/assets/rl-env.css",
  ]) {
    const published = path.join(outputRoot, rel);
    const original = path.join(sourceRoot, rel);
    if (sha256(published) !== sha256(original)) fail(`Asset changed: ${rel}`);
  }
  if (sha256(path.join(outputRoot, "assets", "hub.css")) !== sha256(hubCssPath)) {
    fail("hub.css was not copied unchanged");
  }

  console.log(`Encrypted ${encryptedHtml.length} HTML pages under learn/.`);
}

function main() {
  const password = process.env.LEARN_PASSWORD || process.env.STATICRYPT_PASSWORD;
  if (!password) fail("Set LEARN_PASSWORD (or STATICRYPT_PASSWORD) and run this script again.");
  if (!fs.existsSync(staticryptBin)) {
    fail("Install dependencies first: cd _learn-tools && npm install");
  }
  for (const course of COURSES) {
    if (!fs.existsSync(path.join(sourceRoot, course.dir))) {
      fail(`Missing plaintext course at learn-src/${course.dir}/. See _learn-tools/README.md.`);
    }
  }

  const stageParent = fs.mkdtempSync(path.join(os.tmpdir(), "learn-hub-"));
  try {
    encrypt(password, stageParent);
    verify(password, stageParent);
  } finally {
    fs.rmSync(stageParent, { recursive: true, force: true });
  }
}

main();
