# Decision log

| # | Decision | Reason | Trade-off |
|---|---|---|---|
| 1 | One zone, ย.9, user-declared | The brief asks for one zone done properly. No official machine-readable ย.9 boundary is public. | The zone check is UNVERIFIED for every Bangkok plot; it can only prove "outside Bangkok". |
| 2 | Three building-class envelopes, best legal one wins | MR 33 applies to the *whole* building at ≥ 23 m or ≥ 10,000 m² (6 m setbacks at all levels, road eligibility, 30 % plot open space). Low-rise has different setbacks (MR 55 Cl. 50 at 2 or 3 m). Mixing classes per floor is illegal. | About 3× compute; hence the Web Worker. |
| 3 | Distance setbacks via edge capsules | Exact for concave plots. The legal test is distance to the boundary; a half-plane per edge deletes arms of L-shapes. | Reflex corners get rounded notches (legally correct). Arcs are slightly conservative (≤ 0.04 m² on the test L-shape). |
| 4 | Keep the largest piece when setbacks split a plot | One building mass per design keeps the concept clear. | The discarded area is reported, not silently dropped. |
| 5 | Plot edge = road boundary; road widths are user input | OSM has centrelines, not legal reserves. Clause 41 and 44 distances are measured from the road boundary or centreline. | The result is only as good as the entered widths; the UI says so. |
| 6 | Walls with openings on all sides | Condos have windows everywhere; Cl. 50 then applies to every boundary. | Blank party walls (which allow 0.5 m or 0 m) are not explored. |
| 7 | Height = roof deck of top storey | MR 33 Cl. 1 measures to the roof deck. | Parapets and rooftop plant are not modelled. Cl. 44 measures to the highest part, so add about 1–2 m of margin in design. |
| 8 | Design B = footprint ≤ 60 % of A | A clear, deterministic open-space objective that applies to every plot and type. On high-rise sites, B recovers the floor area with height. | On low-rise sites B loses floor area; this is shown, not hidden. |
| 9 | EIA is INFO, not a design driver | An EIA is a permitting step, not a buildability limit. The 4,000 m² usable-area trigger catches nearly every FAR-7 condo anyway. | The unit and usable-area figures are labelled estimates. |
| 10 | UNVERIFIED ≠ PASS | Missing evidence (zone map, Bangkok ordinance, permeable surface, unknown road) must stay visible. | Every design shows 3 UNVERIFIED items until resolved offline. |
| 11 | Engine in a Web Worker | 50–220 ms per evaluation would stutter map interaction on every input. | Results arrive about 1 frame to 300 ms later; a pulse marks recalculation. |
| 12 | SVG overlay for drawing and drag | GeoJSON updates are queued through MapLibre's tiler (measured 450–1,100 ms under load). | A second rendering path for transient feedback only. |
| 13 | `querySourceFeatures` for hiding context buildings | `queryRenderedFeatures` cannot see hidden features, which created an idle render loop. | Source features are per tile; duplicate ids are harmless. |
| 14 | `safeClip` retries | polygon-clipping 0.15 has known failures on near-coincident vertices. | Snaps and perturbations are ≤ 10 µm, far below planning precision. |
| 15 | Same `runFeasibility` in browser, worker and API | One authoritative engine; the API test asserts identical output. | — |
