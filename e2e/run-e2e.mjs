// End-to-end browser verification against the production build (vite preview) in installed Microsoft Edge.
// Usage: npm run build && node e2e/run-e2e.mjs [--headed]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const HEADED = process.argv.includes('--headed');
const PORT = 4179;
const URL = `http://localhost:${PORT}/`;
const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
// ok: true = PASS, false = FAIL, null = INCONCLUSIVE (depends on an external service that did not respond in time)
const log = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok === null ? 'INCONCLUSIVE' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// run vite's JS entry directly with node (no shell) so the process can be terminated reliably on every OS
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server timeout')), 30000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(PORT))) { clearTimeout(t); resolve(); } });
});

const browser = await chromium.launch({ channel: 'msedge', headless: !HEADED, args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('NAVIGATED', f.url()); });
page.on('crash', () => console.log('PAGE CRASHED'));
page.on('console', (m) => { if (process.env.E2E_VERBOSE) console.log('console:', m.type(), m.text().slice(0, 200)); });

const S = () => page.evaluate(() => {
  const s = window.__BKK__.state;
  const d = s.activeDesign === 'b' ? s.result?.designB : s.result?.designA;
  return {
    stage: s.stage, drawing: s.drawing.active, nDraft: s.drawing.vertices.length, nPoly: s.polygon.length,
    roads: s.roadEdges, gfa: d?.totalGFA ?? null, gfaB: s.result?.designB?.totalGFA ?? null, floors: d?.floorCount ?? 0,
    selectedFloor: s.selectedFloor, hovered: s.hoveredCheck, focused: s.focusedCheck, computing: s.computing,
    fails: d?.failCount ?? null, valid: s.result?.valid ?? null, activeDesign: s.activeDesign,
    jur: s.result?.jurisdiction?.status ?? null,
  };
});
const waitIdle = async () => {
  await page.waitForFunction(() => !window.__BKK__?.state.computing, null, { timeout: 15000 });
  await page.evaluate(() => new Promise((r) => { const m = window.__map__; if (m.loaded() && !m.isMoving()) r(); else m.once('idle', () => r()); setTimeout(r, 4000); }));
};
/** Wait until every visible tile (incl. OSM buildings from the external tile server) has loaded and the map is idle */
const waitTiles = (ms = 30000) => page.waitForFunction(() => {
  const m = window.__map__;
  return m.areTilesLoaded() && m.loaded() && !m.isMoving();
}, null, { timeout: ms, polling: 250 }).then(() => true, () => false);
const overlay = (sel) => page.$$eval(`[data-testid="draw-overlay"] ${sel}`, (els) => els.length);
const project = (ll) => page.evaluate((ll) => { const p = window.__map__.project(ll); return { x: p.x, y: p.y }; }, ll);

