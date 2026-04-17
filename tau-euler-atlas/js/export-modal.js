// ═══════════════════════════════════════════════════════════════
//  export-modal.js — Video export settings modal & progress UI
//  τ-Euler Atlas · Scene Director
// ═══════════════════════════════════════════════════════════════

import { totalDuration } from './scene-data.js';
import { getSceneManager } from './controls.js';
import {
  createVideoExporter,
  isExportSupported,
  estimateFileSize,
  computeTotalFrames,
} from './video-export.js';

// ── Resolution presets ───────────────────────────────────────

const RESOLUTION_PRESETS = [
  { label: '720p',  width: 1280, height: 720  },
  { label: '1080p', width: 1920, height: 1080 },
  { label: '1440p', width: 2560, height: 1440 },
  { label: '4K',    width: 3840, height: 2160 },
];

const FPS_OPTIONS = [24, 30, 60, 120];
const QUALITY_OPTIONS = ['low', 'medium', 'high'];

// ── State ────────────────────────────────────────────────────

let _overlayEl = null;
let _exporter = null;
let _settings = {
  fps: 30,
  resolutionIndex: 1,  // 1080p
  quality: 'medium',
  includeAudio: true,
};

// ── Public API ───────────────────────────────────────────────

export function openExportModal() {
  _overlayEl = document.getElementById('export-overlay');
  if (!_overlayEl) return;

  if (!isExportSupported()) {
    _showUnsupportedMessage();
    return;
  }

  _showSettingsModal();
}

export function closeExportModal() {
  if (_exporter && _exporter.isRunning()) {
    _exporter.cancel();
  }
  _hideOverlay();
}

// ── Settings Modal ───────────────────────────────────────────

function _showSettingsModal() {
  const sm = getSceneManager();
  const timeline = sm?.getTimeline();
  const baseDuration = timeline ? totalDuration(timeline) : 0;
  const loops = (timeline && timeline.loopCount > 0) ? timeline.loopCount : 1;
  const duration = baseDuration * loops;

  _overlayEl.innerHTML = '';
  _overlayEl.setAttribute('aria-hidden', 'false');
  _overlayEl.classList.add('active');

  // Backdrop (click to close)
  const backdrop = document.createElement('div');
  backdrop.className = 'export-backdrop';
  backdrop.addEventListener('click', () => closeExportModal());
  _overlayEl.appendChild(backdrop);

  const modal = document.createElement('div');
  modal.className = 'export-modal glass';

  // Header
  const header = document.createElement('div');
  header.className = 'export-modal-header';
  header.innerHTML = `
    <span class="export-modal-title">Export Video</span>
    <button class="export-modal-close ctrl-interactive" title="Close">&times;</button>
  `;
  header.querySelector('.export-modal-close').addEventListener('click', () => closeExportModal());
  modal.appendChild(header);

  // FPS row
  modal.appendChild(_buildOptionRow('FPS', FPS_OPTIONS, _settings.fps, (val) => {
    _settings.fps = val;
    _updateSummary(duration);
  }, (v) => `${v}`));

  // Resolution row
  modal.appendChild(_buildOptionRow(
    'Resolution',
    RESOLUTION_PRESETS.map((r, i) => i),
    _settings.resolutionIndex,
    (val) => {
      _settings.resolutionIndex = val;
      _updateSummary(duration);
    },
    (i) => RESOLUTION_PRESETS[i].label,
  ));

  // Quality row
  modal.appendChild(_buildOptionRow('Quality', QUALITY_OPTIONS, _settings.quality, (val) => {
    _settings.quality = val;
    _updateSummary(duration);
  }, (v) => v.charAt(0).toUpperCase() + v.slice(1)));

  // Audio row
  modal.appendChild(_buildOptionRow('Audio', [true, false], _settings.includeAudio, (val) => {
    _settings.includeAudio = val;
  }, (v) => v ? 'Include' : 'Mute'));

  // Separator
  const sep = document.createElement('div');
  sep.className = 'export-separator';
  modal.appendChild(sep);

  // Summary
  const summary = document.createElement('div');
  summary.className = 'export-summary';
  summary.id = 'export-summary';
  modal.appendChild(summary);
  _updateSummaryEl(summary, duration);

  // Action buttons
  const actions = document.createElement('div');
  actions.className = 'export-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'export-btn export-btn-cancel ctrl-interactive';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => closeExportModal());

  const startBtn = document.createElement('button');
  startBtn.className = 'export-btn export-btn-start ctrl-interactive';
  startBtn.textContent = 'Start Export';
  startBtn.addEventListener('click', () => _startExport(duration));

  actions.appendChild(cancelBtn);
  actions.appendChild(startBtn);
  modal.appendChild(actions);

  _overlayEl.appendChild(modal);

  // Trap Escape key
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeExportModal();
      document.removeEventListener('keydown', escHandler, true);
    }
  };
  document.addEventListener('keydown', escHandler, true);
  modal._escHandler = escHandler;
}

