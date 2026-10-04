// ===== RDZEŃ: generator + ocena (bez DOM) =====
const ROCK = 0, COR = 1, ROOM = 2, DOOR = 3, WIDE = 4, LOOP = 5;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function generate(P, seed) {
  const rng = mulberry32(seed);
  const W = P.W, H = P.H, LW = (W - 1) / 2, LH = (H - 1) / 2;
  const t = new Uint8Array(W * H);
  const rid = new Int16Array(W * H).fill(-1);
  const at = (x, y) => y * W + x;
  const cx = i => 2 * i + 1;
  const ri = n => Math.floor(rng() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const stages = [];
  const snap = name => stages.push({ name, t: t.slice() });
  const inL = (i, j) => i >= 0 && i < LW && j >= 0 && j < LH;
  const carved = (i, j) => inL(i, j) && t[at(cx(i), cx(j))] > 0;
  const isCor = (i, j) => carved(i, j) && rid[at(cx(i), cx(j))] < 0;
  const roomOf = (i, j) => inL(i, j) ? rid[at(cx(i), cx(j))] : -1;
  // przejście z komórki (i,j) w kierunku (dx,dy): otwarta ściana i wykuta komórka po drugiej stronie
  const open = (i, j, dx, dy) => carved(i + dx, j + dy) && t[at(cx(i) + dx, cx(j) + dy)] > 0;
  const deg = (i, j) => DIRS.reduce((n, [dx, dy]) => n + (open(i, j, dx, dy) ? 1 : 0), 0);

  // 1. Pokoje (rozmiary w komórkach logicznych, odstęp min. 1 komórka)
  const sizes = [];
  if (P.s33) sizes.push([3, 3]);
  if (P.s34) sizes.push([3, 4], [4, 3]);
  if (P.s42) sizes.push([4, 2], [2, 4]);
  const rooms = [];
  if (sizes.length) {
    const avg = sizes.reduce((a, [w, h]) => a + w * h, 0) / sizes.length;
    const target = Math.max(1, Math.round(LW * LH * P.density / avg));
    for (let a = 0; a < 600 && rooms.length < target; a++) {
      const [w, h] = sizes[ri(sizes.length)];
      if (w > LW || h > LH) continue;
      const i = ri(LW - w + 1), j = ri(LH - h + 1);
      if (rooms.some(r => i < r.i + r.w + 1 && i + w + 1 > r.i && j < r.j + r.h + 1 && j + h + 1 > r.j)) continue;
      const id = rooms.length;
      rooms.push({ i, j, w, h });
      for (let y = cx(j); y <= 2 * (j + h) - 1; y++) for (let x = cx(i); x <= 2 * (i + w) - 1; x++) { t[at(x, y)] = ROOM; rid[at(x, y)] = id; }
    }
  }
  snap('Pokoje');

  // 2. Recursive Backtracker w wolnych komórkach (może powstać kilka regionów)
  const reg = new Int32Array(LW * LH).fill(-1);
  rooms.forEach((r, id) => { for (let j = r.j; j < r.j + r.h; j++) for (let i = r.i; i < r.i + r.w; i++) reg[j * LW + i] = id; });
  let nReg = rooms.length;
  for (const s of shuffle([...Array(LW * LH).keys()])) {
    const si = s % LW, sj = (s / LW) | 0;
    if (carved(si, sj)) continue;
    const r = nReg++;
    t[at(cx(si), cx(sj))] = COR; reg[s] = r;
    const st = [[si, sj]];
    while (st.length) {
      const [i, j] = st[st.length - 1];
      const ns = DIRS.filter(([dx, dy]) => inL(i + dx, j + dy) && !carved(i + dx, j + dy));
      if (!ns.length) { st.pop(); continue; }
      const [dx, dy] = ns[ri(ns.length)];
      t[at(cx(i) + dx, cx(j) + dy)] = COR; t[at(cx(i + dx), cx(j + dy))] = COR;
      reg[(j + dy) * LW + i + dx] = r; st.push([i + dx, j + dy]);
    }
  }
  snap('Labirynt DFS');

  // 3. Drzwi: drzewo rozpinające regionów (Kruskal) + losowe dodatkowe drzwi
  const parent = [...Array(nReg).keys()];
  const find = x => { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
  const doorsOf = r => { let n = 0; for (let k = 0; k < t.length; k++) if (t[k] === DOOR && touchesRoom(k % W, (k / W) | 0) === r) n++; return n; };
  function touchesRoom(x, y) { for (const [dx, dy] of DIRS) { const k = at(x + dx, y + dy); if (rid[k] >= 0) return rid[k]; } return -1; }
  const nearDoor = (x, y) => { for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H && t[at(xx, yy)] === DOOR) return true; return false; };
  const conns = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (!((x + y) & 1) || t[at(x, y)] !== ROCK) continue;
    const [ax, ay, bx, by] = x % 2 === 0 ? [x - 1, y, x + 1, y] : [x, y - 1, x, y + 1];
    if (!t[at(ax, ay)] || !t[at(bx, by)]) continue;
    const ra = reg[((ay - 1) / 2) * LW + (ax - 1) / 2], rb = reg[((by - 1) / 2) * LW + (bx - 1) / 2];
    if (ra !== rb) conns.push([x, y, ra, rb, Math.max(rid[at(ax, ay)], rid[at(bx, by)])]);
  }
  for (const [x, y, ra, rb, room] of shuffle(conns)) {
    if (find(ra) !== find(rb)) { parent[find(ra)] = find(rb); t[at(x, y)] = room >= 0 ? DOOR : COR; }
    else if (room >= 0 && rng() < P.extraDoor && !nearDoor(x, y) && doorsOf(room) < 3) t[at(x, y)] = DOOR;
  }
  snap('Drzwi');

  // 4. Przerzedzenie: zjadanie ślepych zaułków → powstaje lita skała
  let K = 0;
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) if (isCor(i, j)) K++;
  K = Math.round(K * P.sparse);
  while (K > 0) {
    const dead = [];
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) if (isCor(i, j) && deg(i, j) <= 1) dead.push([i, j]);
    if (!dead.length) break;
    for (const [i, j] of shuffle(dead)) {
      if (K <= 0) break;
      if (deg(i, j) > 1) continue;
      for (const [dx, dy] of DIRS) if (open(i, j, dx, dy)) t[at(cx(i) + dx, cx(j) + dy)] = ROCK;
      t[at(cx(i), cx(j))] = ROCK; K--;
    }
  }
  snap('Przerzedzenie');

  // 5. Usuwanie części ślepych zaułków (przebicie do sąsiada, najchętniej innego zaułka)
  const deads = [];
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) if (isCor(i, j) && deg(i, j) === 1) deads.push([i, j]);
  for (const [i, j] of shuffle(deads)) {
    if (deg(i, j) !== 1 || rng() >= P.braid) continue;
    const opts = DIRS.filter(([dx, dy]) => carved(i + dx, j + dy) && t[at(cx(i) + dx, cx(j) + dy)] === ROCK)
      .map(([dx, dy]) => ({ dx, dy, room: roomOf(i + dx, j + dy), dead: isCor(i + dx, j + dy) && deg(i + dx, j + dy) === 1 }))
      .filter(o => o.room < 0 || (!nearDoor(cx(i) + o.dx, cx(j) + o.dy) && doorsOf(o.room) < 4));
    if (!opts.length) continue;
    const pool = opts.filter(o => o.dead).length ? opts.filter(o => o.dead) : opts.filter(o => o.room < 0).length ? opts.filter(o => o.room < 0) : opts;
    const o = pool[ri(pool.length)];
    t[at(cx(i) + o.dx, cx(j) + o.dy)] = o.room >= 0 ? DOOR : LOOP;
  }
  snap('Zaułki');

  // 6. Pętle między korytarzami (bez ciasnych pętli 2×2)
  const tight = (i, j, dx, dy) => [[dy, dx], [-dy, -dx]].some(([px, py]) =>
    open(i, j, px, py) && open(i + dx, j + dy, px, py) && open(i + px, j + py, dx, dy));
  const lw = [];
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) for (const [dx, dy] of [[1, 0], [0, 1]])
    if (isCor(i, j) && isCor(i + dx, j + dy) && t[at(cx(i) + dx, cx(j) + dy)] === ROCK) lw.push([i, j, dx, dy]);
  let nl = Math.round(lw.length * P.loops);
  for (const [i, j, dx, dy] of shuffle(lw)) {
    if (nl <= 0) break;
    if (tight(i, j, dx, dy)) continue;
    t[at(cx(i) + dx, cx(j) + dy)] = LOOP; nl--;
  }
  snap('Pętle');

  // 7. Poszerzenia: prosty odcinek 2–4 komórek dostaje drugi pas od strony litej skały
  const wc = [];
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) for (const [dx, dy] of [[1, 0], [0, 1]]) for (let L = 2; L <= 4; L++) {
    let ok = true;
    for (let k = 0; k < L && ok; k++) ok = isCor(i + k * dx, j + k * dy) && (k === 0 || open(i + (k - 1) * dx, j + (k - 1) * dy, dx, dy));
    if (ok) for (const s of [1, -1]) wc.push([i, j, dx, dy, L, s]);
  }
  let nw = 0;
  for (const [i, j, dx, dy, L, s] of shuffle(wc)) {
    if (nw >= P.wide) break;
    const px = dy * s, py = dx * s;
    const x0 = cx(i), y0 = cx(j), x1 = cx(i + (L - 1) * dx), y1 = cx(j + (L - 1) * dy);
    let ok = true;
    for (let off = 1; off <= 2 && ok; off++) for (let k = -1; k <= (x1 - x0) + (y1 - y0) + 1 && ok; k++) {
      const x = x0 + k * dx + px * off, y = y0 + k * dy + py * off;
      ok = x >= 0 && y >= 0 && x < W && y < H && t[at(x, y)] === ROCK;
    }
    if (!ok) continue;
    for (let k = 0; k <= (x1 - x0) + (y1 - y0); k++) t[at(x0 + k * dx + px, y0 + k * dy + py)] = WIDE;
    nw++;
  }
  snap('Poszerzenia');

  return { W, H, LW, LH, t, rid, rooms, stages, seed };
}

