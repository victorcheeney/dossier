// Makes the demo video's soundtrack: an upbeat 120 BPM track and every sound effect, all synthesized here from sines
// and noise, so there is no audio file to license. The effects land on the times in compositions/story.html's timing
// table. Writes assets/audio/soundtrack.wav at -16 LUFS with true peaks under -1 dBTP.
//
//   node sounds.ts

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Event = { at: number; dur?: number; sound?: string; text?: string; cps?: number; gap?: number; x?: number };

const rate = 48000;
const tau = Math.PI * 2;
const video = import.meta.dirname;
const story = readFileSync(join(video, 'compositions', 'story.html'), 'utf8');
const timing = JSON.parse(story.match(/<script type="application\/json" id="st-timing">([\s\S]*?)<\/script>/)![1]);
const root = readFileSync(join(video, 'index.html'), 'utf8');
const duration = Number(root.match(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/)![1]);
const beat = 60 / timing.bpm;
const bar = beat * 4;
const length = Math.ceil(duration * rate);

let seed = 11;
const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const noise = () => random() * 2 - 1;
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

class Stereo {
  ch: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  // Adds a sample with an equal-power pan, -1 left to 1 right.
  add(i: number, sample: number, pan = 0) {
    if (i < 0 || i >= length) return;
    const angle = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
    this.ch[0][i] += sample * Math.cos(angle) * Math.SQRT2;
    this.ch[1][i] += sample * Math.sin(angle) * Math.SQRT2;
  }
}

// An RBJ biquad filter.
class Biquad {
  b0 = 0; b1 = 0; b2 = 0; a1 = 0; a2 = 0;
  x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  constructor(type: 'lowpass' | 'bandpass' | 'highpass', freq: number, q: number) {
    this.set(type, freq, q);
  }
  set(type: 'lowpass' | 'bandpass' | 'highpass', freq: number, q: number) {
    const w = (tau * Math.min(freq, rate * 0.45)) / rate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    if (type === 'lowpass') [this.b0, this.b1, this.b2] = [(1 - cos) / 2 / a0, (1 - cos) / a0, (1 - cos) / 2 / a0];
    else if (type === 'highpass') [this.b0, this.b1, this.b2] = [(1 + cos) / 2 / a0, -(1 + cos) / a0, (1 + cos) / 2 / a0];
    else [this.b0, this.b1, this.b2] = [alpha / a0, 0, -alpha / a0];
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    [this.x2, this.x1, this.y2, this.y1] = [this.x1, x, this.y1, y];
    return y;
  }
}

// ---------- Effects ----------

const effects = new Stereo();
const shimmer = new Stereo(); // Effects that also ring in the reverb.
const pan = (event: Event) => (event.x === undefined ? 0 : Math.max(-0.6, Math.min(0.6, (event.x / 1600) * 2 - 1)));

function click(at: number, p: number, up = false, v = 1) {
  const start = Math.round(at * rate);
  const band = new Biquad('bandpass', up ? 3400 : 2500, 1.4);
  for (let i = 0; i < 0.03 * rate; i++) {
    const s = i / rate;
    const env = Math.min(1, s / 0.0008) * Math.exp(-s / (up ? 0.006 : 0.009));
    const knock = Math.sin(tau * (up ? 1500 : 1100) * s) * Math.exp(-s / 0.005);
    effects.add(start + i, (band.run(noise()) * 0.9 + knock * 0.35) * env * (up ? 0.2 : 0.32) * v, p * 0.5);
  }
}

function key(at: number, p: number, space = false, v = 1) {
  const start = Math.round(at * rate);
  const band = new Biquad('bandpass', 2600 + random() * 1600, 1.8);
  const thock = space ? 140 : 190 + random() * 60;
  const gain = (0.75 + random() * 0.5) * v;
  for (let i = 0; i < 0.04 * rate; i++) {
    const s = i / rate;
    const env = Math.min(1, s / 0.0006) * Math.exp(-s / 0.005);
    const body = Math.sin(tau * thock * s) * Math.exp(-s / (space ? 0.018 : 0.012));
    effects.add(start + i, (band.run(noise()) * env * 0.8 + body * 0.5) * 0.15 * gain, p * 0.4);
  }
}

