# document-design v1.1.0

Unmodified distribution stylesheet downloaded from
<https://k-kinzal.github.io/document-design/v1.1.0/document-design.css>.

- Upstream: <https://github.com/k-kinzal/document-design/tree/v1.1.0>
  ([release](https://github.com/k-kinzal/document-design/releases/tag/v1.1.0))
- Tag commit: `ee789d04fb775b735c3217d74019642485c9a297`
- SHA-256: `8874255e9deb2d159016522e985015be6a5d7a88c90c077704b5d762567b7ebd`
- License: MIT. `LICENSE` is the unmodified
  <https://k-kinzal.github.io/document-design/v1.1.0/LICENSE>, identical to the tag's
  root `LICENSE`; the stylesheet also carries it in its leading comment. `NOTICE.txt`
  records this provenance with the license text and accompanies the stylesheet in
  generated report assets.

`assets.ts` imports these files as raw text, so the app bundle carries them without
runtime downloads or dependencies. New reports link to
`../assets/document-design-v1.1.0.css`. Existing assets retain their names and bytes:
reports written against v1.0.0 keep `document-design-v1.0.0.css`, and the v1.0.0
directory beside this one records its provenance.

The writer's component guide and HTML skeleton live in `prompt.ts`. Use upstream's
`.sheet` report layout, `.hero` (a comparison or `.hero > .figures`), `.figures` /
`.stats` arrangements, `.plate` figures, `.timeline`, `.cite` / `.sources` citations,
`.draw-*` SVG roles, and `--dd-*` tokens. The page root sets
`data-dd-paper="a4"` and `data-dd-print-urls="sources"` for printing. Keep the guide and
fixture report aligned when upgrading. The optional JavaScript is not shipped: reports
are static.

Reference documentation:

- <https://k-kinzal.github.io/document-design/v1.1.0/DESIGN.md>
- <https://k-kinzal.github.io/document-design/components/report/>
- <https://k-kinzal.github.io/document-design/components/timeline/>
- <https://k-kinzal.github.io/document-design/components/sources/>
- <https://k-kinzal.github.io/document-design/components/composition/>
- <https://k-kinzal.github.io/document-design/components/drawing/>

To upgrade, vendor a new version separately, update the asset names and prompt,
verify the checksum and offline rendering, and keep earlier assets intact.
