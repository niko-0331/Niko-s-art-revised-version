'use strict';
/* =====================================================
   静かな教室 ― 診断ホラーノベル
   index.html / style.css / script.js だけで動きます（GitHub Pages対応）
   キャラ画像: assets/shione.png, assets/hinata.png, assets/koharu.png を置くと自動で使われます
   ===================================================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const state = {
  voice: true, sound: true, reduce: false,
  reds: 0, greens: 0, qi: 0, tags: [],
  script: null, labels: {}, i: 0,
  typing: false, waiting: false, choosing: false, timer: null, full: '',
  route: null
};

/* =====================================================
   サウンド（WebAudioで生成。外部ファイル不要）
   ===================================================== */
const Snd = {
  ctx: null, master: null, droneNodes: null,
  init() {
    if (this.ctx) { this.ctx.state === 'suspended' && this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  },
  ok() { return this.ctx && state.sound; },
  noiseBuf(sec) {
    const n = this.ctx.sampleRate * sec, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  tone(f, dur, type = 'sine', vol = .3, slideTo = null, delay = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .05);
  },
  noise(dur, vol, freq, type = 'lowpass', sweepTo = null, delay = 0) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf(dur + .1); f.type = type; f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + .1);
  },
  drone(level) {               // level 0=停止, 0.1〜1=不穏度
    if (!this.ctx) return;
    if (!level) {
      if (this.droneNodes) {
        const n = this.droneNodes; this.droneNodes = null;
        n.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.2);
        setTimeout(() => n.os.forEach(o => { try { o.stop(); } catch (e) {} }), 1400);
      }
      return;
    }
    if (!state.sound) return;
    if (!this.droneNodes) {
      const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      g.gain.value = 0; f.type = 'lowpass'; f.frequency.value = 240;
      const os = [55, 58.2, 110.5].map((fr, k) => { const o = this.ctx.createOscillator(); o.type = k < 2 ? 'sawtooth' : 'sine'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
      lfo.frequency.value = .22; lg.gain.value = 40; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); os.push(lfo);
      f.connect(g); g.connect(this.master);
      this.droneNodes = { g, f, os };
    }
    const n = this.droneNodes, t = this.ctx.currentTime;
    n.g.gain.linearRampToValueAtTime(.05 + level * .12, t + 1.5);
    n.f.frequency.linearRampToValueAtTime(180 + level * 500, t + 1.5);
  },
  heartbeat(n = 6, bpm = 70) {
    if (!this.ok()) return;
    const gap = 60 / bpm;
    for (let i = 0; i < n; i++) {
      this.tone(60, .18, 'sine', .55, 40, i * gap);
      this.tone(50, .2, 'sine', .4, 35, i * gap + .16);
    }
  },
  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'rumble':     // お腹がぐるる…
        this.noise(1.6, .5, 90, 'bandpass', 260);
        this.noise(1.2, .35, 150, 'bandpass', 70, .5);
        this.tone(70, 1.3, 'sawtooth', .08, 40);
        break;
      case 'chime': [523, 659, 784, 1046].forEach((f, k) => this.tone(f, .9, 'sine', .12, null, k * .22)); break;
      case 'door': this.noise(.35, .5, 300, 'lowpass', 80); this.tone(90, .3, 'square', .2, 50); break;
      case 'creak': this.tone(180, 1.4, 'sawtooth', .09, 420); break;
      case 'whoosh': this.noise(.8, .3, 400, 'bandpass', 3000); break;
      case 'low': this.tone(40, 2, 'sine', .6, 30); break;
      case 'touch': this.noise(.35, .7, 1800, 'highpass'); this.tone(120, .4, 'square', .25, 50); break;
      case 'scare':
        this.noise(1.1, state.reduce ? .45 : 1, 3500, 'highpass');
        this.tone(900, .9, 'sawtooth', state.reduce ? .15 : .4, 2400);
        this.tone(1300, .9, 'square', state.reduce ? .1 : .25, 300);
        this.tone(45, 1.2, 'sine', .9, 25);
        break;
      case 'laugh': Voice.say('くすくす…あはは…くすくす', 'mobWhisper'); break;
    }
  }
};

/* =====================================================
   ボイス（ブラウザの音声合成：日本語）
   ===================================================== */
const PROFILES = {
  default: { pitch: 1, rate: 1 },
  shione: { pitch: 1.2, rate: .9, vol: .9 },
  hinata: { pitch: 1.45, rate: 1.08 },
  koharu: { pitch: 1.65, rate: 1.05 },
  mother: { pitch: .95, rate: .95 },
  teacher: { pitch: .55, rate: .9 },
  doctor: { pitch: .7, rate: .92 },
  mob: { pitch: 1.2, rate: 1.15, vol: .7 },
  mobWhisper: { pitch: .35, rate: .7, vol: .8 },
  ghost: { pitch: .1, rate: .55 },
  shioneGhost: { pitch: .55, rate: .72 },
  you: { pitch: 1.1, rate: .95 }
};
const Voice = {
  voices: [], v: null,
  load() {
    if (!('speechSynthesis' in window)) return;
    this.voices = speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang));
    const pref = ['Kyoko', 'Haruka', 'Nanami', 'Ayumi', 'Sayaka', 'O-Ren', 'Google 日本語', 'Mizuki'];
    this.v = pref.map(p => this.voices.find(v => v.name.includes(p))).find(Boolean) || this.voices[0] || null;
  },
  clean(t) {
    return t.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').replace(/[「」『』]/g, '').replace(/[…―─]+/g, '、').replace(/[♪♥★☆]/g, '').trim();
  },
  say(text, who) {
    if (!state.voice || !('speechSynthesis' in window)) return;
    const s = this.clean(text); if (!s) return;
    const u = new SpeechSynthesisUtterance(s), p = PROFILES[who] || PROFILES.default;
    u.lang = 'ja-JP'; if (this.v) u.voice = this.v;
    u.pitch = p.pitch; u.rate = p.rate; u.volume = p.vol ?? 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  },
  stop() { 'speechSynthesis' in window && speechSynthesis.cancel(); }
};
if ('speechSynthesis' in window) { Voice.load(); speechSynthesis.onvoiceschanged = () => Voice.load(); }

/* =====================================================
   キャラクター（画像が無ければシルエットSVGで表示）
   ===================================================== */
