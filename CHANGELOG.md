# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-15

### Added

- macOS support: camera and microphone permission prompts, platform fonts, Intel and Apple
  silicon builds. Not yet tested on real hardware.
- Diagnostics log file with size-based rotation, and an "Open app log folder" link in Settings.
- App icon.
- Release workflow that builds Windows and macOS installers into a draft GitHub release.
- Project website published with GitHub Pages.
- CI now runs on Windows and macOS.

## [0.1.0] - 2026-11-15

### Added

- Camera and microphone capture composited with a HUD onto a 1080p canvas.
- Recording to MP4 (H.264) with a WebM fallback.
- Automatic log numbering, dated file names and a day counter.
- Device telemetry: camera resolution, frame rate, free disk space, NVIDIA GPU stats.
- Audio level, peak hold and spectrum.
- Environment panel backed by Open-Meteo: weather, humidity, wind, air quality, sunrise, sunset.
- News ticker from an RSS or Atom feed.
- English and Simplified Chinese interface.
- Settings panel for devices, city, feed and language.
