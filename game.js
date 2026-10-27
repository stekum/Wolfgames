'use strict';

(() => {
  // ---------------------------------------------------------------------------
  // Konstanten & Daten
  // ---------------------------------------------------------------------------
  const VIEW_H = 450;          // logische Höhe der Spielfläche
  const GROUND = 390;          // y-Koordinate des Bodens
  const FEET = 56;             // Abstand Körpermitte -> Hufe (Pferd, Skala 1)
  const HORSE_X = 170;         // x-Position des Pferdes beim Ausritt
  const GRAVITY = 2800;
  const JUMP_V = 980;
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'wolfstal-reiterhof-v1';

  const COATS = [
    { id: 'fuchs', name: 'Fuchs', body: '#b4632c', dark: '#8a481e', mane: '#6e3412', price: 0 },
    { id: 'rappe', name: 'Rappe', body: '#3a332e', dark: '#221d1a', mane: '#110e0c', price: 60 },
    { id: 'schimmel', name: 'Schimmel', body: '#ebe7e0', dark: '#c9c3b8', mane: '#faf8f3', price: 90 },
    { id: 'palomino', name: 'Palomino', body: '#d9a75a', dark: '#b4853d', mane: '#f6ecd2', price: 120 },
    { id: 'schecke', name: 'Schecke', body: '#7b4a2c', dark: '#5e3720', mane: '#f2efe9', price: 160, spots: '#f4f1ea' },
    { id: 'sternenstaub', name: 'Sternenstaub', body: '#9b86d8', dark: '#7461b4', mane: '#f3cdff', price: 300, magic: true },
  ];

  const PADS = [
    { id: 'rot', name: 'Rot', color: '#c8313c', price: 0 },
    { id: 'blau', name: 'Blau', color: '#2f6fd0', price: 25 },
    { id: 'tuerkis', name: 'Türkis', color: '#1fb3a6', price: 25 },
    { id: 'lila', name: 'Lila', color: '#8a49c9', price: 25 },
    { id: 'gold', name: 'Gold', color: '#e2b33a', price: 80 },
  ];

  const STATS = [
    { key: 'satt', label: 'Futter', color: '#e09b2d' },
    { key: 'pflege', label: 'Pflege', color: '#3ba4d9' },
    { key: 'energie', label: 'Energie', color: '#5bb85b' },
    { key: 'bindung', label: 'Bindung', color: '#d94f7a' },
  ];

  const DEFAULT_STATE = {
    coins: 30,
    apples: 3,
    best: 0,
    rides: 0,
    muted: false,
    seenIntro: false,
    ownedCoats: ['fuchs'],
    ownedPads: ['rot'],
    horse: { name: 'Sternchen', coat: 'fuchs', pad: 'rot', satt: 70, pflege: 60, energie: 100, bindung: 10 },
  };

  const coatById = id => COATS.find(c => c.id === id) || COATS[0];
  const padById = id => PADS.find(p => p.id === id) || PADS[0];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------------------------------------------------------------------------
  // Spielstand
  // ---------------------------------------------------------------------------
  function loadState() {
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fresh;
      const saved = JSON.parse(raw);
      return { ...fresh, ...saved, horse: { ...fresh.horse, ...(saved.horse || {}) } };
    } catch {
      return fresh;
    }
  }

  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* Speicher nicht verfügbar */ }
  }

  const state = loadState();

  // ---------------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const ui = {
    coins: $('coins'), apples: $('apples'), mute: $('muteBtn'),
    hud: $('hud'), hudHearts: $('hudHearts'), hudDist: $('hudDist'), hudCoins: $('hudCoins'), pause: $('pauseBtn'),
    toast: $('toast'), overlay: $('overlay'), dialog: $('dialog'),
    stablePanel: $('stablePanel'), shopPanel: $('shopPanel'), ridePanel: $('ridePanel'),
    horseName: $('horseName'), stats: $('stats'), record: $('record'),
    rideBtn: $('rideBtn'), shopBtn: $('shopBtn'), shopBack: $('shopBackBtn'),
    coatGrid: $('coatGrid'), padGrid: $('padGrid'), jump: $('jumpBtn'),
  };

  let viewW = 800;
  let mode = 'stable';         // 'stable' | 'shop' | 'ride'
  let time = 0;
  let ride = null;
  let particles = [];
  let toastTimer = 0;

  // ---------------------------------------------------------------------------
  // Sound (WebAudio, ohne Dateien)
  // ---------------------------------------------------------------------------
  let audio = null;
  function tone(freq, endFreq, dur, type = 'sine', vol = 0.15, delay = 0) {
    const t0 = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function sfx(name) {
    if (state.muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      switch (name) {
        case 'jump': tone(260, 520, 0.15, 'triangle', 0.12); break;
        case 'coin': tone(880, 1320, 0.1, 'sine', 0.12); break;
        case 'apple': tone(520, 780, 0.14, 'triangle', 0.14); break;
        case 'star': [660, 880, 1100, 1320].forEach((f, i) => tone(f, f * 1.01, 0.12, 'sine', 0.1, i * 0.07)); break;
        case 'hit': tone(180, 60, 0.3, 'sawtooth', 0.12); break;
        case 'care': tone(700, 1000, 0.18, 'sine', 0.1); break;
        case 'buy': [523, 659, 784].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.1, i * 0.08)); break;
        case 'end': [523, 440, 392].forEach((f, i) => tone(f, f * 0.98, 0.18, 'triangle', 0.1, i * 0.12)); break;
      }
    } catch { /* kein Audio verfügbar */ }
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.remove('hidden');
    toastTimer = 2.4;
  }

  function renderWallet() {
    ui.coins.textContent = `🪙 ${state.coins}`;
    ui.apples.textContent = `🍎 ${state.apples}`;
    ui.mute.textContent = state.muted ? '🔇' : '🔊';
  }

  function renderStats() {
    const h = state.horse;
    ui.stats.innerHTML = STATS.map(s => `
      <div class="stat">
        <label><span>${s.label}</span><span>${Math.round(h[s.key])}%</span></label>
        <div class="bar"><div style="width:${h[s.key]}%;background:${s.color}"></div></div>
      </div>`).join('');
    ui.record.textContent = state.rides
      ? `Ausritte: ${state.rides} · Weitester Ritt: ${state.best} m`
      : 'Tipp: Ein gepflegtes, sattes Pferd bringt beim Ausritt mehr Münzen.';
  }

  function renderShop() {
    const item = (it, owned, equipped, swatch) => `
      <button class="shop-item${equipped ? ' equipped' : ''}" data-id="${it.id}">
        <span class="swatch" style="background:${swatch}"></span>
        <span>${it.name}</span>
        <small>${equipped ? 'Ausgewählt' : owned ? 'Auswählen' : `${it.price} 🪙`}</small>
      </button>`;
    ui.coatGrid.innerHTML = COATS.map(c => item(c, state.ownedCoats.includes(c.id), state.horse.coat === c.id,
      c.spots ? `radial-gradient(circle at 35% 40%, ${c.spots} 30%, ${c.body} 32%)`
        : c.magic ? `linear-gradient(135deg, ${c.body}, ${c.mane})` : c.body)).join('');
    ui.padGrid.innerHTML = PADS.map(p => item(p, state.ownedPads.includes(p.id), state.horse.pad === p.id, p.color)).join('');
  }

  function renderAll() {
    renderWallet();
    renderStats();
    if (mode === 'shop') renderShop();
  }

  function setMode(next) {
    mode = next;
    ui.stablePanel.classList.toggle('hidden', next !== 'stable');
    ui.shopPanel.classList.toggle('hidden', next !== 'shop');
    ui.ridePanel.classList.toggle('hidden', next !== 'ride');
    ui.hud.classList.toggle('hidden', next !== 'ride');
    particles = [];
    renderAll();
  }

  function showDialog(html) {
    ui.dialog.innerHTML = html;
    ui.overlay.classList.remove('hidden');
  }

  function hideDialog() {
    ui.overlay.classList.add('hidden');
  }

  // ---------------------------------------------------------------------------
  // Stall-Aktionen
  // ---------------------------------------------------------------------------
  function stableHorsePos() {
    return { x: viewW * 0.47, y: GROUND - FEET * 1.5, s: 1.5 };
  }

  function burst(kind, count) {
    const p = stableHorsePos();
    for (let i = 0; i < count; i++) {
      particles.push({
        kind, x: p.x + rand(-60, 90), y: p.y + rand(-90, 10),
        vx: rand(-20, 20), vy: rand(-60, -25), life: rand(1, 1.6), age: 0,
      });
    }
  }

  function care(action) {
    const h = state.horse;
    switch (action) {
      case 'apple':
        if (state.apples <= 0) return toast('Keine Äpfel mehr – sammle welche beim Ausritt!');
        if (h.satt >= 100) return toast(`${h.name} ist schon satt.`);
        state.apples--;
        h.satt = clamp(h.satt + 12, 0, 100);
        h.bindung = clamp(h.bindung + 3, 0, 100);
        burst('heart', 6);
        break;
      case 'hay':
        if (h.satt >= 100) return toast(`${h.name} ist schon satt.`);
        if (state.coins < 5) return toast('Du brauchst 5 Münzen für Heu.');
        state.coins -= 5;
        h.satt = clamp(h.satt + 35, 0, 100);
        burst('hay', 8);
        break;
      case 'brush':
        if (h.pflege >= 100) return toast(`${h.name} glänzt schon wie neu!`);
        h.pflege = clamp(h.pflege + 25, 0, 100);
        h.bindung = clamp(h.bindung + 1, 0, 100);
        burst('sparkle', 12);
        break;
      case 'rest':
        if (h.energie >= 100) return toast(`${h.name} ist topfit und will raus!`);
        if (h.satt < 10) return toast(`${h.name} hat zu viel Hunger zum Schlafen – erst füttern.`);
        h.energie = clamp(h.energie + 40, 0, 100);
        h.satt = clamp(h.satt - 10, 0, 100);
        burst('zzz', 4);
        break;
    }
    sfx('care');
    saveState();
    renderAll();
  }

  function buy(kind, id) {
    const list = kind === 'coat' ? COATS : PADS;
    const owned = kind === 'coat' ? state.ownedCoats : state.ownedPads;
    const item = list.find(i => i.id === id);
    if (!item) return;
    if (!owned.includes(id)) {
      if (state.coins < item.price) return toast(`Dir fehlen noch ${item.price - state.coins} Münzen.`);
      state.coins -= item.price;
      owned.push(id);
      sfx('buy');
      toast(`${item.name} gekauft!`);
    }
    state.horse[kind === 'coat' ? 'coat' : 'pad'] = id;
    burst('sparkle', 10);
    saveState();
    renderAll();
  }

  // ---------------------------------------------------------------------------
  // Ausritt
  // ---------------------------------------------------------------------------
  function startRide() {
    hideDialog();
    const h = state.horse;
    if (h.energie < 20) { setMode('stable'); return toast(`${h.name} ist zu müde – lass es erst ausruhen.`); }
    if (h.satt < 15) { setMode('stable'); return toast(`${h.name} hat Hunger – füttere es vor dem Ausritt.`); }
    const hearts = h.energie >= 60 ? 3 : h.energie >= 35 ? 2 : 1;
    ride = {
      t: 0, speed: 380, dist: 0, scroll: 0,
      feet: GROUND, vy: 0, onGround: true, held: false, buffer: 0,
      phase: 0, hearts, maxHearts: hearts, inv: 0, shake: 0,
      obstacles: [], items: [], dust: [], untilNext: 500,
      coins: 0, apples: 0, stars: 0, paused: false, over: false,
    };
    setMode('ride');
    updateHud();
  }

  function pressJump() {
    if (!ride || ride.paused || ride.over) return;
    ride.held = true;
    ride.buffer = 0.12;
  }

  function releaseJump() {
    if (!ride) return;
    ride.held = false;
    if (ride.vy < -380) ride.vy = -380; // kurzer Druck = kleiner Sprung
  }

  function spawnChunk() {
    const r = ride;
    const x = viewW + 60;
    const types = [
      { kind: 'fence', w: 44, h: 48 },
      { kind: 'log', w: 66, h: 30 },
      { kind: 'hedge', w: 54, h: 58 },
      { kind: 'water', w: 90, h: 6 },
    ];
    const ob = { ...types[Math.floor(Math.random() * types.length)], x, hit: false };
    r.obstacles.push(ob);

    // Münzbogen über dem Hindernis
    if (Math.random() < 0.6) {
      for (let i = 0; i < 5; i++) {
        const k = i / 4;
        r.items.push({ type: 'coin', x: x + ob.w / 2 + (k - 0.5) * 170, y: GROUND - 60 - Math.sin(k * Math.PI) * 110 });
      }
    }

    // Zwischen den Hindernissen: Äpfel, Münzen oder ein seltener Stern
    const gap = r.speed * 0.72 + 220 + Math.random() * r.speed * 0.9;
    const roll = Math.random();
    const mid = x + ob.w + gap / 2;
    if (roll < 0.04) r.items.push({ type: 'star', x: mid, y: GROUND - 170 });
    else if (roll < 0.34) r.items.push({ type: 'apple', x: mid, y: Math.random() < 0.5 ? GROUND - 40 : GROUND - 150 });
    else if (roll < 0.6) for (let i = 0; i < 3; i++) r.items.push({ type: 'coin', x: mid + (i - 1) * 40, y: GROUND - 40 });
    r.untilNext = gap + ob.w;
  }

  function updateRide(dt) {
    const r = ride;
    if (r.paused || r.over) return;
    r.t += dt;
    r.speed = Math.min(820, 380 + r.t * 9);
    const dx = r.speed * dt;
    r.dist += dx;
    r.scroll += dx;
    r.phase += dt * (8 + r.speed / 90);

    // Springen mit Eingabepuffer
    if (r.buffer > 0) r.buffer -= dt;
    if (r.buffer > 0 && r.onGround) {
      r.vy = -JUMP_V;
      r.onGround = false;
      r.buffer = 0;
      sfx('jump');
    }
    r.vy += GRAVITY * (r.held && r.vy < 0 ? 0.75 : 1) * dt;
    r.feet += r.vy * dt;
    if (r.feet >= GROUND) {
      if (!r.onGround) for (let i = 0; i < 6; i++) r.dust.push({ x: HORSE_X + rand(-40, 40), y: GROUND, vx: rand(-80, -20), vy: rand(-60, -10), life: 0.5, age: 0 });
      r.feet = GROUND;
      r.vy = 0;
      r.onGround = true;
    }
    if (r.onGround && Math.random() < dt * 12) r.dust.push({ x: HORSE_X - 40, y: GROUND, vx: rand(-60, -20), vy: rand(-30, -5), life: 0.4, age: 0 });

    // Spawnen
    r.untilNext -= dx;
    if (r.untilNext <= 0) spawnChunk();

    // Hindernisse
    const hb = { x1: HORSE_X - 36, x2: HORSE_X + 52, y1: r.feet - 52, y2: r.feet - 4 };
    for (const o of r.obstacles) {
      o.x -= dx;
      if (o.hit || r.inv > 0) continue;
      const top = GROUND - o.h;
      if (hb.x2 > o.x + 6 && hb.x1 < o.x + o.w - 6 && hb.y2 > top) {
        o.hit = true;
        r.hearts--;
        r.inv = 1.3;
        r.shake = 0.3;
        sfx('hit');
        if (r.hearts <= 0) { endRide(); return; }
      }
    }
    r.obstacles = r.obstacles.filter(o => o.x + o.w > -50);

    // Sammelobjekte
    const cx = HORSE_X + 10, cy = r.feet - FEET - 10;
    for (const it of r.items) {
      it.x -= dx;
      if (it.taken) continue;
      if (Math.hypot(it.x - cx, it.y - cy) < 58) {
        it.taken = true;
        if (it.type === 'coin') { r.coins++; sfx('coin'); }
        if (it.type === 'apple') { r.apples++; sfx('apple'); }
        if (it.type === 'star') { r.stars++; r.coins += 10; sfx('star'); }
      }
    }
    r.items = r.items.filter(it => it.x > -40 && !it.taken);

    for (const d of r.dust) { d.age += dt; d.x += (d.vx - r.speed * 0.3) * dt; d.y += d.vy * dt; }
    r.dust = r.dust.filter(d => d.age < d.life);

    r.inv = Math.max(0, r.inv - dt);
    r.shake = Math.max(0, r.shake - dt);
    updateHud();
  }

  function updateHud() {
    const r = ride;
    ui.hudHearts.textContent = '❤️'.repeat(r.hearts) + '🤍'.repeat(r.maxHearts - r.hearts);
    ui.hudDist.textContent = `${Math.floor(r.dist / 50)} m`;
    ui.hudCoins.textContent = `🪙 ${r.coins}  🍎 ${r.apples}`;
  }

  function endRide() {
    const r = ride;
    r.over = true;
    sfx('end');
    const h = state.horse;
    const meters = Math.floor(r.dist / 50);
    const glanz = h.pflege >= 70;
    const bondPct = Math.round(h.bindung / 2);
    const mult = (1 + bondPct / 100) * (glanz ? 1.2 : 1);
    const distBonus = Math.floor(meters / 50);
    const earned = Math.round(r.coins * mult) + distBonus;
    const record = meters > state.best;

    state.coins += earned;
    state.apples += r.apples;
    state.best = Math.max(state.best, meters);
    state.rides++;
    h.energie = clamp(h.energie - 25, 0, 100);
    h.satt = clamp(h.satt - 15, 0, 100);
    h.pflege = clamp(h.pflege - 15, 0, 100);
    h.bindung = clamp(h.bindung + 4, 0, 100);
    saveState();
    renderWallet();

    const row = (a, b) => `<div class="result-row"><span>${a}</span><strong>${b}</strong></div>`;
    showDialog(`
      <h2>${record ? '🏆 Neuer Rekord!' : 'Ausritt beendet'}</h2>
      <p>${h.name} ist ${meters} m durch das Wolfstal galoppiert.</p>
      ${row('Gesammelte Münzen', r.coins)}
      ${row('Bindungsbonus', `+${bondPct}%`)}
      ${glanz ? row('Glanz-Bonus (gut gepflegt)', '+20%') : ''}
      ${row('Streckenbonus', distBonus)}
      ${row('Verdient', `🪙 ${earned}`)}
      ${row('Äpfel', `🍎 ${r.apples}`)}
      ${r.stars ? row('Sterne', `⭐ ${r.stars}`) : ''}
      <div class="main-actions">
        <button id="againBtn" class="primary">🏇 Nochmal</button>
        <button id="homeBtn">🏠 Zum Stall</button>
      </div>`);
    $('againBtn').onclick = startRide;
    $('homeBtn').onclick = goStable;
  }

  function goStable() {
    hideDialog();
    ride = null;
    setMode('stable');
  }

  function togglePause() {
    if (!ride || ride.over) return;
    ride.paused = !ride.paused;
    if (ride.paused) {
      showDialog(`
        <h2>Pause</h2>
        <p>${state.horse.name} wartet geduldig.</p>
        <div class="main-actions">
          <button id="resumeBtn" class="primary">▶ Weiter</button>
          <button id="quitBtn">🏁 Ausritt beenden</button>
        </div>`);
      $('resumeBtn').onclick = togglePause;
      $('quitBtn').onclick = () => { hideDialog(); ride.paused = false; endRide(); };
    } else {
      hideDialog();
    }
  }

  // ---------------------------------------------------------------------------
  // Zeichnen: Pferd
  // ---------------------------------------------------------------------------
  function drawLeg(c, hx, a1, a2, color, hoof) {
    const L1 = 25, L2 = 24;
    const kx = hx + Math.sin(a1) * L1, ky = 8 + Math.cos(a1) * L1;
    const fx = kx + Math.sin(a2) * L2, fy = ky + Math.cos(a2) * L2;
    c.strokeStyle = color;
    c.lineCap = 'round';
    c.lineWidth = 10;
    c.beginPath(); c.moveTo(hx, 4); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = 7;
    c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = hoof;
    c.beginPath(); c.ellipse(fx, fy, 5, 3.5, 0, 0, TAU); c.fill();
  }

  function legAngles(pose, phase, off, front) {
    if (pose === 'jump') return front ? [1.0, -0.8] : [-0.9, -1.1];
    if (pose === 'stand') return [front ? 0.05 : -0.05, 0];
    const p = phase + off;
    const a1 = Math.sin(p) * 0.6;
    const bend = Math.max(0, Math.sin(p + 1.3)) * 1.2;
    return [a1, front ? a1 - bend : a1 + bend * 0.5];
  }

  function drawHorse(c, x, y, s, o) {
    const coat = coatById(o.coat);
    const pad = padById(o.pad);
    const pose = o.pose || 'stand';
    const p = o.phase || 0;
    const gallop = pose === 'gallop';
    const wave = Math.sin(time * (gallop ? 14 : 2.2));
    const hoof = '#2b231d';

    c.save();
    c.translate(x, y);
    c.scale(s, s);
    if (pose === 'jump') c.rotate(-0.12);
    if (gallop) c.translate(0, Math.sin(p * 2) * 2.5);

    // Schatten
    if (o.shadow !== false) {
      c.save();
      c.fillStyle = 'rgba(0,0,0,.18)';
      c.beginPath(); c.ellipse(4, FEET + (o.shadowDy || 0), 52, 7, 0, 0, TAU); c.fill();
      c.restore();
    }

    // Schweif
    c.strokeStyle = coat.mane;
    c.lineCap = 'round';
    c.lineWidth = 11;
    c.beginPath();
    c.moveTo(-42, -12);
    if (gallop || pose === 'jump') c.quadraticCurveTo(-72, -16 + wave * 4, -88, 0 + wave * 6);
    else c.quadraticCurveTo(-62, -4, -58 + wave * 4, 36);
    c.stroke();

    // Beine hinten (entfernte Seite, dunkler)
    const [bf1, bf2] = legAngles(pose, p, 0, false);
    const [ff1, ff2] = legAngles(pose, p, 0.55 * TAU, true);
    drawLeg(c, -30, bf1, bf2, coat.dark, hoof);
    drawLeg(c, 30, ff1, ff2, coat.dark, hoof);

    // Körper
    const grad = c.createLinearGradient(0, -24, 0, 24);
    grad.addColorStop(0, coat.body);
    grad.addColorStop(1, coat.dark);
    c.fillStyle = grad;
    c.beginPath(); c.ellipse(0, 0, 47, 23, 0, 0, TAU); c.fill();

    // Hals
    c.beginPath();
    c.moveTo(20, -16);
    c.quadraticCurveTo(36, -40, 44, -58);
    c.lineTo(60, -52);
    c.quadraticCurveTo(54, -24, 44, 8);
    c.closePath();
    c.fill();

    // Scheckenflecken
    if (coat.spots) {
      c.save();
      c.beginPath(); c.ellipse(0, 0, 47, 23, 0, 0, TAU); c.clip();
      c.fillStyle = coat.spots;
      [[-22, -6, 14, 10], [8, 8, 16, 9], [26, -12, 9, 7], [-36, 10, 9, 8]].forEach(([sx, sy, rx, ry]) => {
        c.beginPath(); c.ellipse(sx, sy, rx, ry, 0.3, 0, TAU); c.fill();
      });
      c.restore();
    }

    // Kopf
    c.save();
    c.translate(56, -54);
    c.rotate(0.6 + (gallop ? Math.sin(p * 2) * 0.06 : Math.sin(time * 1.3) * 0.03));
    c.fillStyle = coat.body;
    c.beginPath(); c.ellipse(12, 0, 17, 10.5, 0, 0, TAU); c.fill();
    c.fillStyle = coat.dark;
    c.beginPath(); c.ellipse(27, 2, 9, 8, 0, 0, TAU); c.fill();
    if (coat.id === 'fuchs' || coat.id === 'rappe') { // Blesse
      c.fillStyle = '#f4efe6';
      c.beginPath(); c.ellipse(16, -6, 10, 2.5, 0.1, 0, TAU); c.fill();
    }
    c.fillStyle = coat.body; // Ohr
    c.beginPath(); c.moveTo(-2, -6); c.lineTo(-4, -22); c.lineTo(7, -8); c.closePath(); c.fill();
    c.fillStyle = '#1a1410'; // Auge
    c.beginPath(); c.arc(9, -3, 2.6, 0, TAU); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(9.8, -3.8, 0.9, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,.45)'; // Nüster
    c.beginPath(); c.arc(31, 3, 1.8, 0, TAU); c.fill();
    c.strokeStyle = '#4a2c16'; // Halfter
    c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(4, -9); c.lineTo(6, 10); c.moveTo(5, 1); c.lineTo(24, 4); c.stroke();
    c.fillStyle = coat.mane; // Stirnschopf
    c.beginPath(); c.ellipse(4, -9, 7, 4, -0.6, 0, TAU); c.fill();
    c.restore();

    // Mähne
    c.strokeStyle = coat.mane;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(48, -60);
    c.quadraticCurveTo(34 - (gallop ? 6 + wave * 3 : 0), -40, 18 - (gallop ? 6 : 0), -14);
    c.stroke();

    // Satteldecke & Sattel
    c.fillStyle = pad.color;
    c.beginPath(); c.roundRect(-24, -22, 36, 24, 5); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(-24, -2, 36, 2.5);
    c.fillStyle = '#5a3418';
    c.beginPath(); c.ellipse(-6, -21, 16, 6, 0, 0, TAU); c.fill();
    c.fillRect(-8, -18, 3, 22); // Steigbügelriemen

    // Beine vorne (nahe Seite)
    drawLeg(c, -24, ...legAngles(pose, p, 0.3, false), coat.body, hoof);
    drawLeg(c, 36, ...legAngles(pose, p, 0.85 * TAU, true), coat.body, hoof);

    if (o.rider) drawRider(c, gallop || pose === 'jump', p);

    // Magie-Glitzer
    if (coat.magic) {
      for (let i = 0; i < 6; i++) {
        const a = time * 1.5 + i * 1.05;
        drawSparkle(c, Math.cos(a) * 60 + 5, Math.sin(a * 1.3) * 30 - 10, 3 + Math.sin(time * 5 + i) * 1.5, '#fff6c9');
      }
    }
    c.restore();
  }

  function drawRider(c, lean, p) {
    c.save();
    c.translate(-6, -26);
    c.rotate(lean ? 0.28 + Math.sin(p * 2) * 0.03 : 0.05);
    c.lineCap = 'round';
    // Bein
    c.strokeStyle = '#efe7d6';
    c.lineWidth = 8;
    c.beginPath(); c.moveTo(0, -4); c.lineTo(12, 10); c.lineTo(8, 24); c.stroke();
    c.strokeStyle = '#2a211b';
    c.lineWidth = 8;
    c.beginPath(); c.moveTo(8, 20); c.lineTo(8, 28); c.stroke();
    // Oberkörper
    c.strokeStyle = '#2b6cb0';
    c.lineWidth = 13;
    c.beginPath(); c.moveTo(0, -4); c.lineTo(2, -34); c.stroke();
    // Arm & Zügel
    c.lineWidth = 6;
    c.beginPath(); c.moveTo(2, -30); c.lineTo(16, -18); c.lineTo(28, -20); c.stroke();
    c.strokeStyle = '#3d2412';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(28, -20); c.lineTo(78, -12); c.stroke();
    // Kopf, Zopf & Helm
    c.fillStyle = '#7a4a26';
    c.beginPath(); c.ellipse(-9, -42, 4, 8, 0.6, 0, TAU); c.fill();
    c.fillStyle = '#f1c7a0';
    c.beginPath(); c.arc(3, -45, 8.5, 0, TAU); c.fill();
    c.fillStyle = '#1f2633';
    c.beginPath(); c.arc(3, -47, 9.5, Math.PI, 0); c.fill();
    c.fillRect(8, -48, 8, 2.5);
    c.restore();
  }

  function drawSparkle(c, x, y, r, color) {
    c.save();
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const rr = i % 2 ? r * 0.35 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    c.restore();
  }

  // ---------------------------------------------------------------------------
  // Zeichnen: Stall
  // ---------------------------------------------------------------------------
  function drawStable(dt) {
    const c = ctx;
    // Holzwand
    c.fillStyle = '#8a5a33';
    c.fillRect(0, 0, viewW, GROUND);
    for (let x = 0; x < viewW; x += 46) {
      c.fillStyle = hash(x) > 0.5 ? '#7f522e' : '#93613a';
      c.fillRect(x, 0, 44, GROUND);
      c.fillStyle = 'rgba(0,0,0,.12)';
      c.fillRect(x + 44, 0, 2, GROUND);
    }
    c.fillStyle = '#5c3a1f'; // Balken
    c.fillRect(0, 40, viewW, 18);
    c.fillRect(0, GROUND - 120, viewW, 12);

    // Fenster
    const wx = viewW * 0.72, wy = 90;
    c.fillStyle = '#5c3a1f';
    c.fillRect(wx - 8, wy - 8, 156, 116);
    const sky = c.createLinearGradient(0, wy, 0, wy + 100);
    sky.addColorStop(0, '#7ec4ef'); sky.addColorStop(1, '#cdebf7');
    c.fillStyle = sky;
    c.fillRect(wx, wy, 140, 100);
    c.save();
    c.beginPath(); c.rect(wx, wy, 140, 100); c.clip();
    c.fillStyle = '#5e9b52';
    c.beginPath(); c.ellipse(wx + 30, wy + 100, 70, 30, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(wx + 115, wy + 104, 60, 36, 0, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = '#5c3a1f';
    c.fillRect(wx + 67, wy, 6, 100);
    c.fillRect(wx, wy + 47, 140, 6);

    // Namensschild
    c.fillStyle = '#e9d6a8';
    c.beginPath(); c.roundRect(viewW * 0.47 - 80, 74, 160, 40, 6); c.fill();
    c.strokeStyle = '#5c3a1f'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#3b2412';
    c.font = 'bold 22px "Segoe UI", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(state.horse.name, viewW * 0.47, 95);

    // Hufeisen
    c.strokeStyle = '#9aa0a6';
    c.lineWidth = 6;
    c.beginPath(); c.arc(viewW * 0.18, 120, 16, 0.25 * Math.PI, 0.75 * Math.PI, true); c.stroke();

    // Boden mit Stroh
    c.fillStyle = '#c9a54c';
    c.fillRect(0, GROUND - 6, viewW, VIEW_H - GROUND + 6);
    c.strokeStyle = '#e3c770';
    c.lineWidth = 2;
    for (let i = 0; i < viewW / 6; i++) {
      const sx = hash(i) * viewW, sy = GROUND + hash(i + 99) * (VIEW_H - GROUND);
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 10 - hash(i + 7) * 20, sy - 4); c.stroke();
    }

    // Heuballen
    const bx = viewW * 0.06;
    c.fillStyle = '#d8b54e';
    c.beginPath(); c.roundRect(bx, GROUND - 70, 110, 70, 8); c.fill();
    c.strokeStyle = '#b8932e';
    c.lineWidth = 3;
    for (let y = GROUND - 60; y < GROUND; y += 12) { c.beginPath(); c.moveTo(bx + 6, y); c.lineTo(bx + 104, y); c.stroke(); }
    c.strokeStyle = '#8a3b2b';
    c.beginPath(); c.moveTo(bx + 30, GROUND - 70); c.lineTo(bx + 30, GROUND); c.moveTo(bx + 80, GROUND - 70); c.lineTo(bx + 80, GROUND); c.stroke();

    // Wassereimer
    const ex = viewW * 0.84;
    c.fillStyle = '#6f7b85';
    c.beginPath(); c.moveTo(ex, GROUND - 46); c.lineTo(ex + 50, GROUND - 46); c.lineTo(ex + 44, GROUND); c.lineTo(ex + 6, GROUND); c.closePath(); c.fill();
    c.fillStyle = '#5aaee0';
    c.beginPath(); c.ellipse(ex + 25, GROUND - 46, 25, 6, 0, 0, TAU); c.fill();

    // Pferd
    const hp = stableHorsePos();
    drawHorse(c, hp.x, hp.y + Math.sin(time * 2) * 1.2, hp.s, { ...state.horse, pose: 'stand' });

    // Partikel
    for (const pt of particles) {
      pt.age += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      const a = clamp(1 - pt.age / pt.life, 0, 1);
      c.globalAlpha = a;
      if (pt.kind === 'sparkle') drawSparkle(c, pt.x, pt.y, 7, '#fff3b0');
      else {
        c.font = pt.kind === 'zzz' ? 'bold 26px sans-serif' : '22px sans-serif';
        c.fillStyle = '#fff';
        c.fillText({ heart: '❤️', hay: '🌾', zzz: 'Z' }[pt.kind], pt.x, pt.y);
      }
      c.globalAlpha = 1;
    }
    particles = particles.filter(pt => pt.age < pt.life);
  }

  // ---------------------------------------------------------------------------
  // Zeichnen: Ausritt
  // ---------------------------------------------------------------------------
  function drawLandscape(scroll) {
    const c = ctx;
    const sky = c.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#5fa8de');
    sky.addColorStop(1, '#cfe9f5');
    c.fillStyle = sky;
    c.fillRect(0, 0, viewW, GROUND);

    c.fillStyle = '#fff4c2';
    c.beginPath(); c.arc(viewW - 110, 80, 36, 0, TAU); c.fill();

    // Wolken
    c.fillStyle = 'rgba(255,255,255,.9)';
    const cOff = scroll * 0.05;
    for (let i = Math.floor(cOff / 260) - 1; i < (cOff + viewW) / 260 + 1; i++) {
      const x = i * 260 - cOff + hash(i) * 80, y = 50 + hash(i + 3) * 70;
      [[0, 0, 40, 14], [28, -8, 26, 14], [-24, -4, 22, 11]].forEach(([ox, oy, rx, ry]) => {
        c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, 0, 0, TAU); c.fill();
      });
    }

    // Berge
    const ridge = (off, base, amp, color, f1, f2) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, GROUND);
      for (let x = 0; x <= viewW + 10; x += 10) {
        const wx = x + off;
        c.lineTo(x, base - Math.abs(Math.sin(wx * f1)) * amp - Math.sin(wx * f2) * amp * 0.3);
      }
      c.lineTo(viewW, GROUND);
      c.closePath();
      c.fill();
    };
    ridge(scroll * 0.1, 300, 130, '#8aa6c1', 0.0035, 0.011);
    ridge(scroll * 0.25, 340, 70, '#6f9e6a', 0.006, 0.017);

    // Bäume
    const tOff = scroll * 0.6;
    for (let i = Math.floor(tOff / 120) - 1; i < (tOff + viewW) / 120 + 1; i++) {
      if (hash(i * 3.1) < 0.35) continue;
      const x = i * 120 - tOff + hash(i) * 50;
      const h = 70 + hash(i + 5) * 50;
      c.fillStyle = '#5a3c22';
      c.fillRect(x - 4, GROUND - 30, 8, 30);
      c.fillStyle = hash(i + 11) > 0.5 ? '#2f6b3a' : '#3c7d3f';
      if (hash(i + 2) > 0.5) {
        c.beginPath(); c.moveTo(x, GROUND - 30 - h); c.lineTo(x + 26, GROUND - 24); c.lineTo(x - 26, GROUND - 24); c.closePath(); c.fill();
      } else {
        c.beginPath(); c.arc(x, GROUND - 30 - h * 0.4, h * 0.38, 0, TAU); c.fill();
      }
    }

    // Wiese & Reitweg
    c.fillStyle = '#5fa04e';
    c.fillRect(0, GROUND - 8, viewW, VIEW_H - GROUND + 8);
    c.fillStyle = '#b48a5a';
    c.fillRect(0, GROUND + 4, viewW, 26);
    c.fillStyle = '#4f8c41';
    const gOff = scroll;
    for (let i = Math.floor(gOff / 34); i < (gOff + viewW) / 34 + 1; i++) {
      const x = i * 34 - gOff;
      c.fillRect(x, GROUND - 12, 3, 8);
      if (hash(i) > 0.8) {
        c.fillStyle = ['#f6d743', '#f27ca8', '#ffffff'][Math.floor(hash(i + 1) * 3)];
        c.beginPath(); c.arc(x + 10, GROUND + 44 + hash(i + 4) * 10, 3.5, 0, TAU); c.fill();
        c.fillStyle = '#4f8c41';
      }
    }
  }

  function drawObstacle(o) {
    const c = ctx;
    const top = GROUND - o.h;
    switch (o.kind) {
      case 'fence':
        c.fillStyle = '#f5f1e8';
        c.fillRect(o.x, top, 7, o.h);
        c.fillRect(o.x + o.w - 7, top, 7, o.h);
        c.fillStyle = '#d7473b';
        c.fillRect(o.x - 4, top + 8, o.w + 8, 7);
        c.fillStyle = '#f5f1e8';
        c.fillRect(o.x - 4, top + 26, o.w + 8, 7);
        break;
      case 'log':
        c.fillStyle = '#7a4d2a';
        c.beginPath(); c.roundRect(o.x, top, o.w, o.h, o.h / 2); c.fill();
        c.fillStyle = '#c99a63';
        c.beginPath(); c.ellipse(o.x + o.w - 8, top + o.h / 2, 7, o.h / 2 - 2, 0, 0, TAU); c.fill();
        c.strokeStyle = '#8a5a33'; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(o.x + o.w - 8, top + o.h / 2, 3, 6, 0, 0, TAU); c.stroke();
        break;
      case 'hedge':
        c.fillStyle = '#2e6a33';
        c.beginPath(); c.roundRect(o.x, top + 8, o.w, o.h - 8, 10); c.fill();
        c.fillStyle = '#3d8441';
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(o.x + 8 + i * 13, top + 12, 10, 0, TAU); c.fill(); }
        break;
      case 'water':
        c.fillStyle = '#4b9fd6';
        c.beginPath(); c.ellipse(o.x + o.w / 2, GROUND + 4, o.w / 2, 9, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,255,.6)';
        c.fillRect(o.x + o.w * 0.3 + Math.sin(time * 4) * 4, GROUND + 1, 14, 2);
        break;
    }
  }

  function drawItem(it) {
    const c = ctx;
    const bob = Math.sin(time * 4 + it.x * 0.02) * 4;
    const y = it.y + bob;
    if (it.type === 'coin') {
      const sx = Math.abs(Math.cos(time * 4 + it.x * 0.05));
      c.fillStyle = '#e8b52f';
      c.beginPath(); c.ellipse(it.x, y, 11 * sx + 2, 11, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffe07a';
      c.beginPath(); c.ellipse(it.x, y, 6 * sx + 1, 6, 0, 0, TAU); c.fill();
    } else if (it.type === 'apple') {
      c.fillStyle = '#d63a2f';
      c.beginPath(); c.arc(it.x - 4, y, 10, 0, TAU); c.arc(it.x + 4, y, 10, 0, TAU); c.fill();
      c.strokeStyle = '#5a3418'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(it.x, y - 8); c.lineTo(it.x + 2, y - 15); c.stroke();
      c.fillStyle = '#4caf50';
      c.beginPath(); c.ellipse(it.x + 7, y - 13, 6, 3, -0.5, 0, TAU); c.fill();
    } else {
      c.save();
      c.translate(it.x, y);
      c.rotate(time * 2);
      c.fillStyle = '#ffd84a';
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 7 : 16, a = i * Math.PI / 5 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fill();
      c.restore();
    }
  }

  function drawRide() {
    const r = ride;
    const c = ctx;
    c.save();
    if (r.shake > 0) c.translate(rand(-5, 5) * r.shake / 0.3, rand(-4, 4) * r.shake / 0.3);
    drawLandscape(r.scroll);
    r.obstacles.forEach(drawObstacle);
    r.items.forEach(drawItem);

    c.fillStyle = 'rgba(160,120,80,.5)';
    for (const d of r.dust) {
      c.globalAlpha = 1 - d.age / d.life;
      c.beginPath(); c.arc(d.x, d.y, 5 + d.age * 12, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;

    const blink = r.inv > 0 && Math.floor(r.inv * 12) % 2 === 0;
    if (!blink) {
      drawHorse(c, HORSE_X, r.feet - FEET, 1, {
        ...state.horse, rider: true, phase: r.phase,
        pose: r.onGround ? 'gallop' : 'jump', shadowDy: GROUND - r.feet,
      });
    }
    c.restore();
  }

  // ---------------------------------------------------------------------------
  // Hauptschleife
  // ---------------------------------------------------------------------------
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    viewW = VIEW_H * rect.width / Math.max(1, rect.height);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) ui.toast.classList.add('hidden');
    }

    const scale = canvas.height / VIEW_H;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (mode === 'ride' && ride) {
      updateRide(dt);
      drawRide();
    } else {
      drawStable(dt);
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Eingaben
  // ---------------------------------------------------------------------------
  const JUMP_KEYS = new Set(['Space', 'ArrowUp', 'KeyW']);

  window.addEventListener('keydown', e => {
    if (mode !== 'ride') return;
    if (JUMP_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) pressJump();
    } else if (e.code === 'Escape' || e.code === 'KeyP') {
      togglePause();
    }
  });
  window.addEventListener('keyup', e => {
    if (mode === 'ride' && JUMP_KEYS.has(e.code)) releaseJump();
  });

  canvas.addEventListener('pointerdown', e => { if (mode === 'ride') { e.preventDefault(); pressJump(); } });
  ui.jump.addEventListener('pointerdown', e => { e.preventDefault(); pressJump(); });
  window.addEventListener('pointerup', releaseJump);
  window.addEventListener('pointercancel', releaseJump);
  window.addEventListener('blur', () => { if (ride && !ride.paused && !ride.over) togglePause(); });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => care(btn.dataset.action));
  });
  ui.coatGrid.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) buy('coat', b.dataset.id); });
  ui.padGrid.addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) buy('pad', b.dataset.id); });
  ui.rideBtn.addEventListener('click', startRide);
  ui.shopBtn.addEventListener('click', () => setMode('shop'));
  ui.shopBack.addEventListener('click', () => setMode('stable'));
  ui.pause.addEventListener('click', togglePause);
  ui.mute.addEventListener('click', () => { state.muted = !state.muted; saveState(); renderWallet(); });

  ui.horseName.value = state.horse.name;
  ui.horseName.addEventListener('input', () => {
    state.horse.name = ui.horseName.value.trim() || 'Sternchen';
    saveState();
  });

  window.addEventListener('resize', resize);

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  resize();
  setMode('stable');
  if (!state.seenIntro) {
    showDialog(`
      <h2>Willkommen im Wolfstal! 🐴</h2>
      <p>Hier wartet dein eigenes Pferd auf dich.</p>
      <p>🪮 Pflege und füttere es im Stall.<br>🏇 Reite aus, spring über Hindernisse und sammle Münzen und Äpfel.<br>🛍️ Kauf neue Fellfarben und Satteldecken.</p>
      <div class="main-actions"><button id="introBtn" class="primary">Los geht's!</button></div>`);
    $('introBtn').onclick = () => { state.seenIntro = true; saveState(); hideDialog(); };
  }
  requestAnimationFrame(frame);
})();