const CHARS = {
  shione: { name: '柊 汐音', hair: '#0a0a0a', style: 'long', img: 'assets/shione.png' },
  hinata: { name: '一ノ瀬 日向', hair: '#3b2418', style: 'bob', img: 'assets/hinata.png' },
  koharu: { name: '梅宮 小春', hair: '#0a0a0a', style: 'pony', img: 'assets/koharu.png' },
  mother: { name: 'お母さん', hair: '#4a3a2a', style: 'bob', adult: true },
  teacher: { name: '先生', hair: '#222', style: 'short', adult: true },
  doctor: { name: '医師', hair: '#333', style: 'short', adult: true, white: true },
  mob: { name: 'クラスメイト', hair: '#1a1a1a', style: 'short', faceless: true }
};
function svgFor(id) {
  const c = CHARS[id], hair = c.hair, skin = '#f6d8c9';
  const body = c.white ? '#f1f1f1' : c.adult ? '#454a58' : '#171c55';
  let back = '', front = '';
  if (c.style === 'long') { back = `<path d="M52 70 Q50 210 62 250 L78 250 L78 90Z M148 70 Q150 210 138 250 L122 250 L122 90Z" fill="${hair}"/>`; }
  if (c.style === 'bob') { back = `<path d="M54 70 Q46 150 62 168 L80 150Z M146 70 Q154 150 138 168 L120 150Z" fill="${hair}"/>`; }
  if (c.style === 'pony') { back = `<ellipse cx="150" cy="60" rx="16" ry="30" fill="${hair}"/>`; }
  front = `<path d="M54 80 Q56 30 100 28 Q146 30 146 80 Q130 56 100 58 Q70 56 54 80Z" fill="${hair}"/>`;
  const face = c.faceless ? '' : `<ellipse cx="82" cy="94" rx="5" ry="6.5" fill="#111"/><ellipse cx="118" cy="94" rx="5" ry="6.5" fill="#111"/><path d="M90 118 Q100 124 110 118" stroke="#a55" stroke-width="2.5" fill="none"/>`;
  const sailor = (c.adult || c.white) ? '' : `<path d="M70 168 L100 208 L130 168 L118 164 L100 186 L82 164Z" fill="#fff"/><path d="M92 190 L108 190 L114 240 L100 230 L86 240Z" fill="#d11"/>`;
  return `<svg viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg">
  ${back}<path d="M64 168 Q100 150 136 168 L152 300 L48 300Z" fill="${body}"/>
  <rect x="44" y="168" width="14" height="120" rx="7" fill="${body}"/><rect x="142" y="168" width="14" height="120" rx="7" fill="${body}"/>
  <path d="M52 296 L148 296 L166 400 L34 400Z" fill="${c.adult ? '#32353f' : '#171c55'}"/>
  <rect x="86" y="140" width="28" height="30" fill="${skin}"/>
  <ellipse cx="100" cy="95" rx="42" ry="52" fill="${skin}"/>${front}${face}${sailor}
  </svg>`;
}
function showChar(o) {
  const old = $('#chars [data-id="' + o.id + '"]'); if (old) old.remove();
  const c = CHARS[o.id]; if (!c) return;
  const d = document.createElement('div');
  d.className = 'sprite ' + (o.pos || 'center') + ' ' + (o.mood || '');
  d.dataset.id = o.id;
  if (c.img && !c.faceless) {
    const im = new Image(); im.alt = c.name; im.src = c.img;
    im.onerror = () => { d.innerHTML = svgFor(o.id); };
    d.appendChild(im);
  } else d.innerHTML = svgFor(o.id);
  $('#chars').appendChild(d);
}
function hideChar(id) {
  $$('#chars .sprite').forEach(s => {
    if (id === 'all' || s.dataset.id === id) { s.classList.add('fadeout'); setTimeout(() => s.remove(), 500); }
  });
}
function moodChar(id, m) {
  const s = $('#chars [data-id="' + id + '"]'); if (!s) return;
  s.classList.remove('sad', 'scared', 'shadow'); if (m) s.classList.add(m);
}

/* =====================================================
   演出
   ===================================================== */
function setBg(n) {
  const b = $('#bg'); b.className = 'bg-' + n;
}
function flash(color = '#fff', ms = 250, op = 1) {
  const f = $('#flash'); if (state.reduce) { op *= .3; ms = Math.min(ms, 140); }
  f.style.transition = 'none'; f.style.background = color; f.style.opacity = op;
  requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; });
}
function pulse(el, cls, ms) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }
function spawnEyes(n = 14) {
  const box = $('#eyes');
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      const e = document.createElement('div'); e.className = 'eye';
      const s = .6 + Math.random() * 1.4;
      e.style.left = (Math.random() * 92) + '%'; e.style.top = (Math.random() * 60) + '%'; e.style.transform = `scale(${s})`;
      e.style.animationDelay = (Math.random() * .6) + 's';
      box.appendChild(e); setTimeout(() => e.remove(), 3400);
    }, i * 90);
  }
}
function fx(name) {
  const g = $('#game');
  switch (name) {
    case 'shake': pulse(g, 'shake', 650); Snd.sfx('touch'); break;
    case 'soft': pulse(g, 'softshake', 520); break;
    case 'flash': flash('#fff', 300); break;
    case 'redflash': flash('#a00', 500, .8); break;
    case 'glitch': pulse($('#bg'), 'glitch', 900); pulse($('#chars'), 'glitch', 900); $('#staticv').classList.add('on'); setTimeout(() => $('#staticv').classList.remove('on'), 900); Snd.noise(.5, .3, 2500, 'highpass'); break;
    case 'blood': $('#bloodv').classList.add('on'); break;
    case 'dark': $('#darkv').classList.add('on'); break;
    case 'light': $('#darkv').classList.remove('on'); break;
    case 'static': $('#staticv').classList.add('on'); break;
    case 'dread': $('#bg').classList.remove('deep'); $('#bg').classList.add('dread'); break;
    case 'deep': $('#bg').classList.remove('dread'); $('#bg').classList.add('deep'); break;
    case 'eyes': spawnEyes(state.reduce ? 6 : 16); Snd.sfx('low'); break;
    case 'rumble': Snd.sfx('rumble'); pulse(g, 'softshake', 520); break;
    case 'heart': Snd.heartbeat(7, 78); break;
    case 'laugh': Snd.sfx('laugh'); break;
    case 'whoosh': Snd.sfx('whoosh'); break;
    case 'chime': Snd.sfx('chime'); break;
    case 'door': Snd.sfx('door'); break;
    case 'creak': Snd.sfx('creak'); break;
    case 'jump': showScare(1100); break;
    case 'clear':
      ['#bloodv', '#darkv', '#staticv'].forEach(s => $(s).classList.remove('on'));
      $('#bg').classList.remove('dread', 'deep'); $('#eyes').innerHTML = ''; break;
  }
}

