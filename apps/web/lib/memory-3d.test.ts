import { describe, expect, it } from 'vitest';

import { firstPlaces, FIRST_TURN, nudge, project, turnBy, viewFor } from './memory-3d';

const view = { radius: 300, cx: 720, cy: 462, tall: 1 };

describe('memory 3d', () => {
  it('puts craft neurons behind and below the Dominus, life ones around it', () => {
    const places = firstPlaces([
      { id: 'a', role: 'life' },
      { id: 'b', role: 'life' },
      { id: 'c', role: 'craft' },
    ]);
    const craft = places.get('c')!;
    expect(craft[1]).toBeGreaterThan(0); // below
    expect(project(craft, FIRST_TURN, view).depth).toBeLessThan(0); // behind
    expect(new Set([...places.values()].map((p) => p.join())).size).toBe(3);
  });

  it('draws the far side smaller and the near side bigger', () => {
    const turn = { yaw: 0, pitch: 0 };
    expect(project([0, 0, 1], turn, view).scale).toBeGreaterThan(1);
    expect(project([0, 0, -1], turn, view).scale).toBeLessThan(1);
    expect(project([0, 0, 0], turn, view)).toMatchObject({ x: 720, y: 462, scale: 1 });
  });

  it('moves a point the way the finger goes on screen, whatever the turn', () => {
    const turn = { yaw: 0.9, pitch: -0.4 };
    const p0 = project([0.2, 0.1, 0.3], turn, view);
    const moved = nudge([0.2, 0.1, 0.3], turn, [0.1, -0.05, 0]);
    const p1 = project(moved, turn, view);
    expect(p1.x - p0.x).toBeGreaterThan(25);
    expect(p1.y - p0.y).toBeLessThan(-10);
    // Toward the viewer: bigger, same place on the axis of sight.
    expect(project(nudge([0, 0, 0], turn, [0, 0, 0.2]), turn, view).scale).toBeGreaterThan(1);
  });

  it('never turns upside down, and fits phones and tall screens', () => {
    expect(turnBy({ yaw: 0, pitch: 1.1 }, 0, 1).pitch).toBe(1.2);
    expect(viewFor(390, 844).tall).toBeCloseTo(1.6);
    expect(viewFor(1440, 900)).toMatchObject({ cx: 720, cy: 462, tall: 1 });
  });
});
