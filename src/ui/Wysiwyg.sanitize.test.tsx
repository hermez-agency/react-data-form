import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, waitFor } from "@testing-library/react"
import WysiwygEditor from "@/ui/Wysiwyg"
import { WysiwygReader } from "@/ui/WysiwygReader"
import { configurePorts } from "@/ports"

const MALICIOUS =
  '<p onclick="alert(1)">Hello <a href="javascript:alert(1)">link</a></p>' +
  '<script>alert(1)</script><img src="x" onerror="alert(1)">'

function expectClean(html: string) {
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/\son\w+=/i)
  expect(html).not.toMatch(/javascript:/i)
}

async function mountEditor(value: string, onChange = vi.fn()) {
  const view = render(<WysiwygEditor value={value} onChange={onChange} />)
  await waitFor(() =>
    expect(view.container.querySelector(".ProseMirror")).not.toBeNull()
  )
  return { ...view, onChange, editor: view.container.querySelector(".ProseMirror")! }
}

function paste(target: Element, html: string) {
  fireEvent.paste(target, {
    clipboardData: {
      types: ["text/html", "text/plain"],
      getData: (type: string) => (type === "text/html" ? html : ""),
    },
  })
}

describe("WysiwygEditor HTML sanitizing", () => {
  afterEach(() => configurePorts({ sanitizeHtml: undefined }))

  it("cleans malicious pasted HTML out of the emitted value", async () => {
    const { editor, onChange } = await mountEditor("<p>Start</p>")

    paste(editor, MALICIOUS)

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const emitted = onChange.mock.lastCall![0] as string
    expect(emitted).toContain("Hello")
    expectClean(emitted)
    expectClean(editor.innerHTML)
  })

  it("cleans a malicious initial value, in the editor and in what it emits", async () => {
    const { editor, onChange } = await mountEditor(MALICIOUS)

    await waitFor(() => expect(editor.textContent).toContain("Hello"))
    expectClean(editor.innerHTML)

    paste(editor, "<p>More</p>")

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const emitted = onChange.mock.lastCall![0] as string
    expect(emitted).toContain("Hello")
    expectClean(emitted)
  })

  it("uses the sanitizeHtml port in place of the built-in sanitizer", async () => {
    const sanitize = vi.fn((html: string) => html.replace(/secret/g, "*"))
    configurePorts({ sanitizeHtml: sanitize })
    const { editor, onChange } = await mountEditor("<p>secret</p>")

    await waitFor(() => expect(editor.textContent).toBe("*"))

    paste(editor, "<p>another secret</p>")

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall![0]).not.toContain("secret")
    expect(sanitize).toHaveBeenCalledWith("<p>another secret</p>")
  })

  it("passes the emitted value through the sanitizeHtml port", async () => {
    // The editor drops comments when parsing: one at the end of the emitted
    // value can only come from the port.
    configurePorts({ sanitizeHtml: (html) => `${html}<!--clean-->` })
    const { editor, onChange } = await mountEditor("<p>Start</p>")

    paste(editor, "<p>More</p>")

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.lastCall![0]).toMatch(/<!--clean-->$/)
  })

  it("emits the editor HTML untouched when the port is disabled", async () => {
    configurePorts({ sanitizeHtml: false })
    const { editor, onChange } = await mountEditor(
      '<p><a href="https://example.com">a</a></p>'
    )

    paste(editor, "<p>More</p>")

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    // The built-in sanitizer would drop the link class added by the editor.
    expect(onChange.mock.lastCall![0]).toContain('class="text-primary')
  })
})

describe("WysiwygReader HTML sanitizing", () => {
  afterEach(() => configurePorts({ sanitizeHtml: undefined }))

  it("uses the sanitizeHtml port", () => {
    configurePorts({ sanitizeHtml: (html) => html.toUpperCase() })
    const { container } = render(<WysiwygReader content="<p>hi</p>" />)

    expect(container.textContent).toBe("HI")
  })

  it("displays the HTML untouched when the port is disabled", () => {
    configurePorts({ sanitizeHtml: false })
    const { container } = render(
      <WysiwygReader content={'<span data-trusted="1">hi</span>'} />
    )

    expect(container.querySelector("[data-trusted]")).not.toBeNull()
  })
})