/* ジャンプスケア用の顔（みんなの顔） */
function drawFace(x, W, H, ox = 0, oy = 0, scale = 1) {
  const cx = W / 2 + ox, cy = H / 2 + oy, s = Math.min(W, H) * .5 * scale;
  const gr = x.createRadialGradient(cx, cy, s * .1, cx, cy, s * .9);
  gr.addColorStop(0, '#ebe6d8'); gr.addColorStop(1, '#5d5950');
  x.fillStyle = '#000'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#000'; x.fillRect(cx - s * .78, cy - s * .8, s * .3, s * 1.9); x.fillRect(cx + s * .48, cy - s * .8, s * .3, s * 1.9);
  x.fillStyle = gr; x.beginPath(); x.ellipse(cx, cy, s * .58, s * .82, 0, 0, 7); x.fill();
  x.fillStyle = '#000'; x.beginPath(); x.ellipse(cx, cy - s * .55, s * .66, s * .45, 0, Math.PI, 0); x.fill();
  x.fillRect(cx - s * .1, cy - s * .75, s * .2, s * .35);
  [-1, 1].forEach(k => {
    x.fillStyle = '#000'; x.beginPath(); x.ellipse(cx + k * s * .24, cy - s * .08, s * .15, s * .24, 0, 0, 7); x.fill();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + k * s * .24 + s * .03, cy - s * .15, s * .025, 0, 7); x.fill();
  });
  x.strokeStyle = '#100'; x.lineWidth = s * .035; x.lineCap = 'round';
  x.beginPath(); x.arc(cx, cy + s * .2, s * .36, .08 * Math.PI, .92 * Math.PI); x.stroke();
  for (let i = 0; i < 9; i++) { const a = (.14 + i * .09) * Math.PI; x.beginPath(); x.moveTo(cx + Math.cos(a) * s * .36, cy + s * .2 + Math.sin(a) * s * .36); x.lineTo(cx + Math.cos(a) * s * .36, cy + s * .2 + Math.sin(a) * s * .36 - s * .08); x.stroke(); }
}
function showScare(ms = 1000, cb) {
  const c = $('#scare'); c.width = innerWidth; c.height = innerHeight;
  const x = c.getContext('2d'); c.classList.remove('hidden');
  Snd.sfx('scare');
  if (state.reduce) c.style.opacity = .55; else c.style.opacity = 1;
  let t0 = performance.now(), iv = setInterval(() => {
    const k = (performance.now() - t0) / ms;
    drawFace(x, c.width, c.height, (Math.random() - .5) * 24, (Math.random() - .5) * 24, 1 + k * .35);
  }, 50);
  setTimeout(() => { clearInterval(iv); c.classList.add('hidden'); cb && cb(); }, ms);
}

/* =====================================================
   3D 一人称パート（Three.js）
   ===================================================== */
