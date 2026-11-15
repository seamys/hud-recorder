<p align="center">
  <img src="build/icon.png" width="112" alt="HUD Recorder logo">
</p>

<h1 align="center">HUD Recorder</h1>

<p align="center">
  <a href="https://github.com/seamys/hud-recorder/actions/workflows/ci.yml"><img src="https://github.com/seamys/hud-recorder/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/seamys/hud-recorder/releases"><img src="https://img.shields.io/github/v/release/seamys/hud-recorder?include_prereleases&label=release" alt="Latest release"></a>
  <a href="https://github.com/seamys/hud-recorder/releases"><img src="https://img.shields.io/github/downloads/seamys/hud-recorder/total" alt="Downloads"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-6FE3E1" alt="Platform: Windows, macOS and Linux">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/seamys/hud-recorder" alt="License"></a>
  <a href="https://seamys.github.io/hud-recorder/"><img src="https://img.shields.io/badge/website-online-FF8A4C" alt="Website"></a>
</p>

A video log recorder for Windows, macOS and Linux that burns a sci-fi style heads-up display into the recording.
Think of the telemetry overlay on a rocket launch stream, or a mission log in a science fiction
film, driven by real data from your own machine.

The camera frame and the HUD are composited onto one 1080p canvas, and that canvas is what gets
recorded, so the preview is exactly what ends up in the file.

