// ═══════════════════════════════════════════════════════════════
//  timeline-panel.js — UI drawer for scene timeline authoring
//  τ-Euler Atlas · Scene Timeline
// ═══════════════════════════════════════════════════════════════

import { getSceneManager, autoSaveTimeline } from './controls.js';
import { EASING_GROUPS } from './easing.js';
import * as audioPlayer from './audio-player.js';
import {
  addScene,
  deleteScene,
  reorderScene,
  totalDuration,
  sceneStartTimes,
  removeTrackFromAllScenes,
  createTimeline,
  serializeTimeline,
  deserializeTimeline,
  getInheritedBases,
  readPath,
} from './scene-data.js';
import { isBooleanLinkPath } from './linked-params.js';

/**
 * When a scene's endValue changes, walk forward and update
 * all downstream scenes' baseValues for the same path.
 * Maintains the strict chaining invariant:
 *   Scene N baseValue === Scene N-1 endValue
 */
function recomputeChain(timeline, fromSceneIndex, path) {
  for (let i = fromSceneIndex + 1; i < timeline.scenes.length; i++) {
    const prevLink = timeline.scenes[i - 1].links.find(l => l.path === path);
    const link = timeline.scenes[i].links.find(l => l.path === path);
    if (link && prevLink) {
      link.baseValue = prevLink.endValue;
    }
  }
}

/**
 * Renumber scenes whose name matches "Scene N" pattern.
 * Custom names are preserved.
 */
function renumberScenes(timeline) {
  const autoPattern = /^Scene \d+$/;
  timeline.scenes.forEach((scene, i) => {
    if (autoPattern.test(scene.name)) {
      scene.name = `Scene ${i + 1}`;
    }
  });
}

let _panelEl = null;

const LOOP_MODES = ['none', 'wrap', 'bounce'];

function _playModeLabel(mode) {
  switch (mode) {
    case 'wrap':   return '🔁 Loop: Start';
    case 'bounce': return '🔂 Loop: Reverse';
    default:       return '▶ Play Once';
  }
}

