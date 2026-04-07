// ═══════════════════════════════════════════════════════════════
//  audio-player.js — Self-contained audio engine
//  τ-Euler Atlas · Leonhard Euler's Day Off
//
//  Auto-discovers tracks from the /audio/ directory listing
//  served by `npx serve`. Drop an MP3 in the folder, refresh.
// ═══════════════════════════════════════════════════════════════

const AUDIO_DIR = 'audio/';
const AUDIO_EXTS = ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.webm'];
const LS_VOLUME_KEY = 'tau-atlas-audio-volume';

// ── State ────────────────────────────────────────────────────

const state = {
  tracks: [],          // [{ file, title, duration }]
  currentIndex: -1,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: _loadVolume(),
  loading: true,
  error: null,
};

const _listeners = new Set();
let _audio = null;
let _timeUpdateRaf = null;

// ── Public API ───────────────────────────────────────────────

export function getState() {
  return state;
}

export function onChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export async function init() {
  _audio = new Audio();
  _audio.volume = state.volume;
  _audio.preload = 'metadata';

  _audio.addEventListener('ended', () => _handleTrackEnd());
  _audio.addEventListener('loadedmetadata', () => {
    state.duration = _audio.duration || 0;
    _notify();
  });
  _audio.addEventListener('error', () => {
    state.error = `Failed to load: ${state.tracks[state.currentIndex]?.title || 'unknown'}`;
    state.playing = false;
    _notify();
  });

  try {
    const tracks = await _discoverTracks();
    state.tracks = tracks;
    state.currentIndex = tracks.length > 0 ? 0 : -1;
    state.loading = false;
    if (tracks.length > 0) {
      _loadTrack(0, false);
    }
  } catch (e) {
    state.loading = false;
    state.error = 'Could not discover audio tracks';
    console.warn('[audio-player]', e);
  }
  _notify();
}

export function play() {
  if (!_audio || state.tracks.length === 0) return;
  if (state.currentIndex < 0) state.currentIndex = 0;
  _audio.play().then(() => {
    state.playing = true;
    _startTimeLoop();
    _notify();
  }).catch(() => {});
}

export function pause() {
  if (!_audio) return;
  _audio.pause();
  state.playing = false;
  _stopTimeLoop();
  _notify();
}

export function toggle() {
  state.playing ? pause() : play();
}

export function next() {
  if (state.tracks.length === 0) return;
  const idx = (state.currentIndex + 1) % state.tracks.length;
  seekTo(idx);
}

export function prev() {
  if (state.tracks.length === 0) return;
  // If more than 3s in, restart current track; otherwise go to previous
  if (_audio && _audio.currentTime > 3) {
    _audio.currentTime = 0;
    state.currentTime = 0;
    _notify();
    return;
  }
  const idx = (state.currentIndex - 1 + state.tracks.length) % state.tracks.length;
  seekTo(idx);
}

export function seekTo(index) {
  if (index < 0 || index >= state.tracks.length) return;
  const wasPlaying = state.playing;
  _loadTrack(index, wasPlaying);
}

export function seekTime(t) {
  if (!_audio) return;
  _audio.currentTime = Math.max(0, Math.min(t, _audio.duration || 0));
  state.currentTime = _audio.currentTime;
  _notify();
}

export function setVolume(v) {
  state.volume = Math.max(0, Math.min(1, v));
  if (_audio) _audio.volume = state.volume;
  _saveVolume(state.volume);
  _notify();
}

// ── Track Discovery ──────────────────────────────────────────

async function _discoverTracks() {
  const FALLBACK_TRACKS = [
    'Beyond_the_Euclidean_Roof.mp3',
    'Bounded_From_Itself.mp3',
    'Hanging_Up_The_Variables.mp3',
    'The_Answer_Is_Forty_Two.mp3',
    'The_Art_of_the_Bet.mp3',
    'The_Bin_Of_Inconceivable_Things.mp3',
    'The_Formal_Door.mp3',
    'The_Geometry_of_Home.mp3',
    'The_Unfinished_Proof.mp3'
  ];

  let files = [];
  try {
    const resp = await fetch(AUDIO_DIR);
    if (!resp.ok) throw new Error(`Directory listing failed: ${resp.status}`);

    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = Array.from(doc.querySelectorAll('a[href]'));

    for (const a of links) {
      const href = decodeURIComponent(a.getAttribute('href') || '');
      const name = href.split(/[/\\]/).pop();
      if (!name) continue;
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
      if (AUDIO_EXTS.includes(ext)) {
        files.push(name);
      }
    }
  } catch (err) {
    console.warn('[audio-player] Auto-discovery failed, using static fallback list.', err);
    files = FALLBACK_TRACKS;
  }

  // Sort alphabetically, deduplicate
  const unique = [...new Set(files)].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  return unique.map(file => ({
    file,
    title: _titleFromFilename(file),
    duration: 0,
  }));
}

function _titleFromFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');        // strip extension
  return base.replace(/_/g, ' ').replace(/\s+/g, ' ');  // underscores → spaces
}

// ── Internal Playback ────────────────────────────────────────

function _loadTrack(index, autoPlay = false) {
  if (!_audio || index < 0 || index >= state.tracks.length) return;

  state.currentIndex = index;
  state.currentTime = 0;
  state.duration = 0;
  state.error = null;

  _audio.src = AUDIO_DIR + encodeURIComponent(state.tracks[index].file);
  _audio.load();

  if (autoPlay) {
    _audio.play().then(() => {
      state.playing = true;
      _startTimeLoop();
      _notify();
    }).catch(() => {});
  } else {
    state.playing = false;
    _stopTimeLoop();
  }
  _notify();
}

function _handleTrackEnd() {
  // Auto-advance to next track, stop at end of playlist
  if (state.currentIndex < state.tracks.length - 1) {
    next();
  } else {
    state.playing = false;
    state.currentTime = 0;
    _stopTimeLoop();
    _notify();
  }
}

// ── Time Update Loop ─────────────────────────────────────────

function _startTimeLoop() {
  _stopTimeLoop();
  const tick = () => {
    if (_audio && state.playing) {
      state.currentTime = _audio.currentTime || 0;
      state.duration = _audio.duration || 0;

      // Update cached track duration
      const t = state.tracks[state.currentIndex];
      if (t && state.duration > 0 && t.duration === 0) {
        t.duration = state.duration;
      }
      _notify();
      _timeUpdateRaf = requestAnimationFrame(tick);
    }
  };
  _timeUpdateRaf = requestAnimationFrame(tick);
}

function _stopTimeLoop() {
  if (_timeUpdateRaf) {
    cancelAnimationFrame(_timeUpdateRaf);
    _timeUpdateRaf = null;
  }
}

// ── Persistence ──────────────────────────────────────────────

function _loadVolume() {
  try {
    const v = parseFloat(localStorage.getItem(LS_VOLUME_KEY));
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
  } catch { return 0.5; }
}

function _saveVolume(v) {
  try { localStorage.setItem(LS_VOLUME_KEY, String(v)); } catch {}
}

// ── Notify ───────────────────────────────────────────────────

function _notify() {
  for (const fn of _listeners) {
    try { fn(state); } catch {}
  }
}
