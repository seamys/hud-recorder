# HUD Recorder

A video log recorder for Windows that burns a sci-fi style heads-up display into the recording.
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
- **Environment panel**: location, weather, humidity, wind, air quality, sunrise and sunset for a
  city you choose.
- **News ticker**: headlines from any RSS or Atom feed, rotating at the top of the frame.
- **Automatic log keeping**: files are numbered and dated (`log-007_2026-11-15_1632.mp4`), and
  the HUD shows "Day N" counted from your first log.
- **English and Simplified Chinese** interface and HUD, switchable in settings.
- **MP4 (H.264) output** when the system supports it, with WebM as a fallback.

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org) 20 or newer
- A camera and a microphone
- Optional: an NVIDIA GPU with drivers installed, for the GPU readouts

## Getting started

```bash
git clone https://github.com/seamys/hud-recorder.git
cd hud-recorder
npm install
npm start
```

On Windows you can also double-click `start.bat`, which installs dependencies on first run and
then starts the app.

## Usage

1. Type your name and the topic of the log in the bar at the bottom. Both appear on the name
   plate and are remembered.
2. Open **Settings** (the sliders icon) to choose the camera and microphone, set a city for the
   environment panel, set a news feed, or change the language. Press Enter in a text field to
   apply it.
3. Press the round button to start recording and again to stop.

Recordings are saved to `Videos\HUD-Logs`. The folder icon in the bar opens it.

### Where settings are stored

| What | Where |
| --- | --- |
| Name, topic, city, feed URL, log counter and log list | `Videos\HUD-Logs\index.json` |
| Chosen camera, microphone and language | The app's local storage |

Delete `index.json` to reset the log counter and the day counter.

## Privacy and network access

HUD Recorder has no account, no telemetry and no server of its own. It makes these outbound
requests, and only these:

| Request | When | What is sent |
| --- | --- | --- |
| [Open-Meteo](https://open-meteo.com) geocoding | When you set a city | The city name you typed |
| Open-Meteo forecast and air quality | Every 10 minutes while a city is set | That city's coordinates |
| Your news feed URL | Every 10 minutes while a feed is set | A plain HTTP GET |

Leave the city and the feed URL empty to keep the app fully offline. The default feed is a BBC
feed chosen by system language; clear the field to turn news off.

Anything shown on the HUD is recorded into the video, including the city name. Check the frame
before sharing a recording.

Open-Meteo is free for non-commercial use; see their terms if you plan to use this commercially.

## Project layout

```
src/
  main/        Main process: window, file output, log index, GPU stats, weather, news
    lib/       Pure helpers with unit tests (dates, feed parsing, nvidia-smi parsing)
  preload/     The IPC bridge exposed to the page as window.api
  renderer/    The page: capture, HUD drawing, recording, i18n, styles
test/          Unit tests (node:test, no dependencies)
docs/          Architecture notes
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Development

```bash
npm start      # run the app
npm test       # run the unit tests
```

The HUD is drawn in `drawHud()` in `src/renderer/renderer.js`, on a 1280x720 design grid that is
scaled to 1080p. Strings live in `src/renderer/i18n.js`.

## Roadmap

- [x] **Stage 1**: camera capture, HUD compositing, MP4 recording, log numbering, environment
      panel, news ticker
- [ ] **Stage 2**: speaker analysis: face tracking frame, head pose, eye contact, speaking rate
- [ ] **Stage 3**: live captions, keyword callouts, chapter markers
- [ ] **Stage 4**: screen recording mode with a camera inset
- [ ] **Stage 5**: FFmpeg/NVENC encoding option, HUD themes, packaged installer

## Known limitations

- Windows only for now. macOS and Linux are untested.
- The recorder relies on Chromium's built-in encoder. Whether it uses hardware encoding depends
  on your GPU and drivers.
- There is no packaged installer yet; the app runs from source.
- Keep the window open while recording. Minimising is fine; closing stops the recording.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

[MIT](LICENSE)