export function initTimelinePanel() {
  _panelEl = document.getElementById('timeline-panel');
  if (!_panelEl) return;

  const sm = getSceneManager();
  if (!sm) return;

  // We need to re-render when the timeline mutates or playback state changes
  // For MVP, we will expose a global function to trigger timeline render
  window.renderTimelinePanel = renderTimelinePanel;

  // Listen to audio player state changes (e.g. tracks finished loading)
  let lastAudioState = null;
  audioPlayer.onChange((state) => {
    // Only re-render if structural state changes (e.g. tracks loaded).
    // DO NOT re-render on every playback time-tick, as it causes massive DOM thrashing
    // and destroys the playhead scrubber 60x a second.
    if (!lastAudioState || 
        lastAudioState.allTracksLength !== state.allTracks.length ||
        lastAudioState.error !== state.error) {
      renderTimelinePanel();
    }
    lastAudioState = { 
      allTracksLength: state.allTracks.length,
      error: state.error 
    };
  });

  // Initial render
  renderTimelinePanel();

  // Watch for playback state changes (basic polling for playhead sync if playing)
  let lastPlayingState = sm.isPlaying();
  const tick = () => {
    const isPlaying = sm.isPlaying();
    if (isPlaying) {
      updatePlayheadUI(sm);
      updateLiveValues(sm);
    } else if (lastPlayingState && !isPlaying) {
      // Stopped playing, re-render to remove playhead + live values
      renderTimelinePanel();
    }
    lastPlayingState = isPlaying;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function renderTimelinePanel() {
  if (!_panelEl) return;
  const sm = getSceneManager();
  if (!sm) return;

  const timeline = sm.getTimeline();
  if (!timeline) {
    _panelEl.innerHTML = '<div style="padding: 20px;">No timeline active.</div>';
    return;
  }

  // Preserve collapse state across renders if it exists
  const isCollapsed = _panelEl.querySelector('#tl-body')?.classList.contains('collapsed');

  // Ensure timeline panel has base class
  if (!_panelEl.classList.contains('timeline-panel')) {
    _panelEl.classList.add('timeline-panel');
  }

  // Visibility is handled purely via [data-visible] CSS rule.
  // Do NOT set inline styles here — they conflict with show/hide toggling.

  // Build skeleton
  _panelEl.innerHTML = `
    <div id="tl-body" style="display: flex; flex-direction: row; padding: 0; width: 100%; flex: 1; min-height: 0;">
      <div class="timeline-lhs">
        <div class="timeline-header">
          <span>Scene Director</span>
        </div>
        <div class="timeline-tools">
          <button id="tl-add-scene" class="timeline-btn">+ Add Scene</button>
          <button id="tl-capture" class="timeline-btn" title="Save current link engine state to this scene">Capture UI State</button>
        </div>
        <div class="timeline-tools" style="margin-top: 4px;">
          <button id="tl-export" class="timeline-btn">Export JSON</button>
          <button id="tl-import" class="timeline-btn">Import JSON</button>
          <input type="file" id="tl-import-file" accept=".json" style="display:none;" />
        </div>
        <div class="timeline-tools" style="margin-top: 4px;">
          <button id="tl-play-mode" class="timeline-btn tl-play-mode-btn ${timeline.loop !== 'none' ? 'loop-active' : ''}">${_playModeLabel(timeline.loop)}</button>
          ${timeline.loop !== 'none' ? `
            <label class="tl-loop-count-label">
              <span>Loops</span>
              <input id="tl-loop-count" type="number" class="scene-input tl-loop-count-input" min="0" step="1" value="${timeline.loopCount || 0}" title="0 = infinite" />
            </label>
          ` : ''}
        </div>
        <div class="timeline-stats" style="margin-top: auto; font-size: 11px; color: var(--text-dim);">
          Total Duration: ${totalDuration(timeline).toFixed(1)}s<br/>
          Scenes: ${timeline.scenes.length}
        </div>
      </div>
      <div class="timeline-mid" id="tl-audio-column">
        <!-- populated by renderAudioSequence -->
      </div>
      <div class="timeline-rhs">
        <div id="tl-scene-strip" class="scene-strip-container"></div>
        <div id="tl-scene-editor" class="scene-editor"></div>
      </div>
    </div>
  `;

  // Attach basic LHS events
  document.getElementById('tl-add-scene').addEventListener('click', () => {
    addScene(timeline);
    renumberScenes(timeline);
    sm.loadSceneForAuthoring(timeline.scenes.length - 1);
    autoSaveTimeline();
    renderTimelinePanel();
  });

  document.getElementById('tl-capture').addEventListener('click', () => {
    // Capture current live values as end values for active scene tracks
    const scene = timeline.scenes[timeline.activeSceneIndex];
    if (!scene) return;
    const liveState = sm.getState();
    for (const link of scene.links) {
      const live = readPath(liveState, link.path);
      if (Number.isFinite(live)) {
        link.endValue = live;
      }
    }
    // Recompute downstream chains for all affected paths
    for (const link of scene.links) {
      recomputeChain(timeline, timeline.activeSceneIndex, link.path);
    }
    autoSaveTimeline();
    renderTimelinePanel();
  });

  document.getElementById('tl-export').addEventListener('click', () => {
    const data = serializeTimeline(timeline, sm.getInitialSnapshot());
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tau-euler-timeline-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('tl-import').addEventListener('click', () => {
    document.getElementById('tl-import-file').click();
  });

  document.getElementById('tl-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const { timeline: newTl } = deserializeTimeline(data);
        sm.setTimeline(newTl);
        autoSaveTimeline();
        renderTimelinePanel();
      } catch (err) {
        console.error('Failed to import timeline:', err);
        alert('Invalid timeline JSON file.');
      }
    };
    reader.readAsText(file);
  });

  // Play mode toggle (cycles: none → wrap → bounce → none)
  document.getElementById('tl-play-mode').addEventListener('click', () => {
    const curIdx = LOOP_MODES.indexOf(timeline.loop);
    timeline.loop = LOOP_MODES[(curIdx + 1) % LOOP_MODES.length];
    autoSaveTimeline();
    renderTimelinePanel();
  });

  // Loop count input (only exists when loop !== 'none')
  const loopCountInput = document.getElementById('tl-loop-count');
  if (loopCountInput) {
    loopCountInput.addEventListener('change', () => {
      const val = parseInt(loopCountInput.value, 10);
      timeline.loopCount = Number.isFinite(val) && val >= 0 ? val : 0;
      autoSaveTimeline();
    });
  }

  // Render RHS only if not fully collapsed, or just render it anyway so it's ready.
  renderSceneStrip(sm, timeline);
  renderSceneEditor(sm, timeline);
  renderAudioSequence(timeline);
}

function renderSceneStrip(sm, timeline) {
  const container = document.getElementById('tl-scene-strip');
  if (!container) return;

  container.innerHTML = '';
  const BLOCK_W = 120; // Fixed width per scene block (px)
  
  timeline.scenes.forEach((scene, i) => {
    const isAct = timeline.activeSceneIndex === i;

    const el = document.createElement('div');
    el.className = `scene-block ${isAct ? 'active' : ''}`;
    el.style.width = `${BLOCK_W}px`;
    
    el.innerHTML = `
      <div class="scene-block-title">${scene.name}</div>
      <div class="scene-block-dur">${scene.duration.toFixed(1)}s</div>
      ${timeline.scenes.length > 1 ? '<button class="scene-block-delete" title="Delete scene">&times;</button>' : ''}
    `;

    // Delete button on scene block
    const delBtnBlock = el.querySelector('.scene-block-delete');
    if (delBtnBlock) {
      delBtnBlock.addEventListener('click', (e) => {
        e.stopPropagation();
        if (timeline.scenes.length <= 1) return;
        deleteScene(timeline, scene.id);
        renumberScenes(timeline);
        sm.loadSceneForAuthoring(timeline.activeSceneIndex);
        autoSaveTimeline();
        renderTimelinePanel();
      });
    }

    el.addEventListener('click', () => {
      sm.loadSceneForAuthoring(i);
      renderTimelinePanel();
    });

    // Drag-and-drop reordering
    el.draggable = true;
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', i);
      el.style.opacity = '0.5';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      el.style.borderLeft = '2px solid var(--accent-magenta)';
    });
    el.addEventListener('dragleave', () => {
      el.style.borderLeft = '';
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.style.borderLeft = '';
      
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toIndex = i;
      
      if (!isNaN(fromIndex) && fromIndex !== toIndex) {
        reorderScene(timeline, fromIndex, toIndex);
        autoSaveTimeline();
        sm.loadSceneForAuthoring(timeline.activeSceneIndex);
        renderTimelinePanel();
      }
    });

    container.appendChild(el);
  });
}

