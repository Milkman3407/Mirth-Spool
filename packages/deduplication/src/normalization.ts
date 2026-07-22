import { createHash } from "node:crypto";

const trackingNames = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
]);

export function normalizeCanonicalUrl(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new TypeError("Canonical URL must be an HTTP(S) URL.");
  }
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    const normalized = name.toLowerCase();
    if (normalized.startsWith("utm_") || trackingNames.has(normalized)) {
      url.searchParams.delete(name);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

export function canonicalUrlHash(value: string): string {
  return createHash("sha256")
    .update(normalizeCanonicalUrl(value))
    .digest("hex");
}

export function normalizeTag(value: string): string | null {
  const slug = value
    .normalize("NFKC")
    .trim()
    .replace(/^#+/u, "")
    .toLocaleLowerCase("und")
    .replace(/[\s_]+/gu, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80);
  return slug && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug) ? slug : null;
}
