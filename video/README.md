# Demo video

The demo video on the site, made with [HyperFrames](https://hyperframes.heygen.com): HTML scenes that HyperFrames seeks frame by frame and renders to MP4. Every frame is a function of time, so the preview scrubs and the render runs in parallel.

- `index.html` is the film: the story, the end card and the soundtrack.
- `compositions/story.html` holds the windows, the Agent's chat, the cursor, the captions and Dossier itself. Its `st-timing` table sets every moment in seconds; change a time there and the motion and the sound follow.
- `compositions/endcard.html` is the end card.

Dossier in the video is a static copy of its real pages. `capture.ts` starts a throwaway Dossier with the Example (its own database in `/tmp`, never `data/` or port 4747), has the Agent's tools fill an Application, and saves the rendered pages into `story.html` between its `capture:` markers, Dossier's style sheet and fonts into `assets/`, and the Résumé as an image. The connect commands show `localhost:4747`. The story then animates the copy: fields filling, tabs, the Highlight, the Answer. Run the capture again when Dossier's pages change.

`sounds.ts` synthesizes the whole soundtrack from sines and noise, so there is no audio file to license, and writes it at −16 LUFS with true peaks under −1 dBTP:

| Sound | Plays on |
| --- | --- |
| Soft mouse click, down and up | Every cursor click, and the start and end of the drag that selects the Highlight |
| Keyboard tick, a little different each time | Each typed character, a word at a time when the Candidate deletes; a lower one for spaces; one for the pasted link |
| Whoosh, three takes in turn | The windows arriving, the switch to one page, each camera move |
| Pop | Each caption bubble, and each set of fields the Agent fills |
| Warm chime (D major bells) | The black circle landing as the dot of Dossier's i on the end card |
| Music: D, A, Bm7, Gmaj7 at 120 BPM | A quiet pad over the scattered windows; the groove drops when Dossier appears and stops as the story fades to black; the last chord rings into the end card |

```sh
cd video
npm install
npm run preview    # makes the soundtrack and opens HyperFrames Studio to scrub and edit
npm run check      # HyperFrames' lint, runtime and layout checks
npm run render     # writes site/media/dossier-demo.mp4 (1920×1080, 60 fps, H.264 CRF 20, AAC 160 kbps) and its poster, about 2 minutes
npm run capture    # copies Dossier's pages again
```

Needs ffmpeg. HyperFrames brings its own Chrome; the capture needs Google Chrome or Chromium (set `CHROME` to its binary). The scripts turn off HyperFrames’ usage telemetry.