try {
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__map__ && window.__map__.getLayer('three-massing') && window.__BKK__, null, { timeout: 30000 });
  await waitIdle();
  await sleep(1500);
  log('app loads with map, 3D layer and initial result', true, `${Date.now() - t0} ms to idle`);
  await page.evaluate(() => { window.__noReloadMarker = 42; });
  const tilesReady = await waitTiles();
  const ctxBuildings = await page.evaluate(() => window.__map__.queryRenderedFeatures({ layers: ['building-3d'] }).length);
  log('real surrounding buildings rendered (OSM building-3d)', ctxBuildings > 0, `${ctxBuildings} building features in view${tilesReady ? '' : ' (tiles still loading after 30 s: external tile server slow)'}`);
  await page.screenshot({ path: `${SHOTS}/1-site.png` });

  // ── Drawing workflow ──
  await page.click('[data-testid="draw-custom-plot-btn"]');
  await sleep(300);
  const box = await page.locator('[data-testid="map-container"]').boundingBox();
  const cx = box.x + 520, cy = box.y + 430;
  const pts = [[cx, cy], [cx + 150, cy - 10], [cx + 170, cy + 120], [cx + 60, cy + 170], [cx - 20, cy + 110]];
  const tClick = Date.now();
  await page.mouse.click(pts[0][0], pts[0][1]);
  const lat = await page.evaluate(async ([x, y]) => {
    const t = performance.now();
    while (performance.now() - t < 2000) {
      const hit = [...document.querySelectorAll('[data-testid="draw-overlay"] circle')].some((el) => Math.hypot(+el.getAttribute('cx') - x, +el.getAttribute('cy') - y) < 3);
      if (hit) return performance.now() - t;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return -1;
  }, [pts[0][0] - box.x, pts[0][1] - box.y]);
  const v1 = await overlay('circle');
  log('first click shows a vertex immediately', v1 === 1 && lat >= 0 && lat < 150, `vertex markers=${v1}, drawn ${lat.toFixed(0)} ms after click event (${Date.now() - tClick} ms incl. automation)`);
  await page.mouse.move(pts[1][0] - 40, pts[1][1] + 20, { steps: 5 });
  await sleep(150);
  const preview1 = await overlay('line.ov-preview');
  const tip = await page.locator('[data-testid="draw-tooltip"]').textContent();
  log('live preview line from first vertex to cursor', preview1 === 1, `preview segments=${preview1}, tooltip="${tip}"`);
  await page.mouse.click(pts[1][0], pts[1][1]);
  await page.mouse.click(pts[2][0], pts[2][1]);
  await page.mouse.move(pts[3][0], pts[3][1], { steps: 4 });
  await sleep(150);
  const fill = await overlay('polygon.ov-fill');
  const line = await overlay('polyline.ov-line');
  log('translucent polygon preview once 3 points can form a polygon', fill === 1 && line === 1, `fill=${fill}, placed line=${line}`);
  await page.screenshot({ path: `${SHOTS}/0-drawing.png` });
  await page.mouse.click(pts[3][0], pts[3][1]);
  await page.click('[data-testid="undo-vertex-btn"]');
  let s = await S();
  log('undo removes last vertex', s.nDraft === 3, `vertices=${s.nDraft}`);
  // crossing point is rejected
  // segment from the 3rd point back across the first edge (p0→p1) must be rejected
  await page.mouse.click(pts[0][0] + 60, pts[0][1] - 80);
  s = await S();
  const msg = await page.locator('[data-testid="drawing-message"]').count();
  await page.mouse.click(pts[3][0], pts[3][1]);
  await page.mouse.click(pts[4][0], pts[4][1]);
  s = await S();
  log('self-crossing point rejected, drawing continues', msg === 1 && s.nDraft === 5, `message shown=${msg === 1}, vertices=${s.nDraft}`);
  // close by clicking the first vertex
  await page.mouse.move(pts[0][0] + 3, pts[0][1] + 2, { steps: 3 });
  await page.mouse.click(pts[0][0] + 3, pts[0][1] + 2);
  await waitIdle();
  s = await S();
  log('clicking the first vertex closes the polygon', !s.drawing && s.nPoly === 5 && s.valid === true, `poly vertices=${s.nPoly}, valid=${s.valid}`);

  // context buildings overlapping the new plot are hidden (and stay hidden)
  await sleep(1500);
  const inside = await page.evaluate(() => {
    const m = window.__map__; const poly = window.__BKK__.state.polygon;
    const pip = (pt, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
    return m.queryRenderedFeatures({ layers: ['building-3d'] }).filter((f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : []).some((r) => r.some((p) => pip(p, poly)))).length;
  });
  log('OSM buildings inside the plot are hidden', inside === 0, `${inside} context buildings still rendered inside the plot`);

  // the map-based road analysis runs once the plot exists (auto-detects frontages on a new plot)
  await page.waitForFunction(() => !window.__BKK__.state.autoRoadsPending, null, { timeout: 20000 }).catch(() => {});
  s = await S();
  log('road analysis ran for the drawn plot', await page.evaluate(() => !!window.__BKK__.state.roadAnalysis), `auto-detected roads: ${JSON.stringify(s.roads.map((r) => `E${r.edgeIndex + 1}:${r.widthM}m ${r.source}`))}`);
  // make edges 0 and 1 the road frontages with surveyed widths (toggle via the map labels where needed)
  for (const i of [0, 1]) {
    const has = await page.evaluate((i) => window.__BKK__.state.roadEdges.some((r) => r.edgeIndex === i), i);
    if (!has) { await page.click(`[data-testid="edge-label-${i}"]`); await waitIdle(); }
  }
  for (const r of (await S()).roads) if (r.edgeIndex > 1) { await page.click(`[data-testid="edge-label-${r.edgeIndex}"]`); await waitIdle(); }
  const gNoWidth = (await S()).gfa;
  await page.fill('[data-testid="road-width-input-0"]', '18');
  await waitIdle();
  await page.fill('[data-testid="road-width-input-1"]', '12');
  await waitIdle();
  s = await S();
  const noReload = await page.evaluate(() => window.__noReloadMarker === 42);
  const widths = s.roads.map((r) => `${r.edgeIndex}:${r.widthM}:${r.source}`).join(',');
  log('two road edges with independent surveyed widths (18 m + 12 m) update live without reload', widths === '0:18:user,1:12:user' && noReload, `roads=${widths}, gfa ${gNoWidth} → ${s.gfa}`);

  // road-width timing (input → result)
  const sb = () => page.evaluate(() => window.__BKK__.state.result.designA.envelope.setbacks[0].distanceM);
  const sb18 = await sb();
  const tw = await page.evaluate(async () => {
    const t = performance.now();
    window.__BKK__.dispatch({ type: 'SET_ROAD_WIDTH', edgeIndex: 0, widthM: 4 });
    await new Promise((r) => { const chk = () => (window.__BKK__.state.result?.input.roadEdges.find((x) => x.edgeIndex === 0)?.widthM === 4 ? r() : requestAnimationFrame(chk)); requestAnimationFrame(chk); });
    return performance.now() - t;
  });
  const sb4 = await sb();
  log('road width 18 → 4 m recomputes setbacks live', sb4 !== sb18, `${tw.toFixed(0)} ms input→result (worker), edge-1 setback ${sb18} → ${sb4} m`);
  await page.fill('[data-testid="road-width-input-0"]', '18');
  await waitIdle();

  // vertex drag
  const poly0 = await page.evaluate(() => window.__BKK__.state.polygon[2]);
  const vp = await project(poly0);
  const before = (await S()).gfa;
  await page.mouse.move(box.x + vp.x, box.y + vp.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + vp.x + i * 4, box.y + vp.y + i * 3);
  await page.mouse.up();
  await waitIdle();
  const poly1 = await page.evaluate(() => window.__BKK__.state.polygon[2]);
  const after = (await S()).gfa;
  log('dragging a vertex reshapes the plot and recomputes', poly0[0] !== poly1[0] && before !== after, `gfa ${before} → ${after}`);

  // ── Corner preset (Ekkamai road + lane, inside ย.9) ──
  await page.click('[data-testid="preset-ekkamai-corner"]');
  await waitIdle();
  await sleep(1500);
  await waitIdle();
  s = await S();
  log('corner preset loads two map-estimated frontages', s.roads.length === 2 && s.roads.every((r) => r.source === 'map-estimate'), JSON.stringify(s.roads));
  const zone = await page.evaluate(() => { const j = window.__BKK__.state.result.jurisdiction; return { status: j.status, zone: j.zone, margin: j.boundaryMarginM }; });
  log('zone detected automatically from the BMA GIS layer', zone.status === 'PASS' && zone.zone === 'ย.9', `${zone.zone} ${zone.status}, ${Math.round(zone.margin)} m from boundary`);
  const transit = await page.evaluate(() => { const t = window.__BKK__.state.result.transit; return { src: t.source, n: t.nearest?.nameEn, d: t.nearest?.minDistanceM }; });
  log('nearest mass-transit station computed', transit.src === 'station-data' && !!transit.n, `${transit.n}, ${Math.round(transit.d)} m`);
  const zoningLayer = await page.evaluate(() => window.__map__.queryRenderedFeatures({ layers: ['zoning-fill'] }).length);
  log('zoning overlay rendered on the map', zoningLayer > 0, `${zoningLayer} zone features in view`);
  await page.screenshot({ path: `${SHOTS}/1-site-preset.png` });

  // ── Building stage ──
  await page.click('[data-testid="stage-building"]');
  await waitIdle();
  await sleep(900);
  await page.screenshot({ path: `${SHOTS}/2-building-design-a.png` });
  const gA = (await S()).gfa;
  await page.click('[data-testid="design-b"]');
  await sleep(600);
  s = await S();
  await page.screenshot({ path: `${SHOTS}/2-building-design-b.png` });
  log('Design A and B are distinct and switchable', s.activeDesign === 'b' && gA !== null && s.gfa !== null, `A=${gA} m², B=${s.gfa} m²`);
  await page.click('[data-testid="design-a"]');
  await page.click('[data-testid="guide-envelope"]');
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/2-building-envelope.png` });
  await page.click('[data-testid="guide-envelope"]');

  // frame rate while orbiting
  const fps = await page.evaluate(async () => {
    const m = window.__map__;
    let frames = 0; let run = true;
    const tick = () => { frames++; if (run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    m.easeTo({ bearing: m.getBearing() + 180, duration: 3000, easing: (t) => t });
    await new Promise((r) => setTimeout(r, 3000));
    run = false;
    return frames / 3;
  });
  log('orbit 180° renders (frame rate measured)', fps > 10, `${fps.toFixed(1)} fps (${HEADED ? 'headed GPU' : 'headless, software WebGL'})`);
  await page.click('[data-testid="cam-reset"]');
  await sleep(1100);

  // 3D floor picking
  const pickable = await page.evaluate(() => {
    const m = window.__map__; const c = m.getCanvas().getBoundingClientRect();
    for (let y = 120; y < c.height - 120; y += 20) for (let x = 200; x < c.width - 450; x += 20) {
      const hit = m.queryRenderedFeatures([x, y], { layers: ['plot-fill'] });
      if (hit.length) return { x, y };
    }
    return null;
  });
  await page.evaluate(() => window.__BKK__.dispatch({ type: 'SET_SELECTED_FLOOR', floor: null }));
  // find a screen point over the massing by ray-picking candidate pixels through the app's own picker
  let picked = null;
  for (let dy = -10; dy > -260 && picked === null && pickable; dy -= 25) {
    await page.mouse.click(box.x + pickable.x + 20, box.y + pickable.y + dy);
    await sleep(120);
    picked = (await S()).selectedFloor;
  }
  s = await S();
  log('clicking a storey in 3D selects it', s.selectedFloor !== null, `selectedFloor=${s.selectedFloor}`);

  // ── Floor stage ──
  await page.click('[data-testid="stage-floor"]');
  await sleep(700);
  await page.fill('[data-testid="floor-scrubber"]', '5');
  await sleep(300);
  s = await S();
  const scheduleTotal = Number(await page.locator('[data-testid="schedule-total"]').textContent());
  const gfaNow = s.gfa;
  log('floor selector + schedule total reconciles with GFA', s.selectedFloor === 5 && Math.abs(scheduleTotal - gfaNow) < 0.01, `L${s.selectedFloor + 1}, Σ=${scheduleTotal}, GFA=${gfaNow}`);
  await page.click('[data-testid="section-cutaway-toggle"]');
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/3-floor.png` });
  await page.click('[data-testid="floor-design-b"]');
  await sleep(300);
  s = await S();
  log('switching design in floor stage updates floors', s.activeDesign === 'b', `B floors=${s.floors}`);

  // ── Parking mode: basements ──
  await page.click('[data-testid="stage-site"]');
  await page.selectOption('[data-testid="parking-mode"]', 'basement');
  await waitIdle();
  const bm = await page.evaluate(() => { const d = window.__BKK__.state.result.designA; return { b: d.basementFloors.length, p: d.floors.filter((f) => f.use === 'parking').length, req: d.parking.requiredSpaces, prov: d.parking.providedSpaces }; });
  log('parking mode → basement levels replace podium parking', bm.b > 0 && bm.p === 0 && bm.prov >= bm.req, `${bm.b} basement level(s), ${bm.prov}/${bm.req} spaces`);
  await page.selectOption('[data-testid="parking-mode"]', 'podium');
  await waitIdle();
  await page.click('[data-testid="stage-floor"]');
  await sleep(400);

  // ── Compliance stage ──
  await page.click('[data-testid="stage-compliance"]');
  await sleep(500);
  await page.click('[data-testid="checklist-design-a-btn"]');
  await page.hover('[data-testid="check-sky-plane"]');
  await sleep(300);
  s = await S();
  const statuses = await page.$$eval('[data-testid^="check-"][data-status]', (els) => els.map((e) => e.getAttribute('data-status')));
  log('hovering a rule highlights it in 3D', s.hovered === 'sky-plane', `hovered=${s.hovered}`);
  const unv = statuses.filter((x) => x === 'UNVERIFIED').length;
  const zoneStatus = await page.getAttribute('[data-testid="check-zoning-jurisdiction"]', 'data-status');
  log('checklist lists every rule with a status; zone PASS from the GIS layer for this ย.9 preset', zoneStatus === 'PASS' && statuses.length > 20 && unv >= 0, `${statuses.length} checks: ${['PASS', 'FAIL', 'UNVERIFIED', 'INFO', 'N/A'].map((k) => `${k}=${statuses.filter((x) => x === k).length}`).join(' ')}`);
  await page.click('[data-testid="check-road-setback-0"] button');
  await page.mouse.move(box.x + 300, box.y + 300);
  await sleep(500);
  await page.screenshot({ path: `${SHOTS}/4-compliance.png` });
  await page.click('[data-testid="checklist-design-b-btn"]');
  await sleep(300);
  const bStatuses = await page.$$eval('[data-testid^="check-"][data-status]', (els) => els.length);
  log('Design B has its own independent checklist', bStatuses > 15 && (await S()).activeDesign === 'b', `${bStatuses} checks`);
  const estBadges = await page.$$eval('[data-testid^="est-"]', (els) => els.length);
  log('checks that rely on map-estimated widths carry an EST. INPUT badge', estBadges > 0, `${estBadges} badges`);

  // ── Report stage ──
  await page.click('[data-testid="stage-report"]');
  await sleep(600);
  await page.screenshot({ path: `${SHOTS}/5-report.png` });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('[data-testid="download-json-btn"]')]);
  const dlPath = await download.path();
  const report = JSON.parse((await import('node:fs')).readFileSync(dlPath, 'utf8'));
  log('JSON export contains both designs, schedules, sources, assumptions', !!report.designs.A && !!report.designs.B && report.designs.A.floorSchedule.length > 0 && report.sources.length >= 4, `A ${report.designs.A.floorSchedule.length} storeys, B ${report.designs.B.floorSchedule.length} storeys`);

  // ── Out-of-Bangkok plot ──
  await page.click('[data-testid="stage-site"]');
  await page.evaluate(() => {
    const d = window.__BKK__.dispatch;
    d({ type: 'START_DRAWING' });
    [[101.20, 13.40], [101.2005, 13.40], [101.2005, 13.4005], [101.20, 13.4005]].forEach((c) => d({ type: 'ADD_DRAFT_VERTEX', coord: c }));
    d({ type: 'FINISH_DRAWING' });
  });
  await waitIdle();
  s = await S();
  log('plot outside Bangkok → jurisdiction FAIL', s.jur === 'FAIL', `jurisdiction=${s.jur}`);

  // ── Memory across repeated preset switches ──
  const mem = await page.evaluate(async () => {
    const used = async () => { for (let i = 0; i < 3; i++) { window.gc?.(); await new Promise((r) => setTimeout(r, 200)); } return performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN; };
    const d = window.__BKK__.dispatch;
    const ids = ['thonglor-soi-l', 'thonglor-trapezoid', 'ekkamai-corner'];
    const wait = () => new Promise((r) => { const c = () => (window.__BKK__.state.computing ? setTimeout(c, 30) : r()); setTimeout(c, 30); });
    const cycle = async (n) => { for (let i = 0; i < n; i++) { d({ type: 'SET_PRESET', presetId: ids[i % 3] }); d({ type: 'SET_STAGE', stage: i % 2 ? 'building' : 'site' }); await wait(); await new Promise((r) => setTimeout(r, 120)); } };
    await cycle(6); // warm-up (tile caches, JIT)
    const m0 = await used();
    await cycle(24);
    const m1 = await used();
    await cycle(24);
    const m2 = await used();
    return { m0, m1, m2 };
  });
  log('no memory leak across 48 preset/stage switches (forced GC)', (mem.m2 - mem.m1) < 15, `heap after GC: ${mem.m0.toFixed(1)} → ${mem.m1.toFixed(1)} → ${mem.m2.toFixed(1)} MB`);
  const webgl = await page.evaluate(() => { const gl = window.__map__.getCanvas().getContext('webgl2') || window.__map__.getCanvas().getContext('webgl'); return gl ? !gl.isContextLost() : false; });
  log('WebGL context alive after stress', webgl);
  // measure only after external tiles have finished loading, so tile streaming isn't mistaken for a render loop
  const settled = await waitTiles(45000);
  await sleep(1000);
  const quiet = await page.evaluate(async () => {
    const m = window.__map__; let n = 0; const f = () => n++; m.on('render', f);
    const st = window.__BKK__.state; await new Promise((r) => setTimeout(r, 3000)); m.off('render', f);
    return { renders: n, stateChanged: window.__BKK__.state !== st };
  });
  // renders while tiles are still streaming from the external server can't be attributed to the app → inconclusive
  log('idle app does no work (no render loop, no state churn)', quiet.renders < 10 && !quiet.stateChanged ? true : !settled && !quiet.stateChanged ? null : false, `${quiet.renders} map renders in 3 s idle (tiles settled: ${settled})`);
  log('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (err) {
  log('e2e run aborted', false, String(err?.stack ?? err));
} finally {
  writeFileSync(`${SHOTS}/e2e-results.json`, JSON.stringify(results, null, 2));
  process.on('unhandledRejection', () => {});
  await page.close().catch(() => {});
  await browser.close().catch(() => {});
  server.kill();
  const failed = results.filter((r) => r.ok === false).length;
  const inconclusive = results.filter((r) => r.ok === null).length;
  console.log(`\n${results.length - failed - inconclusive}/${results.length} browser checks passed${inconclusive ? `, ${inconclusive} inconclusive (external tile server still loading)` : ''}${failed ? `, ${failed} FAILED` : ''}`);
  process.exit(failed ? 1 : 0);
}
