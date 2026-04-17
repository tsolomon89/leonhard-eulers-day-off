// onboarding.js — Joyride Interactive Onboarding Flow

export function initOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  const btnReopen = document.getElementById('btn-reopen-onboarding');
  if (btnReopen) {
    btnReopen.addEventListener('click', () => {
      openOnboarding(overlay);
    });
  }

  // Handle window resize for tooltip repositioning
  window.addEventListener('resize', () => {
    if (overlay.classList.contains('active')) {
      const screen = ONBOARDING_SCREENS[currentScreenIndex];
      if (screen && screen.target) {
        positionTooltip(screen.target, screen.position);
      }
    }
  });

  const hasConfig = !!localStorage.getItem('tau-atlas-setup-config');
  const hasTimeline = !!localStorage.getItem('tau-atlas-timeline');
  const hasOnboarded = !!localStorage.getItem('tau-atlas-onboarding:v1');
  
  if (!hasConfig && !hasTimeline && !hasOnboarded) {
    openOnboarding(overlay);
  }
}

const ONBOARDING_SCREENS = [
  {
    title: "",
    target: null,
    content: `
      <div class="onboarding-cover-title">Leonhard Euler's Day Off</div>
      <p style="text-align: center; margin-bottom: 12px;">This interactive atlas explores the mathematical relationship between <strong>e</strong> and <strong>τ</strong> (tau).</p>
      <p style="text-align: center;">It began as a Desmos proof comparing the rotation rate of Euler's identity to a generalized form. You can have an arbitrary base <strong>α</strong>, but <em>only when α = τ</em> is the rate of rotation equal to that of Euler's identity.</p>
      
      <div class="onboarding-math-block">
        <span style="font-size: 1.15em;"><i>e</i><sup style="font-size: 0.75em; margin-left: 2px;"><i>i</i>τn</sup></span>
        <span style="font-size: 1.15em;">α<sup style="font-size: 0.75em; margin-left: 2px;"><i>i</i>nα / ln(α)</sup></span>
        <span style="font-size: 1.15em;">τ<sup style="font-size: 0.75em; margin-left: 2px;"><i>i</i>nτ / ln(τ)</sup></span>
      </div>
      <p style="text-align: center; color: var(--accent-green);">This invariant is the conceptual seed of the entire atlas.</p>
    `
  },
  {
    title: "Euler Mode & Tau Mode",
    target: "#proofs-panel",
    position: "right",
    action: () => {
      const header = document.querySelector('#proofs-panel .accordion-header');
      if (header && header.classList.contains('collapsed')) header.click();
    },
    content: `
      <p>The <strong>Proofs</strong> area lets you switch between Euler mode and Tau mode.</p>
      <p style="margin-top: 12px;">These are treated as mathematically equivalent in the app. The Tau form is simply a rewritten, equivalent formulation—not an unrelated system.</p>
    `
  },
  {
    title: "Visibility Toggles",
    target: ".panel-visibility-btn", // Will match the first one (Visual Helpers)
    position: "right",
    action: () => {
      const header = document.querySelector('#left-column .accordion-header'); // Visual helpers usually
      if (header && header.classList.contains('collapsed')) header.click();
    },
    content: `
      <p>You can toggle the visibility of specific components (like reference circles or the 3D grid) using these eye icons.</p>
    `
  },
  {
    title: "Cinematic Controls",
    target: "#controls-panel",
    position: "left",
    action: () => {
      const headers = document.querySelectorAll('#controls-panel .accordion-header');
      if (headers.length > 0 && headers[0].classList.contains('collapsed')) headers[0].click();
    },
    content: `
      <p>The main controls on the right allow you to adjust rendering parameters, equation inputs, cinematic bloom, fog, and theme blending.</p>
    `
  },
  {
    title: "Linking Feature",
    target: ".slider-link-btn",
    position: "left",
    content: `
      <p>You create scenes by <em>linking</em> parameters. Click this link icon (🔗) to add a parameter as a track in the Scene Director.</p>
      <p style="margin-top: 8px;">Once linked, the parameter will animate smoothly between your authored scenes.</p>
    `
  },
  {
    title: "Scene Director",
    target: "#timeline-panel",
    position: "top",
    action: () => {
      const toggle = document.getElementById('btn-timeline-toggle');
      if (toggle && !document.body.classList.contains('tl-open')) {
        toggle.click();
      }
    },
    content: `
      <p>The <strong>Scene Director</strong> is where linked parameters live.</p>
      <p style="margin-top: 8px;">As you transition between scenes, the Scene Director interpolates these linked values, driving the animation.</p>
    `
  },
  {
    title: "Playback & Transport",
    target: "#transport-bar",
    position: "top",
    content: `
      <p>The transport bar controls playback and syncs with the audio timeline.</p>
      <ul style="margin: 12px 0; padding-left: 20px; line-height: 1.6;">
        <li><strong>Play/Pause:</strong> Start or freeze playback.</li>
        <li><strong>Stop/Reset:</strong> Return to the beginning.</li>
        <li><strong>Export:</strong> Render your sequence to a high-quality video.</li>
      </ul>
    `
  }
];