// Air moving past: noise through a band that sweeps up and back down, drifting across the stereo field.
let whooshTake = 0;
function whoosh(at: number, dur: number, v = 1) {
  const take = whooshTake++ % 3;
  const n = Math.round(dur * 1.15 * rate);
  const start = Math.round((at - 0.06) * rate);
  const band = new Biquad('bandpass', 400, 0.9);
  const low = new Biquad('lowpass', 3500, 0.7);
  const peak = [1900, 1500, 2400][take];
  const direction = take === 1 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const p = i / n;
    if (i % 32 === 0) band.set('bandpass', 350 + peak * Math.sin(Math.PI * p ** 0.8) ** 2, 0.9);
    const env = Math.sin(Math.PI * p ** 0.85) ** 2.2;
    effects.add(start + i, low.run(band.run(noise())) * env * 0.26 * v, ((p - 0.5) * 0.8) * direction);
  }
}

// A light bubble pop: a quick downward blip.
function pop(at: number, p: number, v = 1) {
  const start = Math.round(at * rate);
  const high = 880 + random() * 280;
  let phase = 0;
  for (let i = 0; i < 0.12 * rate; i++) {
    const s = i / rate;
    phase += (tau * (520 + high * Math.exp(-s / 0.012))) / rate;
    const sample = Math.sin(phase) * Math.min(1, s / 0.002) * Math.exp(-s / 0.03) * 0.24 * v;
    effects.add(start + i, sample, p * 0.4);
    shimmer.add(start + i, sample * 0.4, p * 0.4);
  }
}

// A short warm chime: a D major arpeggio of soft bells.
function chime(at: number) {
  for (const [k, freq] of [587.33, 880, 1174.66].entries()) {
    const start = Math.round((at + k * 0.09) * rate);
    for (let i = 0; i < 3 * rate; i++) {
      const s = i / rate;
      let sample = 0;
      for (const [ratio, amp, decay] of [[1, 1, 2.4], [2, 0.32, 1.2], [3.01, 0.1, 0.5], [4.16, 0.05, 0.25]]) {
        sample += Math.sin(tau * freq * ratio * s) * amp * Math.exp(-s / decay);
      }
      sample *= Math.min(1, s / 0.003) * 0.12;
      effects.add(start + i, sample, (k - 1) * 0.3);
      shimmer.add(start + i, sample, (k - 1) * 0.3);
    }
  }
}

for (const event of Object.values(timing.events) as Event[]) {
  const p = pan(event);
  if (event.sound === 'click') {
    click(event.at, p);
    click(event.at + 0.09, p, true);
  } else if (event.sound === 'drag') {
    click(event.at - 0.05, p);
    click(event.at + event.dur!, p, true);
  } else if (event.sound === 'key') {
    key(event.at, p, false, 1.1);
  } else if (event.sound === 'type') {
    [...event.text!].forEach((ch, i) => key(event.at + (i + 1) / event.cps!, p, ch === ' '));
  } else if (event.sound === 'delete') {
    event.text!.split(/(?<= )/).forEach((_, i) => key(event.at + (i + 1) * event.gap!, p, false, 0.85));
  } else if (event.sound === 'whoosh') {
    whoosh(event.at, event.dur ?? 0.6, event.dur && event.dur > 0.8 ? 1 : 0.8);
  } else if (event.sound === 'fill') {
    // Each field the Agent fills pings with a soft pop.
    for (let i = 0; i < (event as Event & { count: number }).count; i++) pop(event.at + i * (event.gap ?? 0), 0.2, 0.9);
  } else if (event.sound === 'pop') {
    pop(event.at, p);
  } else if (event.sound === 'chime') {
    chime(event.at);
  }
}

// ---------- Music: D, A, Bm7, Gmaj7 at 120 BPM ----------
// The old way (before the drop) is a quiet pad and a few plucks; the groove starts when Dossier appears,
// stops as the page fades to black, and the last chord rings under the chime.

const music = new Stereo();
const chords = [
  { bass: 38, pad: [62, 66, 69, 76] },
  { bass: 45, pad: [61, 64, 69, 73] },
  { bass: 47, pad: [62, 66, 69, 71] },
  { bass: 43, pad: [62, 66, 67, 71] },
];
const drop = timing.drop;
const stop = timing.events.fadeOut.at;
const end = timing.duration;
const land = timing.events.endChime.at; // The dot lands on the i.
const chordAt = (t: number) => chords[Math.floor(Math.max(0, t) / bar) % chords.length];
const pump = new Float32Array(length); // How much the kick ducks the pad and bass.

function tone(at: number, dur: number, freq: number, gain: number, p: number, attack: number, release: number, bright = 0.2) {
  const start = Math.round(at * rate);
  for (let i = 0; i < (dur + release) * rate; i++) {
    const s = i / rate;
    const env = Math.min(1, s / attack) * (s < dur ? 1 : Math.exp(-(s - dur) / (release / 4)));
    const x = tau * freq * s;
    music.add(start + i, (Math.sin(x) + bright * Math.sin(2 * x) + bright * 0.3 * Math.sin(3 * x)) * env * gain * (1 - 0.55 * pump[start + i]), p);
  }
}

