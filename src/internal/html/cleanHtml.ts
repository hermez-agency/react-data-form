import { getPorts } from "@/ports"
import { sanitizeHtml } from "@/ui/sanitizeHtml"

/**
 * Cleans rich-text HTML with the `sanitizeHtml` port: the built-in allow-list
 * sanitizer unless the application replaced it, untouched when it set the
 * port to `false`.
 */
export function cleanHtml(html: string): string {
  const sanitize = getPorts().sanitizeHtml
  if (sanitize === false) return html
  return (sanitize ?? sanitizeHtml)(html)
}