function makeText(text, w, h, fg = '#ddd', bg = '#222') {
  const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
  const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = fg; x.font = `bold ${c.height * .6}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2 + 4);
  return new THREE.CanvasTexture(c);
}
function makeFaceTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#d9d5c6'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#050505'; x.fillRect(0, 0, 128, 30);
  x.beginPath(); x.ellipse(40, 66, 13, 20, 0, 0, 7); x.ellipse(88, 66, 13, 20, 0, 0, 7); x.fill();
  x.strokeStyle = '#111'; x.lineWidth = 4; x.beginPath(); x.arc(64, 88, 26, .1 * Math.PI, .9 * Math.PI); x.stroke();
  return new THREE.CanvasTexture(c);
}

function run3D(mode) {
  return new Promise(resolve => {
    if (!window.THREE) { resolve(); return; }
    const view = $('#view3d'), canvas = $('#c3d');
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); } catch (e) { resolve(); return; }
    view.classList.remove('hidden');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    const long = mode === 'long', L = long ? 62 : 34;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x020202); scene.fog = new THREE.FogExp2(0x020202, long ? .14 : .11);
    const cam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .1, 100);
    cam.rotation.order = 'YXZ'; cam.position.set(0, 1.5, 2.5); scene.add(cam);
    const torch = new THREE.PointLight(0xffe0b0, 1.2, 15, 2); cam.add(torch);
    scene.add(new THREE.HemisphereLight(0x223344, 0x110d08, .28));
    const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .92, metalness: 0 }, o));
    const len = L + 6, mid = (4 - L) / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, len), M(0x2b2a22)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, mid); scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(4, len), M(0x181818)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3, mid); scene.add(ceil);
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), M(0x3b4239)); wl.rotation.y = Math.PI / 2; wl.position.set(-2, 1.5, mid); scene.add(wl);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(len, 3), M(0x3b4239)); wr.rotation.y = -Math.PI / 2; wr.position.set(2, 1.5, mid); scene.add(wr);
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), M(0x111111)); wb.rotation.y = Math.PI; wb.position.set(0, 1.5, 4); scene.add(wb);
    const we = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), M(0x222a25)); we.position.set(0, 1.5, -L); scene.add(we);
    // 蛍光灯
    const fixtures = [];
    for (let z = 0; z > -L; z -= 7) {
      const m = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xddeedd, emissiveIntensity: .8 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .05, 1.2), m); b.position.set(0, 2.96, z); scene.add(b); fixtures.push(m);
    }
    // ドアと窓
    let n = 1;
    for (let z = -2; z > -L + 3; z -= 6) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(.08, 2.2, 1.2), M(0x3a2a1c)); d.position.set(-1.96, 1.1, z); scene.add(d);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(.6, .22), new THREE.MeshBasicMaterial({ map: makeText('2-' + (n++), 3, 1.1, '#ddd', '#252a25') }));
      s.rotation.y = Math.PI / 2; s.position.set(-1.9, 2.5, z); scene.add(s);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), new THREE.MeshBasicMaterial({ color: 0x0a1526 }));
      w.rotation.y = -Math.PI / 2; w.position.set(1.97, 1.6, z - 3); scene.add(w);
    }
    // トイレ入口
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.3), M(0x1f3a2c)); door.position.set(0, 1.15, -L + .04); scene.add(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, .4), new THREE.MeshBasicMaterial({ map: makeText('トイレ', 3, 1.1, '#fff', '#0a7a3a') })); sign.position.set(0, 2.6, -L + .05); scene.add(sign);
    // 影のクラスメイト
    const faceTex = makeFaceTex(), ghosts = [], gcount = long ? 11 : 5;
    for (let k = 0; k < gcount; k++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .28, 1.25, 10), M(0x0e0e12)); body.position.y = .62; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(.19, 12, 10), M(0x0a0a0a)); head.position.y = 1.42; g.add(head);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.3, .33), new THREE.MeshBasicMaterial({ map: faceTex })); face.position.set(0, 1.42, .17); g.add(face);
      const side = (k % 2 ? 1 : -1) * (.5 + Math.random() * 1);
      g.position.set(side, 0, -6 - k * ((L - 12) / gcount));
      g.rotation.y = Math.PI; scene.add(g); ghosts.push({ g, cd: 0 });
    }
    // 入力
    let yaw = 0, pitch = 0, dragging = false, lt = null; const keys = {};
    const kd = e => { keys[e.code] = true; }, ku = e => { keys[e.code] = false; };
    const mm = e => { if (document.pointerLockElement === canvas || dragging) { yaw -= e.movementX * .0024; pitch = Math.max(-1.1, Math.min(1.1, pitch - e.movementY * .0024)); } };
    const md = () => { dragging = true; canvas.requestPointerLock && canvas.requestPointerLock(); }, mu = () => { dragging = false; };
    const ts = e => { lt = e.touches[0]; }, tm = e => { const t = e.touches[0]; if (!lt) return; yaw -= (t.clientX - lt.clientX) * .006; pitch = Math.max(-1.1, Math.min(1.1, pitch - (t.clientY - lt.clientY) * .006)); lt = t; e.preventDefault(); };
    const fw = $('#fwd'), fdown = e => { keys.btn = true; e.preventDefault(); }, fup = () => { keys.btn = false; };
    addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('mousemove', mm);
    canvas.addEventListener('mousedown', md); addEventListener('mouseup', mu);
    canvas.addEventListener('touchstart', ts, { passive: true }); canvas.addEventListener('touchmove', tm, { passive: false });
    fw.addEventListener('pointerdown', fdown); addEventListener('pointerup', fup); fw.addEventListener('pointerleave', fup);
    const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); };
    addEventListener('resize', onResize);

    $('#hint3d').innerHTML = long
      ? 'マウスで視点 / W・↑で前進　スマホ：ドラッグで視点・ボタン長押しで前進<br>とにかく「トイレ」まで走れ。振り返るな、とは言わない。'
      : 'マウスで視点 / W・↑で前進　スマホ：ドラッグで視点・ボタン長押しで前進<br>トイレまで急ごう。視線を感じる…';
    const sub = $('#sub3d'); let subT = null;
    const say3 = (t, who = 'ghost') => { sub.textContent = t; Voice.say(t, who); clearTimeout(subT); subT = setTimeout(() => sub.textContent = '', 2400); };
    const lines = long
      ? [[1, 'また、トイレ？', 'mobWhisper'], [8, 'ずるいよね', 'mobWhisper'], [16, '体調不良って言えば許されるんだ', 'ghost'], [24, 'お腹が鳴ったの、聞こえたよ', 'mobWhisper'], [32, 'オナラ……オナラ……', 'ghost'], [42, 'あの子、また？', 'mobWhisper'], [52, 'ずるい……ずるい……ずるい……', 'ghost']]
      : [[1, 'さっきの…聞こえた？', 'mobWhisper'], [8, 'あの子オナラしてたよね', 'mobWhisper'], [18, 'くすくす…', 'mobWhisper'], [26, 'またやってる…', 'ghost']];
    let li = 0, resets = 0, done = false, hb = 0, t0 = performance.now(), last = t0, raf, caught = 0;
    const fade = $('#fade3d');
    function cleanup() {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('mousemove', mm);
      canvas.removeEventListener('mousedown', md); removeEventListener('mouseup', mu);
      canvas.removeEventListener('touchstart', ts); canvas.removeEventListener('touchmove', tm);
      fw.removeEventListener('pointerdown', fdown); removeEventListener('pointerup', fup); fw.removeEventListener('pointerleave', fup);
      removeEventListener('resize', onResize);
      renderer.dispose(); view.classList.add('hidden'); sub.textContent = '';
      document.pointerLockElement && document.exitPointerLock();
    }
    function finish() {
      if (done) return; done = true; Voice.stop();
      if (long) {
        torch.intensity = 0; fixtures.forEach(m => m.emissiveIntensity = 0);
        Snd.sfx('door'); say3('……ギィ……', 'ghost');
        setTimeout(() => showScare(1200, () => { cleanup(); resolve(); }), 1500);
      } else {
        fade.style.opacity = 1; setTimeout(() => { cleanup(); fade.style.opacity = 0; resolve(); }, 600);
      }
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, .05); last = now;
      if (done) { renderer.render(scene, cam); return; }
      cam.rotation.y = yaw; cam.rotation.x = pitch;
      const fz = -Math.cos(yaw), fx_ = -Math.sin(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      let mv = 0, sx = 0;
      if (keys.KeyW || keys.ArrowUp || keys.btn) mv += 1; if (keys.KeyS || keys.ArrowDown) mv -= .6;
      if (keys.KeyD || keys.ArrowRight) sx += 1; if (keys.KeyA || keys.ArrowLeft) sx -= 1;
      const sp = 2.5 * dt;
      cam.position.x = Math.max(-1.6, Math.min(1.6, cam.position.x + (fx_ * mv + rx * sx) * sp));
      cam.position.z = Math.max(-L + 1, Math.min(3.4, cam.position.z + (fz * mv + rz * sx) * sp));
      cam.position.y = 1.5 + (mv || sx ? Math.sin(now / 140) * .035 : 0);
      // 明滅
      if (Math.random() < .03) { torch.intensity = .15 + Math.random() * 1.2; fixtures.forEach(m => m.emissiveIntensity = Math.random() * 1.2); }
      else if (Math.random() < .08) { torch.intensity = 1.2; fixtures.forEach(m => m.emissiveIntensity = .8); }
      // 影のクラスメイト：見ていないと近づき、顔を向ける
      let nearest = 99;
      ghosts.forEach(o => {
        const dx = o.g.position.x - cam.position.x, dz = o.g.position.z - cam.position.z, d = Math.hypot(dx, dz) || .001;
        const dot = (fx_ * dx + fz * dz) / d, seen = dot > .55 && d < 24;
        o.cd -= dt;
        if (!seen) {
          o.g.rotation.y = Math.atan2(-dx, -dz);
          if (d > 1.1) { const v = (long ? 1.7 : 1.1) * dt; o.g.position.x -= dx / d * v; o.g.position.z -= dz / d * v; }
        } else nearest = Math.min(nearest, d);
        if (d < 1 && o.cd <= 0) {
          o.cd = 4; caught++; fade.style.opacity = .85; setTimeout(() => fade.style.opacity = 0, 180);
          Snd.sfx('touch'); say3(['ねぇ', 'みてた', 'きこえた'][caught % 3], 'ghost');
          o.g.position.z -= 10; if (o.g.position.z < -L + 2) o.g.position.z = -L + 3;
        }
      });
      if (nearest < 7 && now - hb > 700 + nearest * 80) { hb = now; Snd.heartbeat(2, 90); }
      // 囁き
      const prog = 2.5 - cam.position.z;
      if (li < lines.length && prog > lines[li][0] + (resets * 0)) { say3(lines[li][1], lines[li][2]); li++; }
      // ゴール
      if (cam.position.z < -L + 2.2) {
        if (long && resets < 2) {
          resets++; fade.style.opacity = 1; Snd.sfx('whoosh');
          setTimeout(() => { cam.position.z = 3; fade.style.opacity = 0; say3(resets === 1 ? 'ドアが……遠い' : '遠ざかっていく……', 'ghost'); li = Math.max(0, li - 3); }, 350);
          cam.position.z = -L + 3;   // 一瞬だけ連続発火を防ぐ
        } else finish();
      }
      renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(frame);
  });
}

/* =====================================================
   シナリオ
   ===================================================== */
const N = (t, o = {}) => ({ t, k: 'nar', ...o });
const T = (t, o = {}) => ({ t, k: 'think', ...o });
const D = (n, t, v, o = {}) => ({ n, t, v, ...o });
const LB = l => ({ label: l });
const CARD = (t, s = '', ms = 2600) => ({ card: t, sub: s, ms });
const SHOW = (id, pos = 'center', mood = '') => ({ show: { id, pos, mood } });

/* ---------- 🔴 バッドエンド（シナリオv2を恐怖に再構成） ---------- */
const BAD = [
  CARD('第一部　あの子、また？', '', 2600),
  { bg: 'classroom', drone: .15 },
  N('静かな授業中。ページをめくる音と、先生の声だけが教室に満ちている。'),
  SHOW('shione', 'center'),
  N('斜め前の席で、柊汐音が音もなく立ち上がり、そっと教室を出ていった。'),
  { hide: 'shione' },
  N('……今日、これで三度目だ。'),
  SHOW('hinata', 'left'), SHOW('koharu', 'right'),
  D('日向', '（小声）……まーた行った。', 'hinata'),
  D('小春', '（小声）テスト中もよく出てくよね。ちゃんと受けなくて大丈夫なのかな？', 'koharu'),
  D('日向', '（小声）体調不良って言えば、なんでも許されるじゃん。ずるくない？', 'hinata'),
  { choice: [{ t: '「……まあ、ちょっとね」と笑って合わせる', go: 'agree' }, { t: '「そんなこと言わなくても…」と思いつつ、黙る', go: 'silent' }] },
  LB('agree'),
  T('（本当は、少しだけ思っていた。……ずるいな、って。）'), { go: 'p2' },
  LB('silent'),
  T('（そう思ったのに、声には出せなかった。笑ってごまかした。）'),
  N('――それも、同じ「見ないふり」だった。'), { go: 'p2' },
  LB('p2'),
  { hide: 'all' },
  CARD('第二部　自分にも起こる', '', 2400),
  { bg: 'classroom', fx: 'dread', drone: .45 },
  N('次の日。数学の小テスト。教室は、これ以上ないほど静かだった。'),
  T('……お腹が、痛い。'),
  T('大丈夫、すぐ治る。今は動けない。今は、絶対に鳴らないで――'),
  { fx: 'rumble' },
  N('ぎゅるるるる……と、お腹の底から音が鳴った。静けさの中で、それは信じられないほど大きく響き渡った。'),
  { fx: 'eyes' },
  N('一人、また一人。振り返る顔。ひそひそ、くすくす。'),
  { fx: 'laugh' },
  D('クラスメイト', '……今の聞こえた？', 'mobWhisper'),
  D('クラスメイト', 'あの子、またやってるよ。', 'mobWhisper'),
  { fx: 'glitch' },
  N('時計の秒針が止まった。いや、止まったのは、教室の全員だった。'),
  T('違う。違うの。お腹が痛いだけで――'),
  N('声が出ない。みんなの口が、ゆっくり、同じ形に笑っている。'),
  { fx: 'blood', drone: .8 },
  D('？？？', 'ずるい……ずるい……ずるい……', 'ghost'),
  T('……それ、私が昨日、言った言葉だ。'),
  N('教室中の首が、一斉にあなたへ向いた。ゆっくりと。まったく同じ角度で。'),
  { fx: 'jump' },
  N('あなたは椅子を蹴って、廊下へ飛び出した。'),
  { fx: 'clear', bg: 'black', drone: .6 },
  CARD('第三部　知らなかった事情', '―― 一人称で、トイレまで ――', 2600),
  { play3d: 'long' },
  { bg: 'toilet', fx: 'deep', drone: .9 },
  N('気づくと、あなたは個室の中にいた。鍵は閉まっている。外から、足音が止まった。'),
  { fx: 'heart' },
  N('壁一面に、文字が刻まれている。'),
  { fx: 'blood' },
  D('壁の文字', 'またトイレ？　ずるい。　オナラ。　ずるい。　ずるい。　ずるい。', 'ghost'),
  T('全部、聞き覚えがある。……全部、私たちが言った言葉だ。'),
  N('洗面台の鏡に、誰かが立っていた。'),
  SHOW('shione', 'center', 'shadow'),
  D('汐音', '……やっと、わかった？', 'shioneGhost'),
  { fx: 'glitch' },
  D('汐音', '私ね、ずっとその中にいたよ。あなたが、見ないふりをしていた間も。', 'shioneGhost'),
  D('汐音', '「ずるい」って言葉、毎日、聞こえてたよ。', 'shioneGhost'),
  T('ごめん。知らなかったの。知ろうとも、しなかった――'),
  { fx: 'eyes' },
  D('汐音', '知らなかった、で済む世界は、もう終わり。', 'shioneGhost'),
  N('鏡の中の汐音が、ゆっくりと、あなたの顔になっていく。その背後で、クラスメイトが全員、笑っていた。'),
  { fx: 'jump' },
  { hide: 'all', bg: 'classroom', fx: 'clear' },
  N('――目を開けると、教室だった。授業中。静かな、静かな教室。'),
  SHOW('teacher', 'center'),
  D('先生', 'どうしたの？　席を立つの、これで何回目？', 'teacher'),
  { fx: 'dread' },
  N('周りの誰かが、小さく、くすりと笑った。'),
  D('クラスメイト', 'あの子、また？', 'mobWhisper'),
  { fx: 'glitch' }, { fx: 'dark' },
  N('それからあなたは、静かな教室が怖くなった。'),
  N('誰もあなたの苦しみを知らない。知ろうともしない。――あの日のあなたが、そうだったように。'),
  { end: 'bad' }
];

/* ---------- 🟡 中間（シナリオv1 ＋ 恐怖演出） ---------- */
const MID = [
  CARD('第一部　当たり前の日常', '', 2400),
  { bg: 'lunch' },
  N('お昼休み。別のクラスの汐音と、今日もいつもの席でお弁当を広げる。'),
  SHOW('shione', 'center'),
  D('汐音', '今日のお弁当、卵焼き入ってる！ねぇ、一個交換しよ？', 'shione'),
  D('あなた', 'いいよ。そっちのミートボールも貰うからね。', 'you'),
  N('他愛のない話で笑い合う、いつもの昼休み。'),
  N('汐音は時々、そっとお腹に手を当てる。……あなたは、その意味を知らない。'),
  T('（朝ごはん、食べすぎたのかな。）それくらいにしか、思っていなかった。'),
  { hide: 'all' },
  CARD('第二部　Bに起こる変化', '', 2400),
  { bg: 'classroom', fx: 'dread', drone: .4 },
  N('五限目、国語。先生が教科書を読む声だけが、静かな教室に響く。'),
  T('……お腹が、痛い。おならも出そうだ。'),
  T('今は国語の時間。この静けさの中で、もし、今……'),
  { fx: 'heart' },
  T('だめ、耐えなきゃ。耐え――'),
  { fx: 'rumble' },
  N('外には出なかった。けれど、お腹の中で、オナラのような音が大きく鳴ってしまった。'),
  { fx: 'eyes' },
  N('先生の声が止まる。周りのクラスメイトが、ちらちらとこちらを見ている。'),
  T('（やばい、今のオナラだと思われた……違うのに……！）'),
  T('お願い、誤解しないで。お願い。'),
  { fx: 'clear', drone: .25 },
  N('チャイムが鳴った。あなたはトイレへ向かうため、席を立った。'),
  { fx: 'laugh' },
  D('クラスメイト', 'さっきさ、あの子オナラしてたよね？笑', 'mobWhisper'),
  N('教室の奥から聞こえたその声に、足が止まりかけた。あなたは逃げるように走り出した。'),
  { play3d: 'short' },
  { bg: 'toilet', fx: 'dread', drone: .3 },
  T('そうじゃないのに。違うのに……！'),
  N('個室の中で、あなたは泣きそうになるのを必死にこらえた。'),
  { fx: 'dark' }, { fx: 'heart' },
  N('それがトラウマになった。静かな授業が、怖い。人がたくさんいる静かな場所が、怖い。'),
  { fx: 'eyes' },
  N('「今、お腹が痛くなったら」。そう考えるほど、症状は悪化して――'),
  { fx: 'glitch' },
  N('そんな日が、頻繁に起こるようになった。'),
  { fx: 'clear', hide: 'all', drone: 0 },
  CARD('第三部　初めての理解者', '数週間後', 2400),
  { bg: 'roof', fx: 'clear' },
  SHOW('shione', 'center'),
  N('あなたは思い切って、汐音に相談してみることにした。'),
  D('あなた', '最近さ、授業とか、静かで人がいっぱいのとこで、緊張してお腹が痛くなっちゃって……全然集中できないんだよね。', 'you'),
  N('目を下に落とす。きっとわかってもらえない。気にしすぎって、あしらわれるかも。'),
  { wait: 900 },
  D('汐音', '私も。', 'shione'),
  { show: { id: 'shione', pos: 'center', mood: '' } },
  N('驚いて顔を上げた。汐音は、あなたの気持ちが痛いほどわかる、という顔をしていた。'),
  D('汐音', '私ね、ずっと前から、同じなんだ。IBS（過敏性腸症候群）っていうの。', 'shione'),
  D('汐音', '先生にも相談してるよ。席を出口の近くにしてもらったり、授業中も黙って出ていっていいことにしてもらったり。', 'shione'),
  N('汐音は、どんな対策をしているのか、一つひとつ丁寧に教えてくれた。'),
  T('……いたんだ。同じ苦しさを知っている人が、こんな近くに。'),
  { hide: 'all' },
  CARD('第四部　汐音のアナザーストーリー', '', 2600),
  ...ANOTHER_STORY(),
  CARD('第五部　支え合うということ', '', 2400),
  { bg: 'roof', fx: 'clear' },
  SHOW('shione', 'left'),
  D('汐音', '一緒に考えよう。相談できる人も、学校でできることも。', 'shione'),
  D('あなた', 'うん。……ありがとう、汐音。', 'you'),
  N('すぐに症状が消えるわけじゃない。でも、一人で抱え込まなきゃいけないと思っていた日々に、変化が生まれた。'),
  N('そしてあなたもまた、いつか誰かの苦しさに気づける人になっていく。'),
  { end: 'mid' }
];
/* 汐音の過去（中間ルートの第四部／Aルートの回想で共通利用） */
function ANOTHER_STORY() {
  return [
    { bg: 'sepia', fx: 'clear' },
    N('――これは、汐音が話してくれた、汐音の過去。'),
    SHOW('shione', 'left', 'sad'), SHOW('mother', 'right'),
    T('（お母さんに、何度も話した。「お腹が痛い」って。）'),
    D('お母さん', 'また？　朝ごはんをちゃんと食べないからでしょ。気にしすぎよ。', 'mother'),
    T('（伝わらなかった。何度話しても、「気のせい」だった。）'),
    { bg: 'night' },
    N('ある夜。汐音は、お母さんの前で、とうとう泣きながら言った。'),
    D('汐音', '本当に、苦しいの。嘘じゃないの。……お願い、信じて。', 'shione'),
    { wait: 700 },
    D('お母さん', '……汐音。ごめんね。そんなに、苦しかったのね。', 'mother'),
    N('ようやく、お母さんは理解してくれた。次の日、二人で病院へ行った。'),
    { bg: 'staff', hide: 'mother' },
    SHOW('teacher', 'right'),
    D('先生', '話してくれてありがとう。一人でよく頑張ったね。席は出入り口の近くにしよう。授業中も、合図だけで退室していいからね。', 'teacher'),
    N('汐音は、その日、はじめて声を出して泣いた。'),
    T('（あの日の私が、いま誰かを支えようとしている。）'),
    { hide: 'all' }
  ];
}

/* ---------- 🟢 Aの物語（汐音視点・丁寧版） ---------- */
const GOOD = [
  CARD('柊 汐音の物語', '―― 静かな教室で ――', 3000),
  { bg: 'bedroom' },
  N('朝、目が覚めた瞬間に、お腹が重い。……今日も、だ。'),
  T('大丈夫。きっと、今日は大丈夫。'),
  { bg: 'kitchen' }, SHOW('mother', 'right'), SHOW('shione', 'left', 'sad'),
  D('汐音', 'お母さん……お腹、痛い。', 'shione'),
  D('お母さん', 'また？　朝ごはん、ちゃんと食べないからでしょ。ほら、遅刻するわよ。', 'mother'),
  T('（また、伝わらなかった。）'),
  { hide: 'all', bg: 'street' },
  N('通学路で、私はいつも頭の中で地図を描く。駅のトイレ、コンビニ、学校の三階の突き当たり。'),
  T('逃げ場所を知っているだけで、ほんの少し、呼吸ができる。'),
  { bg: 'classroom', fx: 'dread' },
  N('静かな授業。テスト。ホームルーム。逃げ場のない時間が、一番怖い。'),
  T('お腹が鳴ったら。笑われたら。……手を挙げて、出ていけなかったら。'),
  { fx: 'rumble' },
  N('小さく、ぐるる……と音がした。'),
  { fx: 'eyes' },
  N('前の席の子が、ちらりと振り返る。私は教科書を見つめたまま、手のひらに爪を立てる。'),
  T('（聞こえてない。聞こえてない。聞こえてないって、思いたい。）'),
  { fx: 'clear' },
  N('手のひらには、爪の跡が残った。'),
  { bg: 'lunch' }, SHOW('hinata', 'center'),
  D('日向', '汐音、顔色悪いよ？　大丈夫？', 'hinata'),
  T('本当は、言いたい。でも、「気にしすぎ」って言われたら。'),
  D('汐音', 'ううん、大丈夫。', 'shione'),
  N('笑顔を作るのが、私は上手になってしまった。'),
  { hide: 'all' },
  CARD('あの夜', '', 2200),
  { bg: 'night' }, SHOW('mother', 'right'), SHOW('shione', 'left', 'sad'),
  N('お母さんは、リビングで洗濯物をたたんでいた。私は、手が震えていた。'),
  { choice: [{ t: '勇気を出して、ちゃんと話す', go: 'speak' }, { t: 'やっぱり黙っておく', go: 'quiet' }] },
  LB('quiet'),
  T('……言えなかった。言っても、また「気のせい」って言われる気がして。'),
  N('でも、このままだと、きっと明日も、同じ朝が来る。'),
  T('（……もう一度だけ。ちゃんと、話してみよう。）'), { go: 'speak' },
  LB('speak'),
  D('汐音', 'お母さん。……お腹が痛いの、嘘じゃないの。', 'shione'),
  D('汐音', '静かな教室で、お腹が鳴ったらって、怖くて。学校に行くのも、怖くて。毎日、ずっと、本当に苦しいの。', 'shione'),
  N('涙が止まらなかった。声が、勝手に震えた。'),
  { wait: 900 },
  D('お母さん', '……汐音。ごめんね。そんなに、苦しかったのね。気づいてあげられなくて、ごめんなさい。', 'mother'),
  N('お母さんは、私を強く抱きしめた。その腕の中で、私は何年ぶりかに、ちゃんと息を吸えた気がした。'),
  { hide: 'all', bg: 'hospital' }, SHOW('doctor', 'center'),
  D('医師', 'お話を聞くかぎり、過敏性腸症候群（IBS）の可能性が高いですね。緊張やストレスで、腸が敏感に反応してしまうんです。', 'doctor'),
  D('医師', 'あなたが弱いからでも、気にしすぎでもありません。食事や生活のリズム、お薬、そして心の負担を減らす工夫で、楽になる方は多いですよ。', 'doctor'),
  N('「弱いからじゃない」。その一言が、胸の奥にずっと刺さっていた棘を、そっと抜いてくれた。'),
  { bg: 'staff', hide: 'doctor' }, SHOW('teacher', 'right'),
  D('先生', '話してくれてありがとう。一人でよく頑張ったね。', 'teacher'),
  D('先生', '席は出入り口の近くにしよう。授業中も、合図だけで退室していい。テストも、必要なら別室で受けられるように相談しようね。', 'teacher'),
  D('汐音', '……いいんですか。本当に、出ていっても。', 'shione'),
  D('先生', 'もちろん。汐音さんが安心して授業を受けられることが、大事だから。', 'teacher'),
  N('私は、その日、泣いてばかりだった。でも、それは今までの涙とは、違う涙だった。'),
  { hide: 'all' },
  CARD('それから', '', 2000),
  { bg: 'classroom', fx: 'clear' }, SHOW('shione', 'center'),
  N('症状がゼロになったわけじゃない。今日も、お腹が痛い日はある。'),
  N('でも、出入り口に近い席と、「出ていってもいい」という許可があるだけで、世界の静けさは、前より優しくなった。'),
  { bg: 'roof' }, SHOW('koharu', 'right'),
  D('小春', '……あのさ、汐音。最近、静かなところだと緊張して、お腹が痛くなっちゃって。集中できなくて……。', 'koharu'),
  T('その顔を、私は知っている。かつての私と、同じ顔。'),
  { choice: [{ t: '「私も。わかるよ」と寄り添う', go: 'empathy' }, { t: '「気にしすぎじゃない？」と言う', go: 'wrong' }] },
  LB('wrong'),
  T('……それは、私が一番言われて、つらかった言葉だ。'),
  N('そんな言葉を、今度は私が、誰かにかけるわけにはいかない。'),
  T('（もう一度。ちゃんと、向き合おう。）'), { go: 'empathy' },
  LB('empathy'),
  D('汐音', '私も。ずっと、そうだったの。', 'shione'),
  { show: { id: 'koharu', pos: 'right', mood: '' } },
  N('小春は、驚いたように顔を上げた。その目に、うっすらと涙が浮かぶ。'),
  D('汐音', '一人じゃ、ないよ。相談できる場所も、学校でできる工夫も、一緒に考えよう。', 'shione'),
  D('小春', '……うん。ありがとう、汐音。', 'koharu'),
  N('あの日の私に、言ってあげたい。「ひとりじゃないよ」って。'),
  N('そして、あの日の私みたいな誰かに、今度は私が、言ってあげられる。'),
  { end: 'good' }
];

const SCRIPTS = { good: GOOD, mid: MID, bad: BAD };

/* =====================================================
   エンジン
   ===================================================== */
function startRoute(r) {
  state.route = r; Snd.init(); Voice.stop();
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#game').classList.add('active');
  fx('clear'); $('#chars').innerHTML = ''; $('#choices').style.display = 'none';
  $('#card').classList.remove('on');
  state.script = SCRIPTS[r]; state.labels = {};
  state.script.forEach((c, i) => { if (c.label) state.labels[c.label] = i; });
  state.i = 0; state.waiting = false; state.choosing = false;
  setBg('black'); step();
}
function step() {
  if (state.i >= state.script.length) return;
  exec(state.script[state.i++]);
}
function later(ms) { setTimeout(step, ms); }
function exec(c) {
  if (c.bg) setBg(c.bg);
  if (c.hide) hideChar(c.hide);
  if (c.show) showChar(c.show);
  if (c.mood) moodChar(c.mood.id, c.mood.m);
  if (c.drone !== undefined) Snd.drone(c.drone);
  if (c.sfx) Snd.sfx(c.sfx);
  if (c.fx) fx(c.fx);
  if (c.card) { $('#cardT').textContent = c.card; $('#cardS').textContent = c.sub || ''; $('#card').classList.add('on'); $('#textbox').style.visibility = 'hidden';
    setTimeout(() => { $('#card').classList.remove('on'); $('#textbox').style.visibility = 'visible'; step(); }, c.ms || 2400); return; }
  if (c.wait) return later(c.wait);
  if (c.fx === 'jump') return later(1500);
  if (c.choice) return showChoice(c.choice);
  if (c.go) { state.i = state.labels[c.go]; return step(); }
  if (c.play3d) { $('#textbox').style.visibility = 'hidden'; run3D(c.play3d).then(() => { $('#textbox').style.visibility = 'visible'; step(); }); return; }
  if (c.end) return showEnding(c.end);
  if (c.t !== undefined) return say(c);
  step();
}
function say(c) {
  const tag = $('#nameTag'), tx = $('#text');
  if (c.n) { tag.textContent = c.n; tag.style.display = 'block'; } else tag.style.display = 'none';
  tx.className = c.k || '';
  state.full = c.t; state.waiting = true; state.typing = true; tx.textContent = ''; $('#next').style.visibility = 'hidden';
  if (c.n && c.k !== 'think') Voice.say(c.t, c.v);
  else Voice.stop();
  let k = 0; clearInterval(state.timer);
  state.timer = setInterval(() => {
    tx.textContent = state.full.slice(0, ++k);
    if (k >= state.full.length) finishTyping();
  }, 34);
}
function finishTyping() {
  clearInterval(state.timer); state.typing = false; $('#text').textContent = state.full; $('#next').style.visibility = 'visible';
}
function advance() {
  if (!state.waiting || state.choosing) return;
  if (state.typing) { finishTyping(); return; }
  state.waiting = false; Voice.stop(); step();
}
function showChoice(list) {
  state.choosing = true; const box = $('#choices'); box.innerHTML = ''; box.style.display = 'flex';
  list.forEach(o => {
    const b = document.createElement('button'); b.textContent = o.t;
    b.onclick = e => { e.stopPropagation(); box.style.display = 'none'; state.choosing = false; state.i = state.labels[o.go]; step(); };
    box.appendChild(b);
  });
}

/* =====================================================
   エンディング
   ===================================================== */
function showEnding(type) {
  Snd.drone(0); Voice.stop(); fx('clear');
  const info = `<p style="margin-top:14px;font-size:13px;color:#a99fae">※この物語はフィクションです。過敏性腸症候群（IBS）は、お腹の痛みや下痢・便秘などが続く、緊張やストレスで悪化しやすい身近な病気です。気になる症状が続くときは、ひとりで我慢せず、保護者・学校の先生・保健室・医療機関に相談してみてください。</p>`;
  const E = {
    bad: ['BAD END　『あの子、また？』', `<p>「知らない」は、時に刃になる。</p><p>見た目ではわからない苦しさを、「ずるい」の一言で片づけてしまったあなた。その言葉は、いつか自分に返ってきました。</p><p>――でも、これは物語です。現実のあなたは、まだ間に合います。</p>${info}`],
    mid: ['END　『支え合うということ』', `<p>同じ苦しさを知る誰かに出会えたことで、世界は少しだけ優しくなりました。</p><p>あなたもきっと、いつか誰かの「私も」になれるはずです。</p>${info}`],
    good: ['TRUE END　『ひとりじゃないよ』', `<p>勇気を出して伝えたから、届いた言葉。</p><p>あの日の汐音が受け取った優しさは、今度は、小春へ。そして、あなたへ。</p>${info}`]
  }[type];
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#ending').classList.add('active');
  $('#endTitle').textContent = E[0]; $('#endBody').innerHTML = E[1];
}

/* =====================================================
   診断
   ===================================================== */
const QUIZ = [
  { q: '友達が髪型を変えたり、体調が悪そうだったりするとき、すぐに気づく方だ。', yes: { g: 1, tag: '共感高 🟢' }, no: { r: 1, tag: '無関心 🔴' } },
  { q: 'テスト中や静かな授業中、「お腹が鳴ったらどうしよう」と不安になったことがある。', yes: { g: 1, tag: '繊細・リスク認知あり 🟢' }, no: { r: 1, tag: '動じない・無敵 🔴' } },
  { q: '正直、「学校を体調不良でよく休む人」を見ると、「ずるいな」と思ってしまう瞬間がある。', yes: { r: 1, tag: '厳格・偏見あり 🔴' }, no: { g: 1, tag: '寛容・心配 🟢' } },
  { q: '人前で発表するときや緊張する場面でも、あまりお腹が痛くなったりはしない。', yes: { r: 1, tag: '健康・非当事者 🔴' }, no: { g: 1, tag: 'お腹が弱い・当事者寄り 🟢' } },
  { q: 'もし自分が大失敗をして周りからクスクス笑われたら、何日も引きずってしまうと思う。', yes: { g: 1, tag: 'プレッシャーに弱い 🟢' }, no: { r: 1, tag: 'メンタルが強い・気にしない 🔴' } }
];
function showScreen(id) { $$('.screen').forEach(s => s.classList.remove('active')); $('#' + id).classList.add('active'); }
function askQ() {
  const q = QUIZ[state.qi];
  $('#qProgress').textContent = `Q${state.qi + 1} / ${QUIZ.length}`; $('#qText').textContent = q.q;
}
function answer(yes) {
  const a = QUIZ[state.qi][yes ? 'yes' : 'no'];
  state.reds += a.r || 0; state.greens += a.g || 0; state.tags.push(a.tag);
  state.qi++;
  if (state.qi < QUIZ.length) askQ(); else showResult();
}
function routeFromScore() {
  if (state.reds >= 4) return 'bad';
  if (state.greens >= 4) return 'good';
  return 'mid';
}
function showResult() {
  const r = routeFromScore();
  $('#rScore').innerHTML = `🟢 ${state.greens}　　🔴 ${state.reds}`;
  $('#rTags').innerHTML = state.tags.map(t => `<li>${t}</li>`).join('');
  $('#rComment').textContent = {
    good: 'あなたは、誰かの小さな変化や苦しさに寄り添える人。ある少女の物語を、そっと見届けてください。',
    mid: 'あなたの中には、気づく力と、まだ知らない世界が同居しています。ある高校生の「日常」を体験してください。',
    bad: '……あなたの物語が決まりました。 どうか、目を逸らさずに。'
  }[r];
  state.chosen = r; showScreen('result');
}
function resetQuiz() { state.reds = 0; state.greens = 0; state.qi = 0; state.tags = []; }

/* =====================================================
   イベント
   ===================================================== */
$('#btnStart').onclick = () => {
  state.voice = $('#optVoice').checked; state.sound = $('#optSound').checked; state.reduce = $('#optReduce').checked;
  Snd.init(); Voice.load(); resetQuiz(); askQ(); showScreen('quiz');
  Snd.tone(220, 1.2, 'sine', .15, 110);
  $('#btnVoice').classList.toggle('off', !state.voice); $('#btnSound').classList.toggle('off', !state.sound);
};
$('#qYes').onclick = () => answer(true);
$('#qNo').onclick = () => answer(false);
$('#btnGo').onclick = () => startRoute(state.chosen);
$('#btnRetry').onclick = () => { resetQuiz(); askQ(); showScreen('quiz'); };
$$('.route').forEach(b => b.onclick = () => startRoute(b.dataset.route));
$('#game').addEventListener('pointerdown', e => { if (e.target.closest('button')) return; Snd.init(); advance(); });
addEventListener('keydown', e => { if ($('#game').classList.contains('active') && (e.code === 'Space' || e.code === 'Enter') && $('#view3d').classList.contains('hidden')) { e.preventDefault(); advance(); } });
$('#btnVoice').onclick = e => { e.stopPropagation(); state.voice = !state.voice; e.currentTarget.classList.toggle('off', !state.voice); if (!state.voice) Voice.stop(); };
$('#btnSound').onclick = e => { e.stopPropagation(); state.sound = !state.sound; e.currentTarget.classList.toggle('off', !state.sound); if (!state.sound) Snd.drone(0); };
$('#btnHome').onclick = e => { e.stopPropagation(); Snd.drone(0); Voice.stop(); fx('clear'); clearInterval(state.timer); resetQuiz(); showScreen('title'); };