function _buildOptionRow(label, options, current, onChange, formatLabel) {
  const row = document.createElement('div');
  row.className = 'export-option-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'export-option-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const group = document.createElement('div');
  group.className = 'export-option-group';

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = `mode-pill ctrl-interactive ${opt === current ? 'active' : ''}`;
    btn.textContent = formatLabel(opt);
    btn.addEventListener('click', () => {
      group.querySelectorAll('.mode-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(opt);
    });
    group.appendChild(btn);
  });

  row.appendChild(group);
  return row;
}

function _updateSummary(duration) {
  const el = document.getElementById('export-summary');
  if (el) _updateSummaryEl(el, duration);
}

function _updateSummaryEl(el, duration) {
  const res = RESOLUTION_PRESETS[_settings.resolutionIndex];
  const totalFrames = computeTotalFrames(_settings.fps, duration);
  const estimatedBytes = estimateFileSize(_settings.fps, duration, _settings.quality);
  const sizeMB = (estimatedBytes / (1024 * 1024)).toFixed(0);

  el.innerHTML = `
    <span>Duration: ${duration.toFixed(1)}s</span>
    <span class="export-summary-dot">•</span>
    <span>${totalFrames.toLocaleString()} frames</span>
    <span class="export-summary-dot">•</span>
    <span>${res.width}×${res.height}</span>
    <span class="export-summary-dot">•</span>
    <span>~${sizeMB} MB</span>
    <span class="export-summary-dot">•</span>
    <span>.mp4 / .webm</span>
  `;
}

// ── Start Export ─────────────────────────────────────────────

async function _startExport(duration) {
  const res = RESOLUTION_PRESETS[_settings.resolutionIndex];
  const totalFrames = computeTotalFrames(_settings.fps, duration);

  // Prompt user to choose save location (if browser supports it)
  let fileHandle = null;
  if (window.showSaveFilePicker) {
    try {
      fileHandle = await window.showSaveFilePicker({
        suggestedName: `tau-euler-atlas-${Date.now()}.mp4`,
        types: [
          { description: 'MP4 Video', accept: { 'video/mp4': ['.mp4'] } },
          { description: 'WebM Video', accept: { 'video/webm': ['.webm'] } },
        ],
      });
    } catch (e) {
      if (e.name === 'AbortError') return; // User cancelled
      console.warn('File picker unavailable, will use browser download:', e);
    }
  }

  // Switch to progress UI
  _showProgressOverlay(totalFrames);

  // Create and configure exporter
  _exporter = createVideoExporter();

  _exporter.onProgress(({ frame, totalFrames: total, percent }) => {
    _updateProgressUI(frame, total, percent);
  });

  _exporter.onComplete((blob, filename, sizeBytes) => {
    _showCompleteUI(filename, sizeBytes);
  });

  _exporter.onError((err) => {
    _showErrorUI(err.message);
  });

  _exporter.start({
    fps: _settings.fps,
    width: res.width,
    height: res.height,
    quality: _settings.quality,
    includeAudio: _settings.includeAudio,
    fileHandle,
  });
}

