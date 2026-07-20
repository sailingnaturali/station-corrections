/**
 * Derive a URL slug from a display name.
 *
 * Deterministic, so a name and its slug always agree; the corrections file can
 * still pin an explicit slug when the derived one is ugly or would collide.
 */
export function toSlug(name) {
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
