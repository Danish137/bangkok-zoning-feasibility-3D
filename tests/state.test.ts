// Interaction state machine (pure reducer): drawing, undo/cancel/finish, vertex moves, road edges
import { describe, expect, it } from 'vitest';
import { appReducer, initialState, type AppState, type AppAction } from '../src/state';
import type { LngLat } from '../src/engine/types';
import { signedArea } from '../src/engine/polygon';

const reduce = (s: AppState, ...actions: AppAction[]) => actions.reduce(appReducer, s);
const P = (x: number, y: number): LngLat => [100.576 + x * 1e-5, 13.73 + y * 1e-5];

describe('drawing workflow', () => {
  it('first click immediately creates a visible vertex', () => {
    const s = reduce(initialState, { type: 'START_DRAWING' }, { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) });
    expect(s.drawing.active).toBe(true);
    expect(s.drawing.vertices).toHaveLength(1);
  });
  it('cannot finish with fewer than three points', () => {
    const s = reduce(initialState, { type: 'START_DRAWING' }, { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) }, { type: 'ADD_DRAFT_VERTEX', coord: P(30, 0) }, { type: 'FINISH_DRAWING' });
    expect(s.drawing.active).toBe(true);
    expect(s.drawing.message).toMatch(/three/);
  });
  it('rejects a point whose segment would cross the path', () => {
    const s = reduce(initialState, { type: 'START_DRAWING' },
      { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) }, { type: 'ADD_DRAFT_VERTEX', coord: P(40, 0) },
      { type: 'ADD_DRAFT_VERTEX', coord: P(40, 40) }, { type: 'ADD_DRAFT_VERTEX', coord: P(20, -10) });
    expect(s.drawing.vertices).toHaveLength(3);
    expect(s.drawing.message).toMatch(/cross/);
  });
  it('undo removes the last point; cancel restores the previous plot', () => {
    const before = initialState.polygon;
    let s = reduce(initialState, { type: 'START_DRAWING' }, { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) }, { type: 'ADD_DRAFT_VERTEX', coord: P(10, 0) }, { type: 'UNDO_DRAFT_VERTEX' });
    expect(s.drawing.vertices).toHaveLength(1);
    s = appReducer(s, { type: 'CANCEL_DRAWING' });
    expect(s.drawing.active).toBe(false);
    expect(s.polygon).toEqual(before);
  });
  it('finish stores a CCW polygon and asks for road edges', () => {
    // drawn clockwise
    const s = reduce(initialState, { type: 'START_DRAWING' },
      { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) }, { type: 'ADD_DRAFT_VERTEX', coord: P(0, 40) },
      { type: 'ADD_DRAFT_VERTEX', coord: P(40, 40) }, { type: 'ADD_DRAFT_VERTEX', coord: P(40, 0) }, { type: 'FINISH_DRAWING' });
    expect(s.drawing.active).toBe(false);
    expect(s.polygon).toHaveLength(4);
    expect(signedArea(s.polygon)).toBeGreaterThan(0);
    expect(s.roadEdges).toEqual([]);
    expect(s.plotMessage).toMatch(/road/);
  });
  it('clear plot removes everything; new plot can be drawn elsewhere', () => {
    let s = reduce(initialState, { type: 'CLEAR_PLOT' });
    expect(s.polygon).toEqual([]);
    expect(s.result).toBeNull();
    s = reduce(s, { type: 'START_DRAWING' }, { type: 'ADD_DRAFT_VERTEX', coord: P(1000, 1000) }, { type: 'ADD_DRAFT_VERTEX', coord: P(1040, 1000) }, { type: 'ADD_DRAFT_VERTEX', coord: P(1040, 1040) }, { type: 'FINISH_DRAWING' });
    expect(s.polygon).toHaveLength(3);
  });
  it('stage navigation is blocked while drawing', () => {
    const s = reduce(initialState, { type: 'START_DRAWING' }, { type: 'SET_STAGE', stage: 'report' });
    expect(s.stage).toBe('site');
  });
});

describe('editing a committed plot', () => {
  const square = reduce(initialState, { type: 'START_DRAWING' },
    { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) }, { type: 'ADD_DRAFT_VERTEX', coord: P(40, 0) },
    { type: 'ADD_DRAFT_VERTEX', coord: P(40, 40) }, { type: 'ADD_DRAFT_VERTEX', coord: P(0, 40) }, { type: 'FINISH_DRAWING' });

  it('road edges carry their own widths (corner plot 18 m + 12 m)', () => {
    const s = reduce(square, { type: 'TOGGLE_ROAD_EDGE', edgeIndex: 0 }, { type: 'SET_ROAD_WIDTH', edgeIndex: 0, widthM: 18 },
      { type: 'TOGGLE_ROAD_EDGE', edgeIndex: 1 }, { type: 'SET_ROAD_WIDTH', edgeIndex: 1, widthM: 12 });
    expect(s.roadEdges).toEqual([{ edgeIndex: 0, widthM: 18 }, { edgeIndex: 1, widthM: 12 }]);
    const off = appReducer(s, { type: 'TOGGLE_ROAD_EDGE', edgeIndex: 0 });
    expect(off.roadEdges).toEqual([{ edgeIndex: 1, widthM: 12 }]);
  });
  it('a vertex move that would self-intersect is rejected', () => {
    const s = appReducer(square, { type: 'MOVE_VERTEX', index: 1, coord: P(-10, 20) }); // new edge crosses edge 3
    expect(s.polygon).toEqual(square.polygon);
    expect(s.plotMessage).toMatch(/cross/);
  });
  it('a vertex move that flips winding keeps road edges on the same physical segment', () => {
    // triangle; dragging a vertex across the opposite edge flips orientation
    const tri = reduce(initialState, { type: 'START_DRAWING' },
      { type: 'ADD_DRAFT_VERTEX', coord: P(0, 0) }, { type: 'ADD_DRAFT_VERTEX', coord: P(40, 0) },
      { type: 'ADD_DRAFT_VERTEX', coord: P(20, 30) }, { type: 'FINISH_DRAWING' },
      { type: 'TOGGLE_ROAD_EDGE', edgeIndex: 0 }, { type: 'SET_ROAD_WIDTH', edgeIndex: 0, widthM: 16 });
    const roadSeg = [tri.polygon[0]!, tri.polygon[1]!];
    const s = appReducer(tri, { type: 'MOVE_VERTEX', index: 2, coord: P(20, -30) });
    expect(signedArea(s.polygon)).toBeGreaterThan(0);
    const e = s.roadEdges[0]!;
    const seg = [s.polygon[e.edgeIndex]!, s.polygon[(e.edgeIndex + 1) % 3]!];
    const key = (pts: LngLat[]) => pts.map((p) => p.join(',')).sort().join('|');
    expect(key(seg)).toBe(key(roadSeg));
    expect(e.widthM).toBe(16);
  });
  it('preset selection loads per-edge widths', () => {
    const s = appReducer(initialState, { type: 'SET_PRESET', presetId: 'corner-18m-12m' });
    expect(s.roadEdges.map((r) => r.widthM).sort()).toEqual([12, 18]);
  });
  it('switching designs resets floor selection; result updates keep valid floor', () => {
    const s = reduce(initialState, { type: 'SET_SELECTED_FLOOR', floor: 2 }, { type: 'SET_ACTIVE_DESIGN', design: 'b' });
    expect(s.activeDesign).toBe('b');
    expect(s.selectedFloor).toBeNull();
  });
});