function renderSceneEditor(sm, timeline) {
  const container = document.getElementById('tl-scene-editor');
  if (!container) return;

  const idx = timeline.activeSceneIndex;
  const scene = timeline.scenes[idx];
  if (!scene) {
    container.innerHTML = '<div>Select a scene.</div>';
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'scene-editor-wrapper';

  // Build column for scene settings
  const header = document.createElement('div');
  header.className = 'scene-editor-column';
  
  const nameInput = document.createElement('input');
  nameInput.className = 'scene-input';
  nameInput.style.width = '120px';
  nameInput.value = scene.name;
  nameInput.addEventListener('change', () => {
    scene.name = nameInput.value;
    autoSaveTimeline();
    renderTimelinePanel();
  });

  const durInput = document.createElement('input');
  durInput.className = 'scene-input';
  durInput.type = 'number';
  durInput.min = '0.1';
  durInput.step = '0.5';
  durInput.style.width = '60px';
  durInput.value = scene.duration;
  durInput.addEventListener('change', () => {
    scene.duration = Math.max(0.1, parseFloat(durInput.value) || 10);
    autoSaveTimeline();
    renderTimelinePanel();
    sm.updateTimelineDuration();
  });

  // Easing select
  const easeSelect = document.createElement('select');
  easeSelect.className = 'scene-input';
  EASING_GROUPS.forEach(group => {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    group.keys.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = k;
      if (k === scene.easing) opt.selected = true;
      optgroup.appendChild(opt);
    });
    easeSelect.appendChild(optgroup);
  });
  easeSelect.addEventListener('change', () => {
    scene.easing = easeSelect.value;
    autoSaveTimeline();
  });

  header.innerHTML = `
    <div class="scene-editor-title">Scene Settings</div>
    <div class="scene-field"><label>Name</label></div>
    <div class="scene-field"><label>Duration (s)</label></div>
    <div class="scene-field"><label>Easing</label></div>
  `;
  header.children[1].appendChild(nameInput);
  header.children[2].appendChild(durInput);
  header.children[3].appendChild(easeSelect);

  // ── Grouped track columns ─────────────────────────────
  // Classify each link path into a parameter group (matches accordion sections)
  const TRACK_GROUPS = [
    { id: 'traversal', label: 'Traversal',  test: (p) => /^(T|T_|b$)/.test(p) },
    { id: 'scaling',   label: 'Scaling',    test: (p) => /^(k[0-9]|l_|q_)/.test(p) },
    { id: 'camera',    label: 'Camera',     test: (p) => /^camera\./.test(p) || /^(position|target|orbit|lens|distance)/.test(p) },
    { id: 'cinematic', label: 'Cinematic',  test: (p) => /^cinematic\./.test(p) },
  ];

  // Compute inherited bases for the active scene
  const liveState = sm.getState();
  const inheritedBases = getInheritedBases(timeline, idx, liveState);
  const isSceneZero = idx === 0;

  const grouped = {};
  for (const g of TRACK_GROUPS) grouped[g.id] = [];
  grouped['other'] = [];

  scene.links.forEach(link => {
    const match = TRACK_GROUPS.find(g => g.test(link.path));
    if (match) grouped[match.id].push(link);
    else grouped['other'].push(link);
  });



  const trackColumns = document.createElement('div');
  trackColumns.className = 'track-columns';

  const allGroups = [...TRACK_GROUPS, { id: 'other', label: 'Other' }];
  let hasAnyLinks = false;

  for (const group of allGroups) {
    const links = grouped[group.id];
    if (!links || links.length === 0) continue;
    hasAnyLinks = true;

    const col = document.createElement('div');
    col.className = 'track-column';

    const colHeader = document.createElement('div');
    colHeader.className = 'track-column-header';
    colHeader.textContent = group.label;
    col.appendChild(colHeader);

    links.forEach(link => {
      const row = document.createElement('div');
      row.className = 'track-row-compact';



      // Short display name: last segment of dotted path
      const shortName = link.path.includes('.') ? link.path.split('.').pop() : link.path;

      // Path label
      const pathSpan = document.createElement('span');
      pathSpan.className = 'track-path-compact';
      pathSpan.title = link.path;
      pathSpan.textContent = shortName;
      row.appendChild(pathSpan);

      // Values container
      const valsSpan = document.createElement('span');
      valsSpan.className = 'track-vals-compact';

      // Compute inherited base
      const inherited = inheritedBases.get(link.path);
      const baseDisplay = Number.isFinite(inherited) ? inherited : link.baseValue;
      const isInstant = isBooleanLinkPath(link.path);

      if (isSceneZero) {
        // Scene 0: both base and end are editable
        if (isInstant) {
          const baseToggle = document.createElement('button');
          baseToggle.className = `mode-pill ctrl-interactive ${link.baseValue ? 'active' : ''}`;
          baseToggle.textContent = link.baseValue ? 'ON' : 'OFF';
          baseToggle.addEventListener('click', () => {
            link.baseValue = link.baseValue ? 0 : 1;
            recomputeChain(timeline, idx, link.path);
            autoSaveTimeline();
            renderTimelinePanel();
          });
          valsSpan.appendChild(baseToggle);
        } else {
          const baseInput = document.createElement('input');
          baseInput.type = 'number';
          baseInput.className = 'track-base-input';
          baseInput.value = Number(link.baseValue).toFixed(4);
          baseInput.step = '0.01';
          baseInput.title = 'Start value';
          baseInput.addEventListener('change', () => {
            link.baseValue = parseFloat(baseInput.value);
            if (!Number.isFinite(link.baseValue)) link.baseValue = 0;
            recomputeChain(timeline, idx, link.path);
            autoSaveTimeline();
            renderTimelinePanel();
          });
          valsSpan.appendChild(baseInput);
        }
      } else {
        // Scene N>0: locked/inherited base
        const baseLocked = document.createElement('span');
        baseLocked.className = 'track-base-locked';
        baseLocked.textContent = isInstant ? `🔒 ${baseDisplay ? 'ON' : 'OFF'}` : `🔒 ${Number(baseDisplay).toFixed(2)}`;
        baseLocked.title = 'Inherited from previous scene';
        valsSpan.appendChild(baseLocked);
      }

      // Arrow separator
      if (!isInstant) {
        const arrow = document.createElement('span');
        arrow.className = 'track-arrow';
        arrow.textContent = ' → ';
        valsSpan.appendChild(arrow);
      } else {
        valsSpan.appendChild(document.createTextNode(' \u00A0 ')); // spacer
      }

      // End value: always editable
      if (isInstant) {
        const endToggle = document.createElement('button');
        endToggle.className = `mode-pill ctrl-interactive ${link.endValue ? 'active' : ''}`;
        endToggle.textContent = link.endValue ? 'ON' : 'OFF';
        endToggle.addEventListener('click', () => {
          link.endValue = link.endValue ? 0 : 1;
          recomputeChain(timeline, idx, link.path);
          autoSaveTimeline();
          renderTimelinePanel();
        });
        valsSpan.appendChild(endToggle);
      } else {
        const endInput = document.createElement('input');
        endInput.type = 'number';
        endInput.className = 'track-end-input';
        endInput.value = Number(link.endValue).toFixed(4);
        endInput.step = '0.01';
        endInput.title = 'End value';
        endInput.addEventListener('change', () => {
          link.endValue = parseFloat(endInput.value);
          if (!Number.isFinite(link.endValue)) link.endValue = 0;
          recomputeChain(timeline, idx, link.path);
          autoSaveTimeline();
          renderTimelinePanel();
        });
        valsSpan.appendChild(endInput);
      }

      row.appendChild(valsSpan);

      // Remove button — removes from ALL scenes
      const remBtn = document.createElement('button');
      remBtn.className = 'track-delete-compact';
      remBtn.innerHTML = '×';
      remBtn.title = `Remove ${link.path} from all scenes`;
      remBtn.addEventListener('click', () => {
        removeTrackFromAllScenes(timeline, link.path);
        autoSaveTimeline();
        renderTimelinePanel();
      });
      row.appendChild(remBtn);

      // Live value readout (hidden until playback)
      const liveRow = document.createElement('div');
      liveRow.className = 'track-live-value hidden';
      liveRow.dataset.trackLive = link.path;
      row.appendChild(liveRow);

      col.appendChild(row);
    });

    trackColumns.appendChild(col);
  }

  if (!hasAnyLinks) {
    trackColumns.innerHTML = '<div class="track-empty">No linked properties. Use the 🔗 icon on slider parameters to add tracks.</div>';
  }

  wrapper.appendChild(header);
  wrapper.appendChild(trackColumns);

  // ── Final assembly ────────────────────────────────────
  container.innerHTML = '';
  container.appendChild(wrapper);
}

