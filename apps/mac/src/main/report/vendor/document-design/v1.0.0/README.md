# document-design v1.0.0

Unmodified distribution stylesheet downloaded from
<https://k-kinzal.github.io/document-design/v1.0.0/document-design.css>.

- Upstream: <https://github.com/k-kinzal/document-design/tree/v1.0.0>
- Tag commit: `98193f8923d77c8a5387879c1ca19fffef6125e2`
- SHA-256: `05f312d9faf6de35a0995cfa9434df1cab3a93c836a533307f9e23338a527793`
- License: MIT, declared in upstream `package.json` and `packages/doc-ui/package.json`.
  The tag does not include a separate license file; `NOTICE.txt` records this
  provenance and accompanies the stylesheet in generated report assets.

`assets.ts` imports these files as raw text, so the app bundle carries them without
runtime downloads or dependencies. New reports link to
`../assets/document-design-v1.0.0.css`. Existing assets retain their names and bytes.

The writer's component guide and HTML skeleton live in `prompt.ts`. Use upstream's
`.sheet` report layout, `.figures` / `.stats` arrangements, `.plate` figures,
`.draw-*` SVG roles, and `--dd-*` tokens. Keep the guide and fixture report aligned
when upgrading. The optional JavaScript is not shipped: reports are static.

Reference documentation:

- <https://k-kinzal.github.io/document-design/start/>
- <https://k-kinzal.github.io/document-design/components/report/>
- <https://k-kinzal.github.io/document-design/components/composition/>
- <https://k-kinzal.github.io/document-design/components/drawing/>

To upgrade, vendor a new version separately, update the asset names and prompt,
verify the checksum and offline rendering, and keep earlier assets intact.