// ── Progress Overlay ─────────────────────────────────────────

function _showProgressOverlay(totalFrames) {
  if (!_overlayEl) return;

  _overlayEl.innerHTML = `
    <div class="export-progress-card glass">
      <div class="export-progress-title">Exporting Video</div>
      <div class="export-progress-frames" id="export-frame-counter">
        Frame 0 / ${totalFrames.toLocaleString()}
      </div>
      <div class="export-progress-bar-wrap">
        <div class="export-progress-bar-fill" id="export-progress-fill" style="width: 0%"></div>
      </div>
      <div class="export-progress-percent" id="export-progress-pct">0%</div>
      <button class="export-btn export-btn-cancel ctrl-interactive" id="export-cancel-btn">Cancel</button>
    </div>
  `;

  document.getElementById('export-cancel-btn').addEventListener('click', () => {
    if (_exporter) _exporter.cancel();
    _hideOverlay();
  });
}

function _updateProgressUI(frame, totalFrames, percent) {
  const counter = document.getElementById('export-frame-counter');
  const fill = document.getElementById('export-progress-fill');
  const pct = document.getElementById('export-progress-pct');

  if (counter) counter.textContent = `Frame ${frame.toLocaleString()} / ${totalFrames.toLocaleString()}`;
  if (fill) fill.style.width = `${percent}%`;
  if (pct) pct.textContent = `${percent}%`;
}

function _showCompleteUI(filename, sizeBytes) {
  if (!_overlayEl) return;
  const sizeMB = sizeBytes ? (sizeBytes / (1024 * 1024)).toFixed(1) : null;

  _overlayEl.innerHTML = `
    <div class="export-progress-card glass">
      <div class="export-progress-title export-complete-title">Export Complete ✓</div>
      <div class="export-progress-frames">${filename}</div>
      ${sizeMB ? `<div class="export-progress-percent">${sizeMB} MB</div>` : ''}
      <button class="export-btn export-btn-start ctrl-interactive" id="export-done-btn">Done</button>
    </div>
  `;

  document.getElementById('export-done-btn').addEventListener('click', () => _hideOverlay());

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    if (_overlayEl && _overlayEl.classList.contains('active')) {
      _hideOverlay();
    }
  }, 4000);
}

function _showErrorUI(message) {
  if (!_overlayEl) return;

  _overlayEl.innerHTML = `
    <div class="export-progress-card glass">
      <div class="export-progress-title export-error-title">Export Failed</div>
      <div class="export-progress-frames">${message}</div>
      <button class="export-btn export-btn-cancel ctrl-interactive" id="export-error-btn">Close</button>
    </div>
  `;

  document.getElementById('export-error-btn').addEventListener('click', () => _hideOverlay());
}

function _showUnsupportedMessage() {
  _overlayEl.innerHTML = '';
  _overlayEl.classList.add('active');
  _overlayEl.setAttribute('aria-hidden', 'false');

  _overlayEl.innerHTML = `
    <div class="export-backdrop"></div>
    <div class="export-progress-card glass">
      <div class="export-progress-title export-error-title">Not Supported</div>
      <div class="export-progress-frames">
        Frame-accurate video export requires the WebCodecs API.<br>
        Please use <strong>Chrome 94+</strong> or <strong>Edge 94+</strong>.
      </div>
      <button class="export-btn export-btn-cancel ctrl-interactive" id="export-unsupported-btn">Close</button>
    </div>
  `;

  _overlayEl.querySelector('.export-backdrop').addEventListener('click', () => _hideOverlay());
  document.getElementById('export-unsupported-btn').addEventListener('click', () => _hideOverlay());
}

function _hideOverlay() {
  if (!_overlayEl) return;
  _overlayEl.classList.remove('active');
  _overlayEl.setAttribute('aria-hidden', 'true');
  _overlayEl.innerHTML = '';
  _exporter = null;
}
