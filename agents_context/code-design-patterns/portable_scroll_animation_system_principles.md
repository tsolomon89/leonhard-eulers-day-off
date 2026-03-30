# Portable Scroll-Animation System Principles

**Category**: coding_patterns  
**Created**: 2026-03-29  
**Last Updated**: 2026-03-29

## Summary
This document defines a reusable design pattern for building scroll-linked and timeline-driven animation systems in websites or interactive content surfaces. It is framework-agnostic and intended for adoption across projects with different stacks, UI models, and runtime renderers.

## Design Goals
1. One consistent animation model across DOM, Canvas, WebGL, and other render backends.
2. Predictable behavior from authoring to runtime.
3. Clean separation between progress generation and visual rendering.
4. Optional tooling (editor/debug/diagnostics) without making tooling a runtime dependency.
5. Accessibility and performance as first-class constraints.

## Non-Goals
1. Locking to any single framework, renderer, or CMS.
2. Requiring a hidden debug unlock or any specific developer UX.
3. Forcing one animation style (continuous scroll vs one-shot timeline).

## Core Concepts
### 1) Normalized Progress
All animation is driven by normalized progress in range `0..1`.

Progress source can vary:
1. Scroll-position derived.
2. Timeline/rAF derived.
3. Programmatic (state machine/event-driven).

Renderers should consume progress, not own progress logic.

### 2) Linked Numeric Parameter Contract
Use one shared parameter shape:

```ts
type NumberParam = {
  value: number;
  endValue: number | null;
  isLinked: boolean;
};
```

Interpolation rule:

```ts
const getLinkedNumber = (param: NumberParam, progress: number): number => {
  if (!param.isLinked || param.endValue === null) return param.value;
  return param.value + (param.endValue - param.value) * progress;
};
```

### 3) Section/Segment Behavior Contract
Define traversal behavior independently from object animation type:

```ts
type SegmentMotionConfig = {
  mode?: 'scroll' | 'animated';
  durationSec?: number;
  clickTrigger?: boolean;
  autoAdvance?: boolean;
};
```

`mode` controls how progress is generated.  
Object animation type controls how objects respond to progress/time.

## System Architecture
### Layer A: Input + Trigger Layer
Receives wheel, touch, pointer, keyboard, and programmatic events.

### Layer B: Progress Engine
Maps interaction/state to normalized progress:
1. scroll mode: based on geometric position and travel distance
2. animated mode: based on elapsed timeline and duration

### Layer C: Parameter Resolver
Computes effective runtime values from:
1. base config
2. overrides
3. responsive scaling
4. progress interpolation
5. renderer-specific clamps

### Layer D: Renderer Layer
Consumes resolved values in any backend (DOM/CSS, Canvas, WebGL, etc.).

### Layer E: Optional Tooling Layer
Can include:
1. visual editor
2. diagnostics overlay
3. parity capture
4. config export/import

Tooling should be optional and removable without breaking runtime.

## Feature Principles
### Progress-First Principle
Keep one progress value per animated segment and pass it to all renderers.

### Contract Consistency Principle
All renderers must use the same interpolation semantics for linked numeric values.

### Mode Decoupling Principle
Traversal mode (`scroll`/`animated`) is orthogonal to rendering backend and object animation style.

### Determinism Principle
Support optional deterministic capture controls:
1. fixed time
2. deterministic seed
3. explicit enable flag

### Safety Principle
Always clamp progress and parameter outputs before rendering.

## Authoring Semantics (Portable UX Contract)
If a UI slider/editor is provided, recommended behavior:

1. `Shift+Click` or `Shift+Drag` creates/sets secondary endpoint (`endValue`).
2. When both endpoints exist, nearest-handle targeting is used.
3. Every update is clamped to field bounds and snapped to step increment.
4. Link toggle (`isLinked`) controls interpolation participation.
5. Removing endpoint also clears linked state to prevent stale intent.
6. Direction is `value -> endValue`; reverse is a value swap.

## Traversal Modes
### Scroll Mode
Progress derives from geometric travel through a segment.

### Animated Mode
Progress derives from a timeline that starts via trigger(s).
Recommended state machine:
`idle -> triggered -> running -> done`

Recommended trigger options:
1. downward wheel
2. downward touch swipe
3. optional click trigger
4. optional explicit keyboard trigger

Recommended completion behavior options:
1. stop and release input lock
2. optional auto-advance to next segment
3. optional replay policy (`one-shot` or `repeatable`)

## Accessibility Principles
1. Honor `prefers-reduced-motion`; provide static or low-motion fallback.
2. Provide keyboard-accessible animation trigger where animated mode exists.
3. Do not rely on pointer-only interactions for essential content.
4. Ensure input locks (wheel/touch prevention) are temporary and scoped.

## Performance Principles
1. Use visibility gating (IntersectionObserver or equivalent).
2. Mount render loops only when needed; dispose cleanly.
3. Track active contexts/RAFs/segments for observability.
4. Keep interpolation and config resolution lightweight per frame.
5. Apply responsive transforms early to avoid per-frame layout churn.

## Persistence and Deployment Principles
1. Separate runtime content config from tooling state.
2. Treat editor/debug state as optional local state.
3. Treat production animation config as explicit versioned source data.

## Portability Checklist
1. One normalized progress source per segment implemented.
2. Shared linked-number contract used by all renderers.
3. Traversal mode and renderer backend are decoupled.
4. Bounds/step quantization behavior verified.
5. Direction reversal verified.
6. Scroll and animated modes produce equivalent interpolation semantics.
7. Accessibility fallbacks implemented (`reduced-motion`, keyboard trigger).
8. Runtime diagnostics present for contexts/RAFs/segment health.
9. Deterministic capture path available for visual regression.
10. Clear import/export or config handoff path established.

## Minimal Reference Interfaces
```ts
type NumberParam = { value: number; endValue: number | null; isLinked: boolean };

type SegmentMotionConfig = {
  mode?: 'scroll' | 'animated';
  durationSec?: number;
  clickTrigger?: boolean;
  autoAdvance?: boolean;
};

type ProgressEngine = {
  getProgress: () => number; // returns 0..1
  start?: () => void;        // used by animated mode
  stop?: () => void;
};
```

## Implementation Sequence (Recommended)
1. Build progress engine and normalize to `0..1`.
2. Build shared `NumberParam` resolver.
3. Integrate one renderer path (DOM or Canvas) to validate contract.
4. Add second renderer path and verify parity.
5. Add optional authoring UI and diagnostics.
6. Add accessibility and performance hardening.
7. Add deterministic capture and regression tests.

## Related
- `agents_context/coding_patterns/vi_scroll_animation_debug_pattern.md` (project-specific concrete instance)
