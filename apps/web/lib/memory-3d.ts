// The geometry of the Memória: neurons in a 3D space around the Dominus, projected by hand (no
// library, light). Pure functions, so the screen only calls them and the tests can check them.

export type Vec3 = [number, number, number];
export type Turn = { yaw: number; pitch: number };
export type Projected = { x: number; y: number; scale: number; depth: number };

/** The camera's distance, in pixels: the far side gets smaller, the near side bigger. */
const FOCAL = 900;
export const FIRST_TURN: Turn = { yaw: 0.35, pitch: -0.18 };
const LIMIT = 1.8;
const PITCH_LIMIT = 1.2;

/**
 * Organic first places: life neurons spread around by the golden angle, at varied heights;
 * craft neurons (they know how to build) together, behind and below the Dominus.
 */
export function firstPlaces(neurons: { id: string; role: 'life' | 'craft' }[]): Map<string, Vec3> {
  const places = new Map<string, Vec3>();
  const life = neurons.filter((n) => n.role === 'life');
  const craft = neurons.filter((n) => n.role === 'craft');
  life.forEach((n, i) => {
    const a = i * 2.39996 + 0.4;
    places.set(n.id, [Math.cos(a), 0.55 * Math.sin(i * 1.7), Math.sin(a) * 0.9]);
  });
  craft.forEach((n, i) => {
    const a = (i - (craft.length - 1) / 2) * 0.9;
    places.set(n.id, [Math.sin(a) * 0.7, 0.55, -0.85]);
  });
  return places;
}

/** Rotates by the turn (yaw around the vertical axis, then pitch) and projects to the screen. */
export function project(
  [x, y, z]: Vec3,
  turn: Turn,
  view: { radius: number; cx: number; cy: number; tall: number },
): Projected {
  const x1 = x * Math.cos(turn.yaw) - z * Math.sin(turn.yaw);
  const z1 = x * Math.sin(turn.yaw) + z * Math.cos(turn.yaw);
  const y2 = y * Math.cos(turn.pitch) - z1 * Math.sin(turn.pitch);
  const z2 = y * Math.sin(turn.pitch) + z1 * Math.cos(turn.pitch);
  // Positive depth: closer to the viewer.
  const depth = z2 * view.radius;
  const scale = FOCAL / (FOCAL - depth);
  return {
    x: view.cx + x1 * view.radius * scale,
    y: view.cy + y2 * view.radius * scale * view.tall,
    scale,
    depth,
  };
}

/** Moves a point by a step in the camera's own axes (right, down, toward the viewer). */
export function nudge(p: Vec3, turn: Turn, [sx, sy, sz]: Vec3): Vec3 {
  // The inverse of project(): undo the pitch, then the yaw.
  const y = sy * Math.cos(turn.pitch) + sz * Math.sin(turn.pitch);
  const z1 = -sy * Math.sin(turn.pitch) + sz * Math.cos(turn.pitch);
  const x = sx * Math.cos(turn.yaw) + z1 * Math.sin(turn.yaw);
  const z = -sx * Math.sin(turn.yaw) + z1 * Math.cos(turn.yaw);
  const clamp = (v: number) => Math.max(-LIMIT, Math.min(LIMIT, v));
  return [clamp(p[0] + x), clamp(p[1] + y), clamp(p[2] + z)];
}

export function turnBy(turn: Turn, dyaw: number, dpitch: number): Turn {
  return {
    yaw: turn.yaw + dyaw,
    pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, turn.pitch + dpitch)),
  };
}

/** The size of the cloud for a screen: a bit wider on phones, taller on screens standing up. */
export function viewFor(width: number, height: number) {
  return {
    radius: Math.min(width, height) * (width < 600 ? 0.34 : 0.32),
    cx: width / 2,
    cy: height / 2 + 12,
    tall: Math.min(1.6, Math.max(1, height / width)),
  };
}