function updatePlayheadUI(sm) {
  const info = sm.getPlaybackInfo();
  const container = document.getElementById('tl-scene-strip');
  if (!container) return;

  let playhead = document.getElementById('playhead-line');

  if (!info.isPlaying) {
    // Remove playhead when not playing
    if (playhead) playhead.remove();
    return;
  }

  if (!playhead) {
    playhead = document.createElement('div');
    playhead.id = 'playhead-line';
    playhead.className = 'playhead-scrubber';
    container.appendChild(playhead);
  }

  // Calculate pixel position across fixed-width blocks.
  // Each block is 120px. The playhead moves at different speeds
  // through blocks of different durations.
  const BLOCK_W = 120;
  const timeline = sm.getTimeline();
  if (!timeline) return;

  const { sceneIndex, localProgress } = info;
  // Pixels for all completed scenes + fraction through current scene
  const pixelPos = (sceneIndex * BLOCK_W) + (localProgress * BLOCK_W);
  playhead.style.left = `${pixelPos}px`;
}

/**
 * Update live value readouts on each track row during playback.
 * Reads current state values and displays interpolated position.
 */
function renderAudioSequence(timeline) {
  const container = document.getElementById('tl-audio-column');
  if (!container) return;

  const available = audioPlayer.getAvailableTracks();
  
  let html = `
    <div class="timeline-header" style="height: 29px;">
      <span style="font-size: 11px; text-transform: uppercase; color: var(--text-dim); letter-spacing: 0.05em; font-weight: 600;">Audio Sequence</span>
    </div>
    <div style="display: flex; gap: 4px; margin-bottom: 8px;">
      <select id="tl-audio-select" class="scene-input" style="flex: 1; min-width: 0; padding: 4px; font-family: var(--ui-font); font-size: 11px; background: var(--input-bg); color: var(--text-primary);">
        <option value="" style="background: var(--body-bg); color: var(--text-primary);">-- Add Track --</option>
        ${available.map(t => `<option value="${t.file}" style="background: var(--body-bg); color: var(--text-primary);">${t.title}</option>`).join('')}
      </select>
      <button id="tl-audio-add" class="timeline-btn" style="flex-shrink: 0; padding: 4px 8px;">+</button>
    </div>
    <div id="tl-audio-list" style="display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; scrollbar-width: thin; padding-right: 2px;">
  `;

  if (!timeline.audioPlaylist || timeline.audioPlaylist.length === 0) {
    html += `<div style="font-size: 11px; color: var(--text-dim); text-align: center; padding: 12px 0; font-style: italic;">(Alphabetical Default)</div>`;
  } else {
    timeline.audioPlaylist.forEach((file, idx) => {
      const title = available.find(t => t.file === file)?.title || file;
      html += `
        <div class="audio-seq-item" style="display: flex; align-items: center; background: var(--child-bg); padding: 5px 6px; border-radius: 4px; border: 1px solid var(--child-border); gap: 4px;">
          <div style="flex: 1; min-width: 0; font-size: 11px; font-family: var(--ui-font); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${title}">${title}</div>
          <button class="mini-link-btn audio-up-btn" data-idx="${idx}" title="Move Up">↑</button>
          <button class="mini-link-btn audio-down-btn" data-idx="${idx}" title="Move Down">↓</button>
          <button class="mini-link-btn audio-del-btn" data-idx="${idx}" style="color: var(--accent-red);" title="Remove">✕</button>
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  // Events
  document.getElementById('tl-audio-add').addEventListener('click', () => {
    const sel = document.getElementById('tl-audio-select');
    if (sel.value) {
      if (!timeline.audioPlaylist) timeline.audioPlaylist = [];
      timeline.audioPlaylist.push(sel.value);
      autoSaveTimeline();
      renderTimelinePanel();
    }
  });

  container.querySelectorAll('.audio-up-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      if (idx > 0) {
        const temp = timeline.audioPlaylist[idx];
        timeline.audioPlaylist[idx] = timeline.audioPlaylist[idx - 1];
        timeline.audioPlaylist[idx - 1] = temp;
        autoSaveTimeline();
        renderTimelinePanel();
      }
    });
  });

  container.querySelectorAll('.audio-down-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      if (idx < timeline.audioPlaylist.length - 1) {
        const temp = timeline.audioPlaylist[idx];
        timeline.audioPlaylist[idx] = timeline.audioPlaylist[idx + 1];
        timeline.audioPlaylist[idx + 1] = temp;
        autoSaveTimeline();
        renderTimelinePanel();
      }
    });
  });

  container.querySelectorAll('.audio-del-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      timeline.audioPlaylist.splice(idx, 1);
      autoSaveTimeline();
      renderTimelinePanel();
    });
  });
}

function updateLiveValues(sm) {
  const info = sm.getPlaybackInfo();
  const timeline = sm.getTimeline();
  if (!timeline) return;

  const liveEls = document.querySelectorAll('[data-track-live]');

  if (!info.isPlaying) {
    liveEls.forEach(el => el.classList.add('hidden'));
    return;
  }

  const state = sm.getState();
  const scene = timeline.scenes[info.sceneIndex];
  if (!scene) return;

  liveEls.forEach(el => {
    const path = el.dataset.trackLive;
    const link = scene.links.find(l => l.path === path);
    if (!link) {
      el.classList.add('hidden');
      return;
    }

    const currentVal = readPath(state, path);
    if (!Number.isFinite(currentVal)) {
      el.classList.add('hidden');
      return;
    }

    const range = link.endValue - link.baseValue;
    const pct = range !== 0 ? ((currentVal - link.baseValue) / range) * 100 : 0;
    const clampedPct = Math.max(0, Math.min(100, pct));

    el.innerHTML = `
      <span class="live-indicator">▸</span>
      <span class="live-val">${Number(currentVal).toFixed(4)}</span>
      <span class="live-bar"><span class="live-fill" style="width:${clampedPct}%"></span></span>
      <span class="live-pct">${clampedPct.toFixed(0)}%</span>
    `;
    el.classList.remove('hidden');
  });
}
