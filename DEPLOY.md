# Cloudflare Pages Deployment Guide

Target URL: `https://extensionguy.me/pdf-tools/`
Build output: `dist/web/`

---

## 1. Deployment Command

Run the following command from the repository root:

```bash
npx wrangler pages deploy dist/web --project-name=offline-pdf-studio
```

*(Note: Replace `offline-pdf-studio` with your specific Cloudflare Pages project name if different).*

If deploying as a subdirectory or path prefix under `https://extensionguy.me/pdf-tools/`, configure the Cloudflare Pages custom route or root directory accordingly.

---

## 2. Sitemap Entry (`sitemap.xml`)

Add the following `<url>` block to the root `sitemap.xml` for `extensionguy.me`:

```xml
  <url>
    <loc>https://extensionguy.me/pdf-tools/</loc>
    <lastmod>2026-10-28</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
```

---

## 3. Portfolio Homepage HTML Snippets

### Tools Section Snippet
Place in the interactive tools / projects section of `https://extensionguy.me/`:

```html
<article class="tool-card">
  <h3><a href="/pdf-tools/">Offline PDF Tools — merge, split, compress and redact PDFs in your browser</a></h3>
  <p>100% private, client-side PDF utility suite. Perform destructive redaction, rasterized compression, rotation, splitting, and merging entirely in browser memory with zero network uploads and zero tracking.</p>
</article>
```

### Footer Snippet
Place in the footer navigation or links list of `https://extensionguy.me/`:

```html
<li>
  <a href="/pdf-tools/">Offline PDF Tools — merge, split, compress and redact PDFs in your browser</a>
</li>
```

---

## 4. Post-Deploy Verification Checklist

- [ ] **Load Page**: Navigate to `https://extensionguy.me/pdf-tools/` in Chrome/Edge and verify the page loads cleanly over HTTPS.
- [ ] **Response Headers**:
  - `Content-Type`:
    - `index.html` → `text/html; charset=utf-8`
    - `app.js` → `application/javascript`
    - `worker.js` → `application/javascript`
    - `pdf.worker.mjs` → `application/javascript`
  - `Content-Security-Policy`: Verify CSP is sent or matches `meta http-equiv` tag (`default-src 'none'`).
- [ ] **Zero External Network Requests**: Open DevTools Network tab, ensure 0 requests are made to non-local or untrusted third-party origins.
- [ ] **Merge Tool**: Load `sample.pdf` twice, click "Merge and download", confirm downloaded `merged.pdf` contains 6 pages.
- [ ] **Split Tool**: Load `sample.pdf`, enter `1-2`, click "Extract and download", confirm downloaded file contains 2 pages.
- [ ] **Rotate Tool**: Load `sample.pdf`, select 90° clockwise on `*`, click "Rotate and download", confirm pages are rotated.
- [ ] **Compress Tool**:
  - Load `tests/fixtures/sample.pdf` (vector PDF) → verify it shows `NOT_COMPRESSIBLE` notice without downloading.
  - Load a scanned/photo PDF → verify compressed download succeeds, output file shrinks, and Producer metadata is cleared.
- [ ] **Redaction Tool**: Load `tests/fixtures/secret.pdf`, draw a box over the secret token, click "Redact, verify and download", verify the token is destroyed, box is solid black, and unredacted pages are intact.
- [ ] **Metadata Tool**: Load `sample.pdf`, click "Clear metadata and download", verify Info dictionary fields are empty.
- [ ] **Lighthouse Pass**: Run Google Chrome Lighthouse audit (Performance, Accessibility, Best Practices, SEO) — verify scores $\ge$ 95 and zero security/accessibility errors.
