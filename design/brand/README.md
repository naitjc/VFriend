# Companion V

The selected VFriend identity combines two companions into a V. The four original proposals and web research are preserved in [icon-concepts](../icon-concepts/README.md).

`companion-v-reference.png` is the selected imagegen concept. `icon.json` is the production vector interpretation: two rounded figures, soft folds and a light violet background. It preserves the selected concept while simplifying raster shading for small sizes. It is not an automatic pixel-perfect trace. The previous `conversation-v-reference.png` remains available as design history.

Run `npm run icons` from the repository root after changing the JSON source. The Python generator has no external dependencies and writes:

- `vfriend.svg` here and the Web favicon in `apps/client/public/`.
- Android foreground, background, legacy rounded/round backgrounds and monochrome vector drawables.
- API 24 legacy launcher fallbacks, API 26 adaptive icons and API 33 adaptive icons with a monochrome layer.

The Android canvas is 108 dp; the symbol stays inside the central 66 dp safe region. Adaptive layers leave masking to the launcher. The Web tile has rounded corners, while the Android foreground has no baked-in outer mask. The splash screen uses the same foreground on the coordinating violet background.

Open `preview.html` to compare the Web tile, round mask, monochrome silhouette and small sizes. Its masks are design previews, not a substitute for a device launcher check.

The original concepts were generated using the built-in imagegen tool. Production SVG/XML geometry is maintained in the repository. Full original prompts are in [prompts.md](../icon-concepts/prompts.md). No third-party brand icon was copied.