function pluck(at: number, freq: number, gain: number, p: number) {
  const start = Math.round(at * rate);
  for (let i = 0; i < 0.9 * rate; i++) {
    const s = i / rate;
    const env = Math.min(1, s / 0.003) * Math.exp(-s / 0.18);
    const x = tau * freq * s;
    music.add(start + i, (Math.sin(x) + 0.4 * Math.sin(2 * x) * Math.exp(-s / 0.05) + 0.15 * Math.sin(3 * x) * Math.exp(-s / 0.03)) * env * gain, p);
  }
}

function kick(at: number, gain = 0.55) {
  const start = Math.round(at * rate);
  let phase = 0;
  for (let i = 0; i < 0.4 * rate; i++) {
    const s = i / rate;
    phase += (tau * (46 + 110 * Math.exp(-s / 0.03))) / rate;
    const env = Math.exp(-s / 0.16);
    music.add(start + i, (Math.sin(phase) * env + noise() * Math.exp(-s / 0.002) * 0.3) * gain, 0);
    if (start + i < length) pump[start + i] = Math.max(pump[start + i], Math.exp(-s / 0.12));
  }
}

function clap(at: number, gain = 0.2) {
  const start = Math.round(at * rate);
  const band = new Biquad('bandpass', 1400, 0.9);
  for (let i = 0; i < 0.25 * rate; i++) {
    const s = i / rate;
    const burst = [0, 0.011, 0.022].reduce((sum, b) => sum + (s >= b ? Math.exp(-(s - b) / (b === 0.022 ? 0.07 : 0.006)) : 0), 0);
    music.add(start + i, band.run(noise()) * burst * gain, 0.1);
  }
}

function hat(at: number, gain: number, open = false) {
  const start = Math.round(at * rate);
  const high = new Biquad('highpass', 7000, 0.7);
  for (let i = 0; i < (open ? 0.2 : 0.06) * rate; i++) {
    const s = i / rate;
    music.add(start + i, high.run(noise()) * Math.exp(-s / (open ? 0.06 : 0.015)) * gain, 0.25);
  }
}

function sweep(from: number, to: number, gain: number, rising: boolean) {
  const start = Math.round(from * rate);
  const n = Math.round((to - from) * rate);
  const band = new Biquad('bandpass', 500, 1.2);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    if (i % 32 === 0) band.set('bandpass', rising ? 400 + 5000 * p ** 2 : 5400 - 5000 * p, 1.2);
    music.add(start + i, band.run(noise()) * (rising ? p ** 2 : (1 - p) ** 2) * gain, 0);
  }
}

// Drums first, so the pad and bass can duck under the kick.
for (let b = Math.round(drop / beat); b * beat < stop - 1e-6; b++) {
  const t = b * beat;
  kick(t);
  if (b % 2 === 1) clap(t);
  hat(t + beat / 2, 0.07, b % 4 === 3);
  hat(t, 0.035);
  hat(t + beat * 0.75, 0.025);
}
for (let b = Math.round(drop / beat) + 3; b * beat < stop - 1e-6; b += 8) kick(b * beat + beat * 0.75, 0.35);

for (let k = 0; k * bar < end; k++) {
  const t = k * bar;
  const chord = chordAt(t);
  const last = t >= stop - 1e-6;
  if (last) break;
  const groove = t >= drop - 1e-6;
  const padGain = groove ? 0.045 : 0.035;
  for (const [j, note] of chord.pad.entries()) {
    for (const detune of [-0.003, 0.003]) tone(t, bar, midi(note) * (1 + detune), padGain * (1 - j * 0.08), detune * 120, 0.15, 0.5, 0.25);
  }
  // Bass: eighth notes on the root, the octave on the off-beats.
  if (groove) {
    for (let e = 0; e < 8; e++) {
      const at = t + e * (beat / 2);
      if (at >= stop) break;
      tone(at, beat / 2 - 0.05, midi(chord.bass + (e % 2 === 1 ? 12 : 0)), 0.16, 0, 0.005, 0.05, 0.35);
    }
  }
  // Plucks: a sixteenth-note arpeggio, thinner before the drop.
  const upper = [...chord.pad.map((n) => n + 12), chord.pad[0] + 24];
  for (let s = 0; s < 16; s++) {
    const at = t + s * (beat / 4);
    if (at >= stop) break;
    if (!groove && s % 4 !== 0) continue;
    if (groove && s % 4 === 3 && random() < 0.6) continue;
    const note = upper[[0, 2, 1, 3, 4, 2, 3, 1][s % 8] % upper.length];
    pluck(at, midi(note), groove ? 0.05 : 0.035, s % 2 === 0 ? -0.35 : 0.35);
  }
}
sweep(drop - 1.5, drop, 0.25, true);
sweep(drop, drop + 1.5, 0.08, false);
sweep(stop - 0.05, land, 0.22, true);
// The last chord rings out under the chime.
for (const note of [38, 50, 57, 62, 66, 69, 76]) tone(land, 0.6, midi(note), note < 50 ? 0.12 : 0.045, (note % 5) / 5 - 0.4, 0.01, 3.2, 0.2);
for (const [k, note] of [74, 78, 81, 86].entries()) pluck(land + k * 0.05, midi(note), 0.05, k % 2 ? 0.3 : -0.3);

