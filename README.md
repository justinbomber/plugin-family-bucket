# Plugin Family Bucket

A **Manifest V3 Chrome extension platform** that ships multiple browser tools in one install: shared popup, options page, service worker, and per-feature modules under `plugins/`.

## Included plugins

| Plugin ID | Description |
|-----------|-------------|
| `full-screen-toggle` | YouTube windowed fullscreen (popup window without browser chrome), player controls, keyboard shortcuts |
| `markdown-viewer` | Render local and remote Markdown in the browser (`file://` and optional remote origins) |

## Requirements

- [Google Chrome](https://www.google.com/chrome/) (or Chromium) with extension developer mode
- [Node.js](https://nodejs.org/) 18+ (for manifest merge and store packaging scripts only)

## Load unpacked (development)

1. From the **repository root**, run:

   ```bash
   node plugin-family-bucket/scripts/merge-manifest.mjs
   ```

2. Open `chrome://extensions` → enable **Developer mode** → **Load unpacked**.
3. Select the **`plugin-family-bucket/`** folder (the directory that contains the root `manifest.json`).

After changing `manifest.base.json` or any `plugins/*/manifest.fragment.json`, run `merge-manifest.mjs` again and reload the extension.

## Build for Chrome Web Store

The Web Store rejects ZIP archives that contain more than one file named `manifest.json`. This project keeps module declarations in `manifest.fragment.json` and packages a store-ready ZIP with a single root manifest.

```bash
node plugin-family-bucket/scripts/package-store.mjs
```

Output: `plugin-family-bucket/dist/plugin-family-bucket-<version>.zip`

Upload that ZIP in the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole). The archive root must be `manifest.json`, `src/`, `plugins/`, etc.—not a nested `plugin-family-bucket/` folder.

## Project layout

```
plugin-family-bucket/
├── manifest.json              # Merged manifest (generated; safe to commit)
├── manifest.base.json         # Platform manifest (popup, options, background)
├── plugins/
│   └── <plugin-id>/
│       ├── manifest.fragment.json   # Module permissions & content scripts (merge input)
│       ├── src/
│       └── ...
├── src/                       # Platform: service worker, popup, options, core
└── scripts/
    ├── merge-manifest.mjs     # Merge base + fragments → manifest.json
    ├── package-store.mjs      # Produce Web Store ZIP
    └── bundle-markdown-sw.mjs # Bundle markdown-viewer background for MV3 SW
```

## Adding a plugin

1. Create `plugins/<kebab-case-id>/` with `manifest.fragment.json`, `src/plugin.js` (extends `BasePlugin`), and other assets.
2. Register the plugin in the platform bootstrap (service worker / registry) as existing modules do.
3. Run `node plugin-family-bucket/scripts/merge-manifest.mjs`.
4. Reload the extension in `chrome://extensions`.

Do **not** name module manifest files `manifest.json`—only the extension root may use that filename for store uploads.

## Markdown Viewer notes

- Background logic is bundled into `plugins/markdown-viewer/background/markdown-sw.bundle.mjs` (run via `merge-manifest` or `bundle-markdown-sw.mjs` after editing `background/`).
- For `file://` URLs, enable **Allow access to file URLs** for this extension on `chrome://extensions`.

## Storage

Platform state uses `chrome.storage.local` under the key `pluginFamilyBucket:v1`. Upgrades from the older `pluginSuite:v1` key are migrated automatically on first run.

## License

This project is licensed under the [MIT License](LICENSE).

Copyright © 2026 [justinbomber](https://github.com/justinbomber).
