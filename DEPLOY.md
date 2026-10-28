# Deployment Guide: extensionguy.me/pdf-tools/

Target URL: `https://extensionguy.me/pdf-tools/`
Build output: `dist/web/`

The web demo is hosted as a subdirectory (`/pdf-tools/`) of the existing `extensionguy.me` portfolio site, which is git-connected to Cloudflare Pages.

---

## 1. Staging the Build into the Portfolio Repository

1. Ensure the production web build is up-to-date:
   ```bash
   npm run build
   ```
2. Run the staging script to copy `dist/web/` into the `pdf-tools/` directory of your portfolio repository:
   ```bash
   node scripts/stageToPortfolio.mjs <path-to-portfolio-repo>
   ```
   *Example:*
   ```bash
   node scripts/stageToPortfolio.mjs ~/projects/extensionguy.me
   ```

3. Navigate to your portfolio repository, review the changes, commit, and push:
   ```bash
   cd <path-to-portfolio-repo>
   git status
   git add pdf-tools/
   git commit -m "feat(pdf-tools): update offline pdf tools web demo"
   git push origin main
   ```
   Cloudflare Pages will automatically deploy the commit to `https://extensionguy.me/pdf-tools/`.

---

## 2. Sitemap Entry (`sitemap.xml`)

Add the following `<url>` block to the root `sitemap.xml` in your `extensionguy.me` repository:

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
  - Load `sample.pdf` (vector PDF) → verify it shows `NOT_COMPRESSIBLE` notice without downloading.
  - Load a scanned/photo PDF → verify compressed download succeeds, output file shrinks, and Producer metadata is cleared.
- [ ] **Redaction Tool**: Load `secret.pdf`, draw a box over the secret token, click "Redact, verify and download", verify the token is destroyed, box is solid black, and unredacted pages are intact.
- [ ] **Metadata Tool**: Load `sample.pdf`, click "Clear metadata and download", verify Info dictionary fields are empty.
- [ ] **Lighthouse Pass**: Run Google Chrome Lighthouse audit (Performance, Accessibility, Best Practices, SEO) — verify scores $\ge$ 95 and zero security/accessibility errors.
