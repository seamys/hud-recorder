# Architecture

HUD Recorder is an Electron app with no build step and one runtime dependency (Electron itself).

## Processes

```
+--------------------+        IPC (window.api)        +----------------------+
|  Renderer (page)   | <----------------------------> |  Main process        |
|                    |                                |                      |
|  getUserMedia      |   rec:start / chunk / stop     |  write stream to     |
|  canvas compositor |   log:info, log:saveProfile    |  Videos\HUD-Logs     |
|  MediaRecorder     |   sys:stats                    |  index.json          |
|  HUD drawing       |   env:get / setCity / setFeed  |  nvidia-smi polling  |
|  i18n              |                                |  Open-Meteo, RSS     |
+--------------------+                                +----------------------+
```

The page runs with `contextIsolation` on and `nodeIntegration` off. Everything it can ask the
main process to do is listed in `src/preload/preload.js`.

## Recording pipeline

1. `getUserMedia` provides a camera stream and a microphone stream.
2. On every frame (capped at about 60 per second), the renderer draws the camera frame to a
   1920x1080 canvas, cover-fitted to 16:9, then draws the HUD on top.
3. `canvas.captureStream(60)` turns the canvas into a video track. The microphone track is added
   to the same stream.
4. `MediaRecorder` encodes that stream, preferring MP4 (H.264 + AAC) and falling back to WebM.
5. Encoded chunks arrive once per second and are sent to the main process, which appends them to
   the output file. Writes are chained so chunks can never be written out of order.
6. On stop, the main process closes the file and adds an entry to `index.json`.

Because the HUD is part of the canvas, there is no separate overlay track: the preview and the
recording are the same pixels.

## HUD layout

The HUD is designed on a 1280x720 grid and scaled by 1.5 to 1080p. Three layers are planned:

| Layer | Behaviour | Examples |
| --- | --- | --- |
| Persistent | Always visible, pinned to the corners | Recording state, timecode, name plate |
| Contextual | Appears when relevant | News headline, future keyword callouts |
| Ambient | Low contrast, always moving | Edge rulers, spectrum |

All values on the HUD are real. When a value is unavailable (no NVIDIA GPU, no city set), its row
is hidden.

## Data sources

| Data | Source | Refresh |
| --- | --- | --- |
| GPU load, temperature, memory | `nvidia-smi` | 2 s |
| Free disk space | `fs.statfs` on the output folder | 2 s |
| Weather, air quality, sun times | Open-Meteo | 10 min |
| Headlines | The configured RSS or Atom feed | 10 min |
| Audio level and spectrum | Web Audio `AnalyserNode` | Every frame |

## Logging

`src/main/lib/logger.js` appends timestamped lines to `main.log` in Electron's log folder and
keeps one rotated file. The page forwards device failures and script errors over the `log:write`
IPC channel, so one file covers both processes. Names, topics and media are never logged.

## Testing

Logic that does not depend on Electron lives in `src/main/lib/` and is covered by `node:test`
unit tests in `test/`. The Electron parts are verified by running the app.
