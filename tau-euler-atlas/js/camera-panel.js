function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function finite(v, fallback) {
  return Number.isFinite(v) ? v : fallback;
}

function clonePoint(p, fallback = 0) {
  return {
    x: finite(p?.x, fallback),
    y: finite(p?.y, fallback),
    z: finite(p?.z, fallback),
  };
}

export function normalizeCameraSnapshot(raw) {
  const viewMode = raw?.viewMode === '2d' ? '2d' : '3d';
  const cameraType = viewMode === '2d' ? 'orthographic' : 'perspective';

  const position = clonePoint(raw?.position, 0);
  const target = clonePoint(raw?.target, 0);

  const orbit = {
    dampingFactor: clamp(finite(raw?.orbit?.dampingFactor, 0.07), 0, 1),
    rotateSpeed: clamp(finite(raw?.orbit?.rotateSpeed, 0.5), 0, 10),
    zoomSpeed: clamp(finite(raw?.orbit?.zoomSpeed, 0.8), 0, 10),
    panSpeed: clamp(finite(raw?.orbit?.panSpeed, 1), 0, 10),
    minDistance: Math.max(0.01, finite(raw?.orbit?.minDistance, 0.5)),
    maxDistance: Math.max(0.01, finite(raw?.orbit?.maxDistance, 350)),
  };
  if (orbit.maxDistance < orbit.minDistance) {
    const tmp = orbit.maxDistance;
    orbit.maxDistance = orbit.minDistance;
    orbit.minDistance = tmp;
  }

  const lens = {
    near: Math.max(0.0001, finite(raw?.lens?.near, 0.01)),
    far: Math.max(0.001, finite(raw?.lens?.far, 2000)),
  };

  if (viewMode === '3d') {
    lens.fov = clamp(finite(raw?.lens?.fov, 70), 10, 120);
  } else {
    lens.zoom = clamp(finite(raw?.lens?.zoom, 1), 0.01, 200);
  }

  if (lens.far <= lens.near) lens.far = lens.near + 0.001;

  const dx = position.x - target.x;
  const dy = position.y - target.y;
  const dz = position.z - target.z;
  let distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance) || distance <= 1e-9) distance = 5;
  distance = clamp(distance, orbit.minDistance, orbit.maxDistance);

  return {
    viewMode,
    cameraType,
    rotateEnabled: viewMode === '3d',
    position,
    target,
    orbit,
    lens,
    distance,
  };
}

export function setSnapshotDistance(snapshot, desiredDistance) {
  const next = normalizeCameraSnapshot(snapshot);
  if (next.viewMode !== '3d') return next;

  const distance = clamp(
    finite(desiredDistance, next.distance),
    next.orbit.minDistance,
    next.orbit.maxDistance,
  );

  let vx = next.position.x - next.target.x;
  let vy = next.position.y - next.target.y;
  let vz = next.position.z - next.target.z;
  let len = Math.hypot(vx, vy, vz);
  if (!Number.isFinite(len) || len <= 1e-9) {
    vx = 0;
    vy = 0;
    vz = 1;
    len = 1;
  }

  const nx = vx / len;
  const ny = vy / len;
  const nz = vz / len;

  next.position.x = next.target.x + nx * distance;
  next.position.y = next.target.y + ny * distance;
  next.position.z = next.target.z + nz * distance;
  next.distance = distance;
  return next;
}

export function applyCameraFieldToSnapshot(snapshot, path, value) {
  const next = normalizeCameraSnapshot(snapshot);
  const v = Number(value);
  if (!Number.isFinite(v)) return next;

  switch (path) {
    case 'position.x': next.position.x = v; break;
    case 'position.y': next.position.y = v; break;
    case 'position.z': next.position.z = v; break;
    case 'target.x': next.target.x = v; break;
    case 'target.y': next.target.y = v; break;
    case 'target.z': next.target.z = v; break;
    case 'orbit.dampingFactor': next.orbit.dampingFactor = v; break;
    case 'orbit.rotateSpeed': next.orbit.rotateSpeed = v; break;
    case 'orbit.zoomSpeed': next.orbit.zoomSpeed = v; break;
    case 'orbit.panSpeed': next.orbit.panSpeed = v; break;
    case 'orbit.minDistance': next.orbit.minDistance = v; break;
    case 'orbit.maxDistance': next.orbit.maxDistance = v; break;
    case 'lens.fov':
      if (next.viewMode === '3d') next.lens.fov = v;
      break;
    case 'lens.zoom':
      if (next.viewMode === '2d') next.lens.zoom = v;
      break;
    case 'lens.near':
      next.lens.near = v;
      break;
    case 'lens.far':
      next.lens.far = v;
      break;
    case 'distance':
      return setSnapshotDistance(next, v);
    default:
      break;
  }

  return normalizeCameraSnapshot(next);
}
