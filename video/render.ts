// Renders the demo video for the site: makes the soundtrack, renders the frames with HyperFrames at 1920×1080 and
// 60 fps, then muxes the soundtrack as 160 kbps AAC and takes the poster from the one-page moment.
//
//   npm run render

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const video = import.meta.dirname;
const media = join(video, '..', 'site', 'media');
const work = '/tmp/dossier-render';
const story = readFileSync(join(video, 'compositions', 'story.html'), 'utf8');
const timing = JSON.parse(story.match(/<script type="application\/json" id="st-timing">([\s\S]*?)<\/script>/)![1]);
const picture = join(work, 'picture.mp4');

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
await run('node', [join(video, 'sounds.ts')]);
await run('npx', ['hyperframes', 'render', '--fps', '60', '--crf', '20', '--quiet', '-o', picture]);
mkdirSync(media, { recursive: true });
await run('ffmpeg', ['-y', '-v', 'error', '-i', picture, '-i', join(video, 'assets', 'audio', 'soundtrack.wav'),
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-shortest', '-movflags', '+faststart',
  join(media, 'dossier-demo.mp4')]);
await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(timing.events.poster.at), '-i', picture, '-frames:v', '1', '-q:v', '2',
  join(media, 'dossier-demo-poster.jpg')]);
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${join(media, 'dossier-demo.mp4')} and its poster.`);

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    spawn(command, args, { stdio: 'inherit', cwd: video, env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1' } })
      .on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}
