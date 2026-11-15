# Releasing

Releases are built by GitHub Actions. Nothing needs to be built on your own machine.

1. Update `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Commit and push to `main`.
3. Tag the commit and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. The **Release** workflow builds a Windows installer (`.exe`) and macOS disk images (`.dmg`
   for Intel and Apple silicon) and attaches them to a **draft** release.
5. Open the draft on the repository's Releases page, check the files, write the notes, and
   publish it.

To build locally instead, run `npm run dist`. Output goes to `dist/`.

## Code signing

The builds are not signed with a paid developer certificate.

- Windows shows a SmartScreen prompt on first run: choose "More info", then "Run anyway".
- macOS blocks the first launch: right-click the app, choose "Open", then confirm.

Signing needs a Windows code signing certificate and an Apple Developer ID. electron-builder
picks them up from the `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables when they are
set as repository secrets.