> Status: early but usable. Stage 1 of the [roadmap](#roadmap) is done.

## Features

- **Live HUD overlay** recorded into the video: recording state, log number, timecode, date and
  time, name plate, and a day counter.
- **Device telemetry**: camera resolution, measured frame rate, free disk space, and NVIDIA GPU
  load, temperature and memory (read from `nvidia-smi` when it is available).
- **Audio metering**: level, peak hold and a live spectrum from the microphone.
- **Speaker analysis** (optional, new and still being tested): a face tracking frame, head
  pose, iris tracking with gaze direction and blink rate, an eye contact percentage and a talk
  ratio, computed on your device with MediaPipe.
- **Hand tracking** (optional, new and still being tested): both hands drawn as a live 21-point
  skeleton, with left or right labels, a gesture name (open, fist, point, peace, thumb up,
  pinch, OK, or a finger count) and the hand's position in the frame.
- **Live captions** (optional, new and still being tested): speech is transcribed on your
  device with Whisper, shown at the bottom of the frame and saved as an `.srt` file. Includes a
  speaking rate readout and keyword callouts for words you choose.
- **Chapter markers**: press the flag button or `M` while recording. The chapter list is saved
  as a text file next to the video, in the format video sites accept.
- **Full control in Settings**: resolution (720p to 4K), frame rate, video and audio bitrate,
  file format, camera mirroring and framing; a switch for every HUD element; accent, text and
  recording colours, opacity and typeface; units; caption size and timing.
- **Environment panel**: location, weather, humidity, wind, air quality, sunrise and sunset for a
  city you choose.
- **News ticker**: headlines from any RSS or Atom feed, rotating at the top of the frame.
- **Automatic log keeping**: files are numbered and dated (`log-007_2026-11-15_1632.mp4`), and
  the HUD shows "Day N" counted from your first log.
- **English and Simplified Chinese** interface and HUD, switchable in settings.
- **MP4 (H.264) output** when the system supports it, with WebM as a fallback.

## Download

Installers for Windows, macOS and Linux are on the
[Releases page](https://github.com/seamys/hud-recorder/releases). The project website is at
<https://seamys.github.io/hud-recorder/>.

The builds are not code signed yet:

- **Windows**: on the SmartScreen prompt choose "More info", then "Run anyway".
- **macOS**: right-click the app, choose "Open", then confirm. Allow camera and microphone
  access when asked.

## Platform support

| Platform | Status |
| --- | --- |
| Windows 10 and 11 | Developed and tested here |
| macOS (Apple silicon and Intel) | Supported in code and built by CI, but not yet tested on real hardware. Reports welcome |
| Linux x64 (AppImage) | Built by CI, not yet tested. Reports welcome |

GPU readouts need an NVIDIA GPU with `nvidia-smi` available, so they are hidden on Macs.

## Running from source

Requirements: [Node.js](https://nodejs.org) 20 or newer, a camera and a microphone.

```bash
git clone https://github.com/seamys/hud-recorder.git
cd hud-recorder
npm install
npm start
```

On Windows you can also double-click `start.bat`, which installs dependencies on first run and
then starts the app. On macOS, the system asks for camera and microphone access the first time.

## Usage

1. Type your name and the topic of the log in the bar at the bottom. Both appear on the name
   plate and are remembered.
2. Open **Settings** (the sliders icon). The tabs cover devices, recording, HUD elements,
   appearance, weather and news, speech features and general options. Changes show in the
   preview immediately. Recording options are locked while a recording is running.
3. Press the round button to start recording and again to stop.

Recordings are saved to `Videos\HUD-Logs` on Windows and `Movies/HUD-Logs` on macOS. The folder
icon in the bar opens it.

### Where settings are stored

| What | Where |
| --- | --- |
| Name, topic, city, feed URL, log counter and log list | `index.json` in the `HUD-Logs` folder |
| All other settings, plus the chosen camera, microphone and language | The app's local storage |

Delete `index.json` to reset the log counter and the day counter.

## Troubleshooting

The app writes a diagnostics log: startup details, camera and microphone failures, recording
start and stop, and network errors. It does not contain your name, topic or any audio or video.

Open it from **Settings → Open app log folder** and attach `main.log` when you report a problem.

Common cases:

- **"No camera detected" with a camera plugged in**: another program is probably using it.
  Close OBS, video call apps or the camera vendor's webcam utility and reselect the camera.
- **The video has no sound**: check that the right microphone is selected in Settings.

## Privacy and network access

HUD Recorder has no account, no telemetry and no server of its own. It makes these outbound
requests, and only these:

| Request | When | What is sent |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com) geocoding | When you set a city | The city name you typed |
| Open-Meteo forecast and air quality | Every 10 minutes while a city is set | That city's coordinates |
| Your news feed URL | Every 10 minutes while a feed is set | A plain HTTP GET |
| Hugging Face (`huggingface.co`) | Once per caption model, the first time you switch on live captions | A plain download of the Whisper model, roughly 80 to 250 MB |
| Google storage (`storage.googleapis.com`) | Once each, the first time you switch on speaker analysis or hand tracking | A plain download of the MediaPipe face model (about 4 MB) or hand model (about 8 MB) |

Leave the city and the feed URL empty, and speaker analysis and live captions off, to keep the
app fully offline. Both features run on your device; no audio, video or face data leaves it. The default feed is a BBC
feed chosen by system language; clear the field to turn news off.

Anything shown on the HUD is recorded into the video, including the city name. Check the frame
before sharing a recording.

Open-Meteo is free for non-commercial use; see their terms if you plan to use this commercially.

## Project layout

```
src/
  main/        Main process: window, file output, log index, GPU stats, weather, news
    lib/       Pure helpers with unit tests (dates, feeds, nvidia-smi, logger, chapters and subtitles)
    asr-worker.js  Speech recognition, run in a separate utility process
  preload/     The IPC bridge exposed to the page as window.api
  renderer/    The page: capture, HUD drawing, recording, i18n, styles
test/          Unit tests (node:test, no dependencies)
build/         App icon used by the installers
site/          The project website, published with GitHub Pages
docs/          Architecture and release notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Development

```bash
npm start      # run the app
npm test       # run the unit tests
npm run dist   # build an installer for the current platform into dist/
```

Releases are built by GitHub Actions; see [docs/RELEASING.md](docs/RELEASING.md).

The HUD is drawn in `drawHud()` in `src/renderer/renderer.js`, on a 1280x720 design grid that is
scaled to 1080p. Strings live in `src/renderer/i18n.js`.

## Roadmap

- [x] **Stage 1**: camera capture, HUD compositing, MP4 recording, log numbering, environment
      panel, news ticker
- [ ] **Stage 2** (in testing): speaker analysis: face tracking frame, head pose, eye contact,
      talk ratio. Speaking rate in words per minute arrives with captions in Stage 3
- [ ] **Stage 3** (in testing): live captions, keyword callouts, chapter markers, speaking rate
- [ ] **Stage 4**: screen recording mode with a camera inset
- [ ] **Stage 5**: FFmpeg/NVENC encoding option, HUD themes, signed installers

## Known limitations

- macOS and Linux builds have not been tested on real hardware yet.
- The recorder relies on Chromium's built-in encoder. Whether it uses hardware encoding depends
  on your GPU and drivers.
- Installers are not code signed, so Windows and macOS show a warning on first launch.
- Keep the window open while recording. Minimising is fine; closing stops the recording.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
