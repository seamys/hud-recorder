# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Screen recording: capture a screen or a window, alone or with the camera as an inset whose
  position, size and shape can be set. The app hides itself from the capture.
- Floating control bar: an always-on-top strip with record, timer, level and chapter marker.
- 120 and 240 FPS recording, limited to 1080p and to what the monitor refreshes at.
- The HUD shows the frame rate each source actually delivers next to the render rate, and the
  status line and log report the average frame rate of each saved recording.
- Camera inset shapes: 16:9, 4:3, square and circle, with optional rounded corners.

### Fixed

- A drive root such as `D:\` can now be chosen as the output folder.

## [0.5.0] - 2026-11-15

### Added

- News configuration: built-in sources, up to five custom feeds mixed together, and an
  adjustable number of headlines.
- Location configuration: a custom on-screen name in place of the city, and a switch for each
  row of the environment panel.
- Configurable output folder for recordings.
- Light interface theme modelled on VS Code, with a dark alternative in Settings.

### Fixed

- Restored main-process handlers (logging, captions, face and hand models) that an earlier edit
  had removed, and added a test that checks every bridge channel has a handler.

### Changed

- The log index moved from the recordings folder to the app's data folder, so it stays in place
  when the output folder changes. An existing index is carried over automatically.

## [0.4.0] - 2026-11-15

### Added

- Optional hand tracking: a live skeleton for both hands, left and right labels, a rule-based
  gesture name and a position readout. Off by default.
- Release builds for four targets from one tag: Windows x64, macOS Apple silicon, macOS Intel
  and Linux x64 (AppImage), gathered into a single draft release.
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
