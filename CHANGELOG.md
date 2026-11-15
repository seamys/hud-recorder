# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Optional hand tracking: a live skeleton for both hands, left and right labels, a rule-based
  gesture name and a position readout. Off by default.
- Eye analysis in speaker analysis: gaze direction and blink rate, with optional iris markers.

### Changed

- Eye contact is now judged from the iris position within the eye and from where the nose sits
  in the face, instead of from the head pose matrix, so glances are detected without a head turn.

## [0.3.0] - 2026-11-15

### Added

- Optional speaker analysis: face tracking frame, head pose, eye contact percentage and talk
  ratio, using MediaPipe Face Landmarker on the device. Off by default.
- Optional live captions transcribed on the device with Whisper, saved as `.srt`, with a
  speaking rate readout and keyword callouts. Off by default.
- Chapter markers (flag button or `M`), saved as a chapter list next to the video.
- Settings panel covering every recording and display option: resolution, frame rate, bitrates,
  format, mirroring, a switch per HUD element, colours, opacity, typeface, units and captions.
- Redesigned window: custom title bar, centred record control, slide-out settings drawer.

### Changed

- Weather requests wait up to 15 seconds and retry once.

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
