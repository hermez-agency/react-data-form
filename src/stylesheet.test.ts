// @vitest-environment node
/* The stylesheet Tailwind builds from the components asks Chrome nothing it
 * cannot narrow.
 *
 * A `:has()` written before the element a rule styles — `.x:has(…) > [a]`,
 * `:is(.group:has(…) *)`, which `group-has-*` and `has-[…]:[&>…]:` compile to
 * — leaves Chrome unable to tell which elements a change under it may now
 * match: in an app built with these components, each element inserted under
 * `<body>` (a window's portal) restyled every element of the page when the
 * subject was anything, every element with a `data-slot` or a `role` when it
 * was one of those — a second to open a window over a table of 57,000 nodes.
 * `.x > [data-slot] ~ [data-slot]` (a slot after another slot) marks every
 * parent of a slot, `<body>` too, as styling its children by the ones before
 * them, with the same cost at each window's closing.
 *
 * The components put the `:has()` on the element itself, or keep their own
 * class as the subject (`:where([data-slot=field]):has(…) .class`), and say
 * "not the first one" with `:nth-child(n + 2 of …)` rather than `~`.
 *
 * What is read is what an app's Tailwind generates from the library: every
 * class written in `src/`, compiled with the theme and `styles.css`.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { compile } from "tailwindcss"
import { describe, expect, it } from "vitest"

const root = join(process.cwd(), "src")
const tailwind = dirname(
  createRequire(import.meta.url).resolve("tailwindcss/package.json")
)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    if (!/\.tsx?$/.test(entry.name) || /\.test(-d)?\.tsx?$/.test(entry.name))
      return []
    return [path]
  })
}

/** The sheet Tailwind writes for every word of `src/` that is a class. */
async function stylesheet(): Promise<string> {
  const candidates = new Set(
    sourceFiles(root).flatMap((path) => readFileSync(path, "utf8").split(/[\s"'`]+/))
  )
  const compiler = await compile(
    `@import "tailwindcss/theme.css"; @import "tailwindcss/utilities.css"; @import "./styles.css";`,
    {
      base: root,
      loadStylesheet: async (id, base) => {
        const path = id.startsWith("tailwindcss/")
          ? join(tailwind, id.slice("tailwindcss/".length))
          : join(base, id)
        return { path, base: dirname(path), content: readFileSync(path, "utf8") }
      },
    }
  )
  return compiler.build([...candidates])
}

/** Where the group that opens before `from` closes — at a comma too, with `list` — or the end of the text. */
function groupEnd(text: string, from: number, list = true): number {
  let depth = 0
  for (let at = from; at < text.length; at++) {
    const char = text[at]
    if (char === "\\") at++
    else if (char === "(") depth++
    else if (char === ")") {
      if (depth === 0) return at
      depth--
    } else if (list && char === "," && depth === 0) return at
  }
  return text.length
}

/** A selector list cut at its own commas. */
function items(list: string): string[] {
  const out: string[] = []
  let start = 0
  for (let at = groupEnd(list, 0); at < list.length; at = groupEnd(list, at + 1)) {
    out.push(list.slice(start, at).trim())
    start = at + 1
  }
  out.push(list.slice(start).trim())
  return out
}

/** A rule nested in another, written out whole: `&` is the parent, or the parent comes first. */
function nested(parent: string | undefined, child: string): string {
  if (!parent) return child
  return items(parent)
    .flatMap((outer) =>
      items(child).map((inner) =>
        inner.includes("&") ? inner.replaceAll("&", outer) : `${outer} ${inner}`
      )
    )
    .join(",")
}

/** Every selector of a sheet — in an at-rule's block, or nested in another rule — as the browser reads it. */
function selectors(css: string): string[] {
  const found: string[] = []
  // What each open block is: the selector of a rule, or nothing for an at-rule.
  const open: (string | undefined)[] = []
  let start = 0
  let quote = ""
  for (let at = 0; at < css.length; at++) {
    const char = css[at]
    if (quote) {
      if (char === "\\") at++
      else if (char === quote) quote = ""
    } else if (char === "\\") at++
    else if (char === '"' || char === "'") quote = char
    else if (char === "{") {
      const prelude = css.slice(start, at).trim()
      const parent = open.findLast((selector) => selector !== undefined)
      if (prelude.startsWith("@")) open.push(undefined)
      else {
        const whole = nested(parent, prelude)
        found.push(whole)
        open.push(whole)
      }
      start = at + 1
    } else if (char === "}") {
      open.pop()
      start = at + 1
    } else if (char === ";") start = at + 1
  }
  return found
}

/** The text with what is inside parentheses — and brackets, with `brackets` — emptied: what is left is its own level. */
function ownLevel(text: string, brackets = true): string {
  const opening = brackets ? "([" : "("
  const closing = brackets ? ")]" : ")"
  let out = ""
  let depth = 0
  for (let at = 0; at < text.length; at++) {
    const char = text[at]
    if (char === "\\") {
      if (depth === 0) out += text.slice(at, at + 2)
      at++
    } else if (opening.includes(char)) {
      if (depth === 0) out += char
      depth++
    } else if (closing.includes(char)) {
      depth--
      if (depth === 0) out += char
    } else if (depth === 0) out += char
  }
  return out
}

/** Each `:has()` of a selector that is not on the element the rule styles, with that element. */
function hasBefore(selector: string): { has: string; subject: string }[] {
  const wrong: { has: string; subject: string }[] = []
  for (
    let at = selector.indexOf(":has(");
    at >= 0;
    at = selector.indexOf(":has(", at + 1)
  ) {
    const close = groupEnd(selector, at + 5, false)
    // What follows the `:has()` in its own group: the rest of the selector, or
    // of the `:is()` / `:not()` it is written in.
    const rest = ownLevel(selector.slice(close + 1, groupEnd(selector, close + 1)))
    const combinator = rest.search(/[\s>+~]/)
    if (combinator < 0) continue
    const subject =
      rest
        .slice(combinator)
        .trim()
        .split(/[\s>+~]+/)
        .pop() ?? ""
    // A class or a tag narrows it down; `*`, an attribute or a pseudo-class alone do not.
    if (/^[a-z][a-z0-9-]*|\.(?:[^\s\\]|\\.)/i.test(subject)) continue
    wrong.push({ has: selector.slice(at, close + 1), subject: subject || "*" })
  }
  return wrong
}

/** Whether a selector styles, with `~`, an element that is anything, or any slot or role. */
function siblingOfAny(selector: string): boolean {
  return items(selector).some((item) => {
    // `~=` compares an attribute, it is no combinator.
    const level = ownLevel(item, false).replaceAll("~=", "*=").trim()
    const combinator = level.match(/\s*([\s>+~])\s*(?=[^\s>+~]*$)/)
    if (combinator?.[1] !== "~") return false
    const subject = level.slice(combinator.index! + combinator[0].length)
    return /^(\*|\[data-slot\]|\[role\])?(:[a-z-]+(\(\))?)*$/.test(subject)
  })
}

describe("the checks", () => {
  it("find what Tailwind compiles group-has and has-[…]:[&>…]: to", () => {
    expect(hasBefore(".a:is(:where(.group\\/field):has(:disabled) *)")).toHaveLength(
      1
    )
    expect(
      hasBefore(
        ".c:has(>[data-variant=outline])>[data-slot=select-trigger]:focus-visible"
      )
    ).toHaveLength(1)
    expect(
      hasBefore(
        ".d:has(>[data-slot=field-content])>[role=checkbox], .d:has(>[data-slot=field-content]) [role=radio]"
      )
    ).toHaveLength(2)
    expect(siblingOfAny(".e > [data-slot] ~ [data-slot]")).toBe(true)
    expect(siblingOfAny(".e > [data-state] ~ *")).toBe(true)
  })

  it("let a :has() on the element itself, or before a class, by", () => {
    expect(hasBefore(".has-\\[\\>svg\\]\\:px-4:has(>svg)")).toEqual([])
    expect(hasBefore("[data-slot]:not(:has(~[data-slot]))")).toEqual([])
    expect(
      hasBefore(
        ":where([data-slot=item]):has([data-slot=item-description]) .f\\:self-start"
      )
    ).toEqual([])
    expect(
      hasBefore(".g > :is([role=checkbox]):has(~[data-slot=field-content])")
    ).toEqual([])
    expect(siblingOfAny(".e > [data-slot]:nth-child(n + 2 of [data-slot])")).toBe(
      false
    )
    expect(
      siblingOfAny(".peer-disabled\\:opacity-50:is(:where(.peer):disabled ~ *)")
    ).toBe(false)
    expect(siblingOfAny("[cmdk-group]:not([hidden]) ~ [cmdk-group]")).toBe(false)
  })

  it("read a nested rule with its parent", () => {
    expect(
      selectors(
        "@layer x{body:has([data-slot=head]){color:red;[data-slot=tabs]>.card{color:blue}}}"
      )
    ).toEqual([
      "body:has([data-slot=head])",
      "body:has([data-slot=head]) [data-slot=tabs]>.card",
    ])
  })
})

describe("the components' stylesheet", () => {
  it("has no :has() before a subject Chrome cannot narrow", async () => {
    const css = await stylesheet()
    // The sheet is the one the classes make: an empty one would pass anything.
    expect(css).toContain(":where([data-slot=field]):has(:disabled)")

    const wrong = selectors(css).flatMap((selector) =>
      hasBefore(selector).map(
        ({ has, subject }) => `${has} before ${subject} in ${selector}`
      )
    )
    expect(wrong).toEqual([])
  })

  it("has no `~` styling an element that is anything, or any slot", async () => {
    const wrong = selectors(await stylesheet()).filter(siblingOfAny)
    expect(wrong).toEqual([])
  })
})