let currentScreenIndex = 0;
let currentHighlightedTarget = null;

function openOnboarding(overlay) {
  currentScreenIndex = 0;
  
  if (!document.getElementById('onboarding-container')) {
    const container = document.createElement('div');
    container.id = 'onboarding-container';
    container.className = 'export-modal'; 
    
    const dotsHtml = ONBOARDING_SCREENS.map((_, i) => `<div class="onboarding-dot" id="dot-${i}"></div>`).join('');
    
    container.innerHTML = `
      <div class="export-modal-header" id="onboarding-header-wrap">
        <div class="export-modal-title" id="onboarding-title">Onboarding</div>
        <button class="export-modal-close" id="btn-onboarding-close" aria-label="Close">×</button>
      </div>
      <div id="onboarding-content" class="onboarding-content-area" style="font-size: 13px; line-height: 1.5; color: var(--text-secondary);"></div>
      
      <div class="export-separator"></div>
      
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <button id="btn-onboarding-skip" class="export-btn" style="background: transparent; border: none; color: var(--text-dim); padding: 6px 12px;">Skip Tour</button>
        <div class="onboarding-progress-dots" id="onboarding-progress-dots">${dotsHtml}</div>
        <div class="export-actions">
          <button id="btn-onboarding-back" class="export-btn export-btn-cancel" style="padding: 6px 12px;">Back</button>
          <button id="btn-onboarding-next" class="export-btn export-btn-start" style="padding: 6px 16px;">Next</button>
        </div>
      </div>
    `;
    
    overlay.appendChild(container);
    
    document.getElementById('btn-onboarding-close').addEventListener('click', () => closeOnboarding(overlay));
    document.getElementById('btn-onboarding-skip').addEventListener('click', () => closeOnboarding(overlay));
    
    document.getElementById('btn-onboarding-back').addEventListener('click', () => {
      if (currentScreenIndex > 0) navigateScreen(-1);
    });
    document.getElementById('btn-onboarding-next').addEventListener('click', () => {
      if (currentScreenIndex < ONBOARDING_SCREENS.length - 1) {
        navigateScreen(1);
      } else {
        closeOnboarding(overlay);
      }
    });
  }
  
  overlay.classList.add('active');
  renderOnboardingScreen(0);
}

function navigateScreen(dir) {
  const contentArea = document.getElementById('onboarding-content');
  contentArea.classList.add(dir > 0 ? 'fade-out' : 'fade-out-back');
  
  setTimeout(() => {
    currentScreenIndex += dir;
    renderOnboardingScreen(dir);
    contentArea.classList.remove('fade-out', 'fade-out-back');
    contentArea.classList.add('fade-in');
    setTimeout(() => contentArea.classList.remove('fade-in'), 300);
  }, 150);
}