// ===== OCENA =====
const band = (v, lo, hi, soft) => v >= lo && v <= hi ? 1 : Math.max(0, 1 - (v < lo ? lo - v : v - hi) / soft);

// odcisk przestrzenny: siatka 6×6 sektorów, w każdym udział pokoi i udział pól chodliwych
const SIG = 6;
function signature(G) {
  const sig = [];
  for (let sy = 0; sy < SIG; sy++) for (let sx = 0; sx < SIG; sx++) {
    const xa = Math.floor(sx * G.W / SIG), xb = Math.floor((sx + 1) * G.W / SIG), ya = Math.floor(sy * G.H / SIG), yb = Math.floor((sy + 1) * G.H / SIG);
    let room = 0, walk = 0, n = 0;
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { const v = G.t[y * G.W + x]; n++; if (v === ROOM) room++; if (v) walk++; }
    sig.push(room / n, walk / n);
  }
  return sig;
}
// podobieństwo 0..1 z uwzględnieniem odbić lustrzanych; przeskalowane tak, że dwa losowe układy dają ok. 0.1–0.35, a prawie-duplikat ~1
function similarity(a, b) {
  let best = 0;
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    let d = 0;
    for (let y = 0; y < SIG; y++) for (let x = 0; x < SIG; x++) {
      const i = 2 * (y * SIG + x), j = 2 * ((fy ? SIG - 1 - y : y) * SIG + (fx ? SIG - 1 - x : x));
      d += Math.abs(a[i] - b[j]) * 1.5 + Math.abs(a[i + 1] - b[j + 1]);
    }
    best = Math.max(best, 1 - d / (SIG * SIG) / 1.2);
  }
  return Math.max(0, Math.min(1, (best - 0.6) / 0.4));
}