// ---------- Mix ----------

// A small Schroeder reverb: parallel combs, then allpasses, with the two channels slightly apart.
function reverb(input: Stereo, decay: number) {
  const out = new Stereo();
  for (let c = 0; c < 2; c++) {
    const spread = c * 23;
    const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ buf: new Float32Array(d + spread), i: 0, low: 0 }));
    const allpasses = [556, 441, 341].map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
    const feedback = 0.7 + decay * 0.28;
    for (let i = 0; i < length; i++) {
      const x = (input.ch[0][i] + input.ch[1][i]) * 0.5 * 0.12;
      let y = 0;
      for (const comb of combs) {
        const delayed = comb.buf[comb.i];
        comb.low = delayed * 0.75 + comb.low * 0.25;
        comb.buf[comb.i] = x + comb.low * feedback;
        comb.i = (comb.i + 1) % comb.buf.length;
        y += delayed;
      }
      for (const ap of allpasses) {
        const delayed = ap.buf[ap.i];
        ap.buf[ap.i] = y + delayed * 0.5;
        ap.i = (ap.i + 1) % ap.buf.length;
        y = delayed - y;
      }
      out.ch[c][i] = y;
    }
  }
  return out;
}

const roomMusic = reverb(music, 0.45);
const roomEffects = reverb(shimmer, 0.5);
const mix = new Stereo();
const fadeIn = 0.05 * rate;
for (let c = 0; c < 2; c++) {
  for (let i = 0; i < length; i++) {
    const fade = Math.min(1, i / fadeIn, (length - i) / (0.4 * rate));
    const bed = (music.ch[c][i] + roomMusic.ch[c][i] * 0.7) * 0.62;
    mix.ch[c][i] = (bed + effects.ch[c][i] + shimmer.ch[c][i] * 0.5 + roomEffects.ch[c][i]) * fade;
  }
}

const work = '/tmp/dossier-sounds';
mkdirSync(work, { recursive: true });
const raw = join(work, 'raw.wav');
writeWav(raw, mix);
// Bring it near -16 LUFS, limit the transients, then one exact loudnorm gain: -16 LUFS, true peaks under -1 dBTP.
const target = 'I=-16:TP=-1.5:LRA=11';
const loudness = async (file: string) =>
  JSON.parse((await capture(['-hide_banner', '-i', file, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'])).match(/\{[^{}]*"input_i"[^{}]*\}/)![0]);
const limited = join(work, 'limited.wav');
await capture(['-y', '-v', 'error', '-i', raw, '-af', `volume=${(-16 - Number((await loudness(raw)).input_i)).toFixed(2)}dB,alimiter=limit=0.72:attack=2:release=60:level=false`, limited]);
const m = await loudness(limited);
mkdirSync(join(video, 'assets', 'audio'), { recursive: true });
const out = join(video, 'assets', 'audio', 'soundtrack.wav');
await capture(['-y', '-v', 'error', '-i', limited, '-af',
  `loudnorm=${target}:linear=true:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset},aresample=48000`,
  '-c:a', 'pcm_s16le', out]);
rmSync(work, { recursive: true, force: true });
console.log(`Wrote ${out}`);

function capture(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => (code === 0 ? resolve(output) : reject(new Error(`ffmpeg exited ${code}: ${output.slice(-500)}`))));
  });
}

function writeWav(path: string, audio: Stereo) {
  const data = Buffer.alloc(length * 4);
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < 2; c++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio.ch[c][i])) * 32767), i * 4 + c * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}