function renderOnboardingScreen(dir = 0) {
  const screen = ONBOARDING_SCREENS[currentScreenIndex];
  
  if (typeof screen.action === 'function') {
    screen.action();
  }
  
  const headerWrap = document.getElementById('onboarding-header-wrap');
  if (currentScreenIndex === 0) {
    headerWrap.style.display = 'none';
  } else {
    headerWrap.style.display = 'flex';
    document.getElementById('onboarding-title').textContent = screen.title;
  }
  
  document.getElementById('onboarding-content').innerHTML = screen.content;
  
  ONBOARDING_SCREENS.forEach((_, i) => {
    const dot = document.getElementById(`dot-${i}`);
    if (dot) {
      if (i === currentScreenIndex) dot.classList.add('active');
      else dot.classList.remove('active');
    }
  });
  
  const btnBack = document.getElementById('btn-onboarding-back');
  const btnNext = document.getElementById('btn-onboarding-next');
  
  btnBack.style.visibility = currentScreenIndex === 0 ? 'hidden' : 'visible';
  btnNext.textContent = currentScreenIndex === ONBOARDING_SCREENS.length - 1 ? 'Finish' : 'Next';
  
  // Wait a tick for any DOM layout changes (like accordions opening) to settle before calculating position
  setTimeout(() => {
    positionTooltip(screen.target, screen.position);
  }, 50);
}

function positionTooltip(targetSelector, position) {
  const container = document.getElementById('onboarding-container');
  
  // Clear previous highlight
  if (currentHighlightedTarget) {
    currentHighlightedTarget.classList.remove('onboarding-target-highlight');
    let el = currentHighlightedTarget;
    while (el && el !== document.body) {
      el.classList.remove('onboarding-stack-elevate');
      el = el.parentElement;
    }
    currentHighlightedTarget = null;
  }
  
  if (!targetSelector) {
    container.style.position = 'relative';
    container.style.top = 'auto';
    container.style.left = 'auto';
    container.style.transform = 'none';
    container.classList.remove('joyride-tooltip');
    container.removeAttribute('data-pointer');
    return;
  }
  
  const target = document.querySelector(targetSelector);
  if (!target) return; // Fallback if element not found
  
  currentHighlightedTarget = target;
  target.classList.add('onboarding-target-highlight');

  // Elevate parent stacking contexts to ensure the target breaks through the overlay
  let el = target.parentElement;
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (style.zIndex !== 'auto' && style.zIndex !== '0') {
      el.classList.add('onboarding-stack-elevate');
    }
    el = el.parentElement;
  }
  
  // Convert to absolute floating tooltip
  container.classList.add('joyride-tooltip');
  container.setAttribute('data-pointer', position);
  
  // Ensure we can get the bounding box of the container before it has position applied
  const tipRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  
  let top = 0, left = 0;
  const gap = 20; // Distance between tooltip and target
  
  switch (position) {
    case 'top':
      top = targetRect.top - tipRect.height - gap;
      left = targetRect.left + (targetRect.width / 2) - (tipRect.width / 2);
      break;
    case 'bottom':
      top = targetRect.bottom + gap;
      left = targetRect.left + (targetRect.width / 2) - (tipRect.width / 2);
      break;
    case 'left':
      top = targetRect.top + (targetRect.height / 2) - (tipRect.height / 2);
      left = targetRect.left - tipRect.width - gap;
      break;
    case 'right':
      top = targetRect.top + (targetRect.height / 2) - (tipRect.height / 2);
      left = targetRect.right + gap;
      break;
  }
  
  // Keep on screen constraints
  left = Math.max(16, Math.min(left, window.innerWidth - tipRect.width - 16));
  top = Math.max(16, Math.min(top, window.innerHeight - tipRect.height - 16));
  
  container.style.top = top + 'px';
  container.style.left = left + 'px';
  container.style.transform = 'none';
  container.style.position = 'absolute';
  
  // Try scrolling into view inside scrollable containers smoothly
  target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
}

function closeOnboarding(overlay) {
  overlay.classList.remove('active');
  if (currentHighlightedTarget) {
    currentHighlightedTarget.classList.remove('onboarding-target-highlight');
    let el = currentHighlightedTarget;
    while (el && el !== document.body) {
      el.classList.remove('onboarding-stack-elevate');
      el = el.parentElement;
    }
    currentHighlightedTarget = null;
  }
  
  const container = document.getElementById('onboarding-container');
  if (container) {
    container.classList.remove('joyride-tooltip');
    container.style.position = 'relative';
    container.style.top = 'auto';
    container.style.left = 'auto';
    container.style.transform = 'none';
  }
  
  localStorage.setItem('tau-atlas-onboarding:v1', 'completed');
}