function evaluate(G, P, history) {
  const { W, H, LW, LH, t, rid, rooms } = G;
  const at = (x, y) => y * W + x, cx = i => 2 * i + 1, R = rooms.length;
  // spójność na poziomie kafli
  const bfs = (sx, sy) => {
    const d = new Int32Array(W * H).fill(-1), par = new Int32Array(W * H).fill(-1), q = [at(sx, sy)];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of DIRS) { const n = at(x + dx, y + dy); if (t[n] && d[n] < 0) { d[n] = d[k] + 1; par[n] = k; q.push(n); } }
    }
    return { d, par, n: q.length };
  };
  let walk = 0, first = -1;
  for (let k = 0; k < t.length; k++) if (t[k]) { walk++; if (first < 0) first = k; }
  const connected = walk > 0 && bfs(first % W, (first / W) | 0).n === walk;

  // graf abstrakcyjny: pokój = 1 węzeł, komórka korytarza = 1 węzeł
  const node = new Int32Array(LW * LH).fill(-1), corCells = [];
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) {
    const k = at(cx(i), cx(j));
    if (!t[k]) continue;
    if (rid[k] >= 0) node[j * LW + i] = rid[k]; else { node[j * LW + i] = R + corCells.length; corCells.push([i, j]); }
  }
  const V = R + corCells.length, adj = Array.from({ length: V }, () => []), edges = [];
  for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
    if (i + dx >= LW || j + dy >= LH) continue;
    const a = node[j * LW + i], b = node[(j + dy) * LW + i + dx];
    if (a < 0 || b < 0 || a === b || !t[at(cx(i) + dx, cx(j) + dy)]) continue;
    adj[a].push(b); adj[b].push(a); edges.push([a, b, cx(i) + dx, cx(j) + dy]);
  }
  const E = edges.length, degN = adj.map(a => a.length);
  const cycles = connected ? E - V + 1 : 0;
  const deadList = corCells.filter((_, k) => degN[R + k] === 1);
  const junctions = corCells.filter((_, k) => degN[R + k] >= 3).length;
  // kształty komórek korytarza
  const shapes = [0, 0, 0, 0, 0];
  corCells.forEach(([i, j], k) => {
    const d = degN[R + k];
    if (d <= 1) shapes[0]++;
    else if (d === 2) { const h = t[at(cx(i) - 1, cx(j))] && t[at(cx(i) + 1, cx(j))], v = t[at(cx(i), cx(j) - 1)] && t[at(cx(i), cx(j) + 1)]; shapes[h || v ? 1 : 2]++; }
    else shapes[d === 3 ? 3 : 4]++;
  });
  const nc = Math.max(1, corCells.length);
  const entropy = -shapes.reduce((s, c) => c ? s + c / nc * Math.log2(c / nc) : s, 0) / Math.log2(5);
  // mosty (Tarjan) + liczba pokoi w poddrzewie DFS
  const disc = new Int32Array(V).fill(-1), low = new Int32Array(V), sub = new Int32Array(V);
  let timer = 0; const bridges = [];
  const dfs = (u, p) => {
    disc[u] = low[u] = timer++; sub[u] = u < R ? 1 : 0;
    let skipped = false;
    for (const v of adj[u]) {
      if (v === p && !skipped) { skipped = true; continue; }
      if (disc[v] < 0) {
        dfs(v, u); sub[u] += sub[v]; low[u] = Math.min(low[u], low[v]);
        if (low[v] > disc[u]) bridges.push([u, v, sub[v]]);
      } else low[u] = Math.min(low[u], disc[v]);
    }
  };
  for (let u = 0; u < V; u++) if (disc[u] < 0) dfs(u, -1);
  const key = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  const bset = new Set(bridges.map(([a, b]) => key(a, b)));
  // wąskie gardło = most, po którego obu stronach są pokoje
  const gate = new Set(bridges.filter(([, , k]) => k > 0 && k < R).map(([a, b]) => key(a, b)));
  const chokes = edges.filter(([a, b]) => gate.has(key(a, b)));
  // obszary 2-spójne krawędziowo (bez mostów): największy z nich to „rdzeń z pętlami”
  const comp = new Int32Array(V).fill(-1); let core = 0;
  for (let s0 = 0; s0 < V; s0++) {
    if (comp[s0] >= 0) continue;
    comp[s0] = s0; const q = [s0]; let rc = 0;
    for (let h = 0; h < q.length; h++) { const u = q[h]; if (u < R) rc++;
      for (const v of adj[u]) if (comp[v] < 0 && !bset.has(key(u, v))) { comp[v] = s0; q.push(v); } }
    core = Math.max(core, rc);
  }
  const coreFrac = R ? core / R : 0;
  // trasy między pokojami
  const centers = rooms.map(r => [Math.round((cx(r.i) + 2 * (r.i + r.w) - 1) / 2) | 1, Math.round((cx(r.j) + 2 * (r.j + r.h) - 1) / 2) | 1]);
  let tSum = 0, tN = 0, far = { d: -1 };
  centers.forEach(([x, y], a) => {
    const B = bfs(x, y);
    centers.forEach(([x2, y2], b) => {
      if (b <= a) return;
      const d = B.d[at(x2, y2)]; if (d < 0) return;
      tSum += d / (Math.abs(x - x2) + Math.abs(y - y2)); tN++;
      if (d > far.d) { const path = []; for (let k = at(x2, y2); k >= 0; k = B.par[k]) path.push(k); far = { d, path }; }
    });
  });
  const tort = tN ? tSum / tN : 0;
  // najdłuższy prosty odcinek korytarza
  let straight = { len: 0 };
  const scan = (outer, inner, get) => {
    for (let o = 0; o < outer; o++) { let run = 0;
      for (let k = 0; k <= inner; k++) {
        const v = k < inner ? get(o, k) : 0;
        if (v && rid[v - 1] < 0) run++;
        else { if (run > straight.len) straight = { len: run, a: get(o, k - run) - 1, b: get(o, k - 1) - 1 }; run = 0; }
      }
    }
  };
  scan(H, W, (y, x) => t[at(x, y)] ? at(x, y) + 1 : 0);
  scan(W, H, (x, y) => t[at(x, y)] ? at(x, y) + 1 : 0);
  // rozkład pokoi w sektorach 3×3
  const sect = new Set(centers.map(([x, y]) => Math.min(2, Math.floor(x * 3 / W)) + 3 * Math.min(2, Math.floor(y * 3 / H))));
  const coverage = R ? sect.size / Math.min(9, R) : 0;
  // drzwi na pokój
  const doors = new Array(R).fill(0);
  for (let k = 0; k < t.length; k++) if (t[k] === DOOR) { const x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of DIRS) { const r = rid[at(x + dx, y + dy)]; if (r >= 0) { doors[r]++; break; } } }
  const doorAvg = R ? doors.reduce((a, b) => a + b, 0) / R : 0;
  const oneDoor = doors.filter(d => d === 1).length;
  const types = new Set(rooms.map(r => Math.min(r.w, r.h) + 'x' + Math.max(r.w, r.h)));
  const enabled = (P.s33 ? 1 : 0) + (P.s34 ? 1 : 0) + (P.s42 ? 1 : 0);
  let wideTiles = 0; for (let k = 0; k < t.length; k++) if (t[k] === WIDE) wideTiles++;

  const sig = signature(G);
  let maxSim = 0, simTo = null;
  for (const h of history || []) { const s = similarity(sig, h.sig); if (s > maxSim) { maxSim = s; simTo = h.seed; } }

  const M = [
    { key: 'loops', name: 'Pętle na pokój', v: cycles / Math.max(1, R), lo: 0.5, hi: 1.5, soft: 0.8, w: 1.2, f: 2, hint: 'Alternatywne drogi: gracz może obejść przeciwnika i nie wraca tą samą trasą.' },
    { key: 'dead', name: 'Ślepe zaułki na pokój', v: deadList.length / Math.max(1, R), lo: 0.2, hi: 1.0, soft: 1, w: 1, f: 2, hint: 'Kilka nagradza eksplorację (skrzynka, sekret); za dużo męczy cofaniem.' },
    { key: 'lin', name: 'Pokoje w pętlach', v: coreFrac, lo: 0.5, hi: 0.85, soft: 0.35, w: 1, f: 0, pct: true, hint: `Udział pokoi w największym obszarze z alternatywnymi drogami. Pozostałe ${R - core} leżą za wąskim gardłem (pomarańczowe): dobre miejsce na klucz, bossa lub skarb. Gdy jest ich za dużo, układ robi się liniowy.` },
    { key: 'tort', name: 'Krętość tras', v: tort, lo: 1.3, hi: 2.2, soft: 0.6, w: 1.2, f: 2, hint: 'Długość drogi między pokojami ÷ odległość w linii prostej. 1 = nudno prosto, >2.5 = frustrujący labirynt.' },
    { key: 'str', name: 'Najdłuższa prosta', v: straight.len / Math.max(W, H), lo: 0, hi: 0.35, soft: 0.3, w: 1, f: 0, pct: true, hint: 'Długi prosty korytarz to martwy czas i otwarta linia strzału.' },
    { key: 'junc', name: 'Skrzyżowania', v: junctions / nc, lo: 0.12, hi: 0.32, soft: 0.15, w: 0.8, f: 0, pct: true, hint: 'Udział komórek korytarza z 3–4 wyjściami: punkty decyzji gracza.' },
    { key: 'cov', name: 'Rozłożenie pokoi', v: coverage, lo: 0.75, hi: 1, soft: 0.45, w: 1, f: 0, pct: true, hint: 'Ile sektorów mapy 3×3 ma pokój. Skupione pokoje zostawiają puste połacie korytarzy.' },
    { key: 'door', name: 'Drzwi na pokój', v: doorAvg, lo: 1.5, hi: 2.6, soft: 1, w: 1, f: 2, hint: `Pokój z 1 drzwiami to ślepa kieszeń; jest ich ${oneDoor} z ${R}.` },
    { key: 'var', name: 'Różnorodność pokoi', v: enabled ? types.size / enabled : 0, lo: 1, hi: 1, soft: 0.7, w: 0.6, f: 0, pct: true, hint: `Użyte typy: ${[...types].join(', ') || 'brak'}.` },
    { key: 'ent', name: 'Różnorodność kształtów', v: entropy, lo: 0.65, hi: 1, soft: 0.35, w: 0.8, f: 0, pct: true, hint: 'Entropia typów komórek (prosta, zakręt, T, krzyż, zaułek). Niska = monotonne powtórzenia.' },
    { key: 'uniq', name: 'Unikalność', v: 1 - maxSim, lo: 0.45, hi: 1, soft: 0.35, w: 1.2, f: 0, pct: true, hint: history && history.length ? `Najbardziej podobny do zaakceptowanego #${simTo} (${Math.round(maxSim * 100)}%, z odbiciami lustrzanymi).` : 'Brak historii, więc nie ma z czym porównać.' },
  ];
  let sw = 0, ss = 0;
  for (const m of M) { m.s = band(m.v, m.lo, m.hi, m.soft); sw += m.w; ss += m.s * m.w; }
  const score = connected ? Math.round(ss / sw * 100) : 0;
  return { connected, score, M, maxSim, simTo, sig, seed: G.seed, cycles, V, E, wideTiles,
    deadList, chokes, straight, far, rooms: R, doors };
}
if (typeof module !== 'undefined') module.exports = { generate, evaluate, similarity, ROCK, COR, ROOM, DOOR, WIDE, LOOP };
