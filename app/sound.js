// Optional sound, off until the visitor turns it on. Voices are synthesized with Web Audio; ambience is a CC0 recording loaded only once sound is on.
const KEY = "hpc.sound";
const AMBIENCE = "/app/sound/market.mp3";
let context = null;
let master = null;
let noise = null;
let ink = null;
let ambience = null;

export function soundOn() {
  try {
    return localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

function start() {
  if (context) return context.resume();
  context = new AudioContext();
  master = context.createGain();
  master.gain.value = 0;
  master.connect(context.destination);
  noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let index = 0; data.length > index; index++) data[index] = Math.random() * 2 - 1;
  return context.resume();
}

export function setSound(on) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (on) start();
  if (master) master.gain.setTargetAtTime(on ? 0.6 : 0, context.currentTime, 0.08);
  if (on && !ambience) loadAmbience();
}

const live = () => context && master && soundOn();

function envelope(gain, at, peak, attack, release) {
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
}

function tone(frequency, { type = "sine", peak = 0.3, attack = 0.005, release = 0.12, glide = 0 } = {}) {
  const at = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  if (glide) oscillator.frequency.exponentialRampToValueAtTime(frequency * glide, at + attack + release);
  envelope(gain, at, peak, attack, release);
  oscillator.connect(gain).connect(master);
  oscillator.start(at);
  oscillator.stop(at + attack + release + 0.05);
}

function hiss({ frequency = 1200, q = 0.8, peak = 0.3, attack = 0.01, release = 0.2 } = {}) {
  const at = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noise;
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  envelope(gain, at, peak, attack, release);
  source.connect(filter).connect(gain).connect(master);
  source.start(at);
  source.stop(at + attack + release + 0.05);
}

const VOICES = {
  click: () => tone(1800, { type: "triangle", peak: 0.12, release: 0.03 }),
  tick: () => tone(2600, { peak: 0.06, release: 0.02 }),
  pop: () => tone(520, { peak: 0.25, release: 0.09, glide: 1.8 }),
  beep: () => tone(1320, { type: "square", peak: 0.08, attack: 0.002, release: 0.16 }),
  stamp: () => {
    tone(90, { peak: 0.5, release: 0.18, glide: 0.6 });
    hiss({ frequency: 400, peak: 0.2, release: 0.08 });
  },
  door: () => {
    hiss({ frequency: 260, q: 2, peak: 0.35, attack: 0.04, release: 0.5 });
    tone(70, { peak: 0.3, attack: 0.02, release: 0.25 });
  },
};

export function play(name) {
  if (live()) VOICES[name]?.();
}

export function inkSweep(level) {
  if (!live()) return;
  if (!ink) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    ink = context.createGain();
    source.buffer = noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    ink.gain.value = 0;
    source.connect(filter).connect(ink).connect(master);
    source.start();
  }
  ink.gain.setTargetAtTime(Math.min(0.25, level), context.currentTime, 0.05);
}

function loadAmbience() {
  ambience = context.createGain();
  ambience.gain.value = 0;
  ambience.connect(master);
  fetch(AMBIENCE)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
    .then((bytes) => context.decodeAudioData(bytes))
    .then((buffer) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(ambience);
      source.start();
    })
    .catch(() => null);
}

export function ambienceLevel(level) {
  if (live() && ambience) ambience.gain.setTargetAtTime(level * 0.5, context.currentTime, 0.4);
}

export function quiet() {
  if (ink) ink.gain.setTargetAtTime(0, context.currentTime, 0.05);
  if (ambience) ambience.gain.setTargetAtTime(0, context.currentTime, 0.2);
}
