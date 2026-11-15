# Contributing

Thanks for your interest in HUD Recorder.

## Reporting a problem

Open an issue and include:

- What you did, what you expected, and what happened instead
- Your Windows version, Node.js version, camera and GPU
- Any text printed in the terminal window that `npm start` runs in

## Making a change

1. Fork the repository and create a branch from `main`.
2. Run `npm install`, then `npm start` to check the app still works.
3. Run `npm test`. Add tests for logic you add under `src/main/lib/`.
4. Open a pull request that explains what changed and why.

## Code style

- Plain JavaScript, no build step. Two-space indentation, single quotes, semicolons.
- Code, comments, commit messages and documentation are written in English.
- User-facing text goes through `src/renderer/i18n.js`; add both `en` and `zh-CN` entries.
- Keep the main process free of user-facing strings. Return error codes and translate them in
  the renderer.
- Logic that does not need Electron belongs in `src/main/lib/` so it can be unit tested.

## Adding a HUD element

HUD elements are drawn in `drawHud()` in `src/renderer/renderer.js`, using coordinates on a
1280x720 design grid. Only show real data: if a value is unavailable, hide the row instead of
showing a placeholder number.

## Adding a language

Add a new object to `STRINGS` in `src/renderer/i18n.js` with the same keys as `en`, and add an
`<option>` to the language select in `src/renderer/index.html`.
