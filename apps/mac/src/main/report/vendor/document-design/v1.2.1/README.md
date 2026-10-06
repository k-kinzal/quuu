# document-design v1.2.1

Unmodified distribution stylesheet downloaded from the fixed release URL:
<https://k-kinzal.github.io/document-design/v1.2.1/document-design.css>.

- Upstream: <https://github.com/k-kinzal/document-design/tree/v1.2.1>
  ([release](https://github.com/k-kinzal/document-design/releases/tag/v1.2.1))
- Tag commit: `8a9032c7546db6dd9c55e38f15e6c9e388987fab`
- Stylesheet SHA-256: `17d7832ef632ad4c7101d479b3dbcc64beac0e7417c3ac51a66f99964f0bc918`
- License SHA-256: `390aeb080eabe1cf8c276d6c32e0520649301bbee2126c1647f7e409f47225ad`
- `LICENSE` and `VERSION` are unchanged copies from the same `/v1.2.1/` base.
  The MIT license matches the tag's root `LICENSE`; the stylesheet also includes
  it in its leading comment. `NOTICE.txt` adds provenance and the complete license
  for distribution beside generated reports.
- The CSS, license and version bytes also match the release's
  [ZIP](https://github.com/k-kinzal/document-design/releases/download/v1.2.1/doc-ui-v1.2.1.zip),
  verified against its published
  [SHA256SUMS](https://github.com/k-kinzal/document-design/releases/download/v1.2.1/doc-ui-v1.2.1-SHA256SUMS.txt).
  ZIP SHA-256: `f30bf580ea8c68c554c39fc907830c39a4ffb4ab197a34988ba70f48b728a1dc`.

`assets.ts` bundles the raw CSS and notice without runtime downloads. New reports
link to `../assets/document-design-v1.2.1.css`; generation restores that file and
`document-design-v1.2.1.NOTICE.txt` only. Existing v1.0.0 and v1.1.0 stylesheets,
notices, and the original `report.css` retain their names and bytes. Their vendored
source directories remain intact for archived documents.

## Compatibility review from v1.1.0

The release preserves the HTML authoring contract. All static components and
`--dd-*` tokens taught in `prompt.ts` remain available: `.sheet`, comparison and
figure heroes, `.sec`, `.figures`, `.stats`, `.plate`, `.timeline`, `.cite`,
`.sources`, and `.draw-*` SVG roles. No class renames or report migration are needed.

The report changes fix comparison row alignment, long numeric values, narrow
heading hierarchy and section labels. Preserve numeric precision and let `.fig`
scroll locally on screen; check full values in print. Print fixes keep source URLs
visible inside prose sources, force light inks, and improve pagination and figure
spacing across system fonts. Keep `lang="ja"` / `lang="en"`,
`data-dd-paper="a4"` and `data-dd-print-urls="sources"` in the generated skeleton.

Print limitation observed in Electron/Chromium: a long, multiline `.lead` can
split across pages. Keep section leads concise as the prompt specifies and inspect
page breaks when printing. The vendored CSS is not patched to change this behavior.

The new Markdown CLI, research-paper/book layouts and palette overlays are outside
this integration. No additional assets or runtime dependencies are required.
The optional upstream JavaScript remains unshipped and disabled in Quuu's
local-only viewer; prompt guidance also excludes the new palette controls.

Reference documentation (fixed to this release):

- <https://k-kinzal.github.io/document-design/v1.2.1/DESIGN.md>
- [Report layout](https://github.com/k-kinzal/document-design/blob/v1.2.1/packages/doc-ui/src/layout/report.css)
- [Composition](https://github.com/k-kinzal/document-design/blob/v1.2.1/packages/doc-ui/src/components/composition.css)
- [Print rules](https://github.com/k-kinzal/document-design/blob/v1.2.1/packages/doc-ui/src/base/print.css)
- [Changes since v1.1.0](https://github.com/k-kinzal/document-design/compare/v1.1.0...v1.2.1)

To upgrade, acquire a new full-version distribution separately, verify its release
commit and checksums, and preserve its bytes. Update the asset imports, filenames,
notice, prompt guidance, guide and tests together. Verify offline generation,
English/Japanese rendering and printing; keep earlier assets intact. Never acquire
from floating latest, major or minor URLs.
