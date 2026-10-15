/* Ourtwo：夫妻專用的生活 App。資料存在 Firebase Firestore，兩支手機即時同步。 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB7Rq6SU2PJm5-O0PeqqiroX8QcpAHVM-Q",
  authDomain: "ourtwo-bfb8d.firebaseapp.com",
  projectId: "ourtwo-bfb8d",
  storageBucket: "ourtwo-bfb8d.firebasestorage.app",
  messagingSenderId: "562432353694",
  appId: "1:562432353694:web:1199113583745a78a2e28f"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
let db;
try {
  db = initializeFirestore(fbApp, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = getFirestore(fbApp);
}

/* ---------- 小工具 ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const DAY = 86400000, WD = ['日', '一', '二', '三', '四', '五', '六'];
const pad2 = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
const parse = s => { const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
const md = d => (d.getMonth() + 1) + '/' + d.getDate();
const mod = (a, n) => ((a % n) + n) % n;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};
const WHO = { him: '老公', her: '老婆', both: '兩人' };
const PHS = { period: '經期', fertile: '易孕期', ovul: '排卵日', safe: '安全期' };
const PHL = { period: '經期', fertile: '易孕期（危險期）', ovul: '排卵日（最危險）', safe: '安全期' };
const CH = ['#f1efe6', '#f4a3b5', '#f6d36b', '#8fc8ec', '#a8d8a0', '#f4a261', '#c3a6e8', '#e76f6f'];
const STICKERS = ['❤️', '💕', '⭐', '🌸', '🐱', '🐶', '🐰', '🐻', '🐷', '🐥', '🍙', '🍜', '🍰', '☕', '🌙', '☀️', '🎉', '😴', '💪', '🥰'];
const REACTS = ['❤️', '😂', '👍', '🥰', '🥺'];
const TODAY = iso(new Date());

/* ---------- 班別表（時間以「當天 0 點起算的分鐘」，超過 1440 表示跨到隔天） ---------- */
const CODES = {
  'A': { n: '早班', s: 600, e: 1140 },
  'B': { n: '晚班', s: 930, e: 1470 },
  'AB': { n: '兩班都上', s: 600, e: 1470 },
  '休': { n: '休假', s: 0, e: 0 },
  'C': { n: 'C 班', s: 720, e: 1260 },
  'A+G1': { n: '早班加 G1', s: 600, e: 1260 }
};
const CODE_ORDER = ['A', 'B', 'AB', 'C', '休', 'A+G1'];
const fm = m => pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);
const cls = c => c === '休' ? 's-off' : c === 'A' ? 's-A' : c === 'B' ? 's-B' : c === 'AB' ? 's-AB' : c ? 's-X' : 's-none';
const codeTxt = c => { const d = CODES[c]; if (!d) return '尚未輸入'; return d.e > d.s ? d.n + '　' + fm(d.s) + ' ~ ' + fm(d.e) : d.n; };


/* ---------- 外觀（自動／淺色／深色），每支手機自己記住 ---------- */
const THEMES = [['auto', '自動'], ['light', '淺色'], ['dark', '深色']];
const getTheme = () => { const v = LS.get('ourtwo.theme'); return v === 'light' || v === 'dark' ? v : 'auto'; };
function applyTheme() {
  const t = getTheme(), r = document.documentElement;
  if (t === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  $$('meta[name="theme-color"]').forEach(m => m.remove());
  const m = document.createElement('meta'); m.name = 'theme-color'; m.content = dark ? '#2E282F' : '#FFF9F5'; document.head.appendChild(m);
}

/* ---------- 狀態 ---------- */
let FID = LS.get('ourtwo.fid');
const S = { me: LS.get('ourtwo.me') === '老婆' ? '老婆' : '老公', shifts: {}, events: [], memos: [], notes: [], love: [], board: [], mood: [], play: {}, period: null };
const meKey = () => S.me === '老公' ? 'him' : 'her';
let booted = false, synced = false, unsubs = [];
let curTab = 'home', calY, calM, calSel = TODAY, perY, perM, memoMode = 'todo';
let draft = [], cur = null, color = CH[0], brush = 5, tool = 'chalk', stickerSel = STICKERS[0], draftPhoto = '', draftPA = 4 / 3, view = { z: 1, ox: 0, oy: 0 };
let boardLimit = 30, boardUnsub = null, boardNew = new Set();
let paintMode = false, paintWho = 'her', paintCode = 'A', loginWho = '老公', curSheet = null;
{ const t0 = new Date(); calY = perY = t0.getFullYear(); calM = perM = t0.getMonth(); }

const col = n => collection(db, 'families', FID, n);
const dref = (n, id) => doc(db, 'families', FID, n, id);

const VAPID_PUB = 'BMmsYwVKIthLmHnioturlTNgKm_8XALobFZE3k8hR1BVU4_SEikCIX4okvBnq2-gOT8DJBJxVPeN5M7uFkts7nQ';
const b64uToBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
function notifyState() { try { return 'Notification' in window ? (Notification.permission === 'granted' ? '已開啟' : Notification.permission === 'denied' ? '已被封鎖' : '未開啟') : '請從主畫面圖示開啟'; } catch (e) { return '不支援'; } }
const wr = p => { Promise.resolve(p).catch(e => toast('儲存失敗：' + (e.code || e.message))); };

function sh(w, k) { const m = S.shifts[k.slice(0, 7)]; return (m && m[w] && m[w][k.slice(8)]) || ''; }
function per() { const p = S.period; return p && p.last ? { last: p.last, cycle: p.cycle || 28, plen: p.plen || 5 } : null; }

/* ---------- 班表計算 ---------- */
function together(k) {
  const a = sh('him', k), b = sh('her', k);
  if (!a || !b) return '';
  const iv = [];
  [a, b].forEach(c => { const d = CODES[c]; if (d && d.e > d.s) iv.push([d.s, Math.min(d.e, 1440)]); });
  iv.sort((x, y) => x[0] - y[0]);
  let free = [], cur2 = 480;
  iv.forEach(r => { if (r[0] > cur2) free.push([cur2, r[0]]); cur2 = Math.max(cur2, r[1]); });
  if (cur2 < 1440) free.push([cur2, 1440]);
  free = free.filter(r => r[1] - r[0] >= 30);
  if (!free.length) return '沒有兩人都有空的時段';
  if (free.length === 1 && free[0][0] === 480 && free[0][1] === 1440) return '兩人都休息，整天都可以在一起';
  return '兩人都有空：' + free.map(r => fm(r[0]) + ' ~ ' + (r[1] === 1440 ? '24:00' : fm(r[1]))).join('、');
}
function monthStats(y, m) {
  const n = new Date(y, m + 1, 0).getDate(), off = [], cnt = { him: {}, her: {} };
  let has = false;
  for (let d = 1; d <= n; d++) {
    const k = y + '-' + pad2(m + 1) + '-' + pad2(d), a = sh('him', k), b = sh('her', k);
    if (a || b) has = true;
    if (a) cnt.him[a] = (cnt.him[a] || 0) + 1;
    if (b) cnt.her[b] = (cnt.her[b] || 0) + 1;
    if (a === '休' && b === '休') off.push((m + 1) + '/' + d);
  }
  return { has, off, cnt };
}
const cntText = c => CODE_ORDER.filter(x => c[x]).map(x => (x === '休' ? '休假' : CODES[x].n) + ' ' + c[x]).join('、');
function shiftRows(k, edit) {
  return ['him', 'her'].map(w => {
    const c = sh(w, k);
    return '<div class="shiftrow"><span class="who">' + WHO[w] + '</span><i class="s ' + cls(c) + '">' + (c || '·') + '</i><span class="info">' + codeTxt(c) + '</span>' +
      (edit ? '<button class="btn ghost small" data-act="editShift" data-w="' + w + '" data-d="' + k + '">改</button>' : '') + '</div>';
  }).join('');
}
const togetherHtml = k => { const t = together(k); return t ? '<p class="together">' + t + '</p>' : ''; };

/* ---------- 週期推算 ---------- */
function pinfo(d, P) {
  const c = P.cycle, idx = mod(diffDays(parse(P.last), d), c), ov = c - 14;
  let ph = 'safe';
  if (idx < P.plen) ph = 'period';
  else if (idx === ov) ph = 'ovul';
  else if (idx >= ov - 5 && idx <= ov + 1) ph = 'fertile';
  return { idx, ph };
}
function pnext(t, P) {
  const c = P.cycle, i = pinfo(t, P), start = addDays(t, -i.idx), nextStart = addDays(start, c);
  let ov = addDays(start, c - 14);
  if (diffDays(t, ov) < 0) ov = addDays(ov, c);
  return { i, ov, nextStart, toOv: diffDays(t, ov), toNext: diffDays(t, nextStart) };
}

/* ---------- 介面小工具 ---------- */
function toast(m) { const el = $('#toast'); el.textContent = m; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2200); }
function openSheet(h, info) { $('#sheet-panel').innerHTML = h; $('#sheet').hidden = false; curSheet = info || null; }
function closeSheet() { $('#sheet').hidden = true; curSheet = null; }
function fmtTs(ts) { const d = new Date(ts), k = iso(d), tm = pad2(d.getHours()) + ':' + pad2(d.getMinutes()); if (k === TODAY) return '今天 ' + tm; if (k === iso(addDays(new Date(), -1))) return '昨天 ' + tm; return md(d) + ' ' + tm; }
function monthCells(y, m) { const first = new Date(y, m, 1), n = Math.ceil((first.getDay() + new Date(y, m + 1, 0).getDate()) / 7) * 7, s = addDays(first, -first.getDay()), o = []; for (let i = 0; i < n; i++) o.push(addDays(s, i)); return o; }
const wdRow = () => WD.map(w => '<div class="wd">' + w + '</div>').join('');
const chip = w => '<span class="chip ' + w + '">' + WHO[w] + '</span>';
const byChip = name => '<span class="chip ' + (name === '老公' ? 'him' : 'her') + '">' + esc(name) + '</span>';

/* ---------- 手繪 ---------- */
/* 一張黑板 = 一串項目：筆畫 {c,w,p,k}（k：marker 麥克筆／crayon 蠟筆／hl 螢光筆／eraser 橡皮擦，沒有 k 就是粉筆）
   或貼紙 {t:'st',s,x,y,z}；另外可以有一張底圖照片。座標都是 0–1 的比例，兩支手機畫面大小不同也對得上。 */
const INK = document.createElement('canvas');
const IMGS = new Map();
function getImg(key, src) {
  const e = IMGS.get(key);
  if (e && e.src === src) return e.img.complete && e.img.naturalWidth ? e.img : null;
  const img = new Image();
  img.onload = () => rerender();
  img.src = src;
  IMGS.set(key, { src, img });
  if (IMGS.size > 60) IMGS.delete(IMGS.keys().next().value);
  return null;
}
function drawCover(g, im, w, h) {
  const sc = Math.max(w / im.naturalWidth, h / im.naturalHeight), dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
  g.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
function drawItem(g, s, w, h) {
  g.save();
  if (s.t === 'st') {
    g.font = Math.round(s.z * w) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.s, s.x * w, s.y * w);
    g.restore(); return;
  }
  const k = s.k || 'chalk', u = w / 360;
  let lw = s.w * u;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = s.c || '#fff';
  if (k === 'marker') { lw *= 2; g.globalAlpha = 0.94; }
  else if (k === 'hl') { lw *= 4; g.globalAlpha = 0.35; g.lineCap = 'butt'; }
  else if (k === 'eraser') { lw *= 4; g.globalCompositeOperation = 'destination-out'; }
  /* 同一筆每次重畫都要一樣，所以用第一個點算出固定的亂數種子 */
  let seed = Math.floor((s.p[0][0] * 9973 + s.p[0][1] * 7919 + s.p.length * 31) * 1000) % 2147483647 || 1;
  const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const trace = (dx, dy) => {
    g.beginPath();
    s.p.forEach((q, i) => { const x = q[0] * w + dx, y = q[1] * w + dy; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    if (s.p.length === 1) g.lineTo(s.p[0][0] * w + dx + 0.1, s.p[0][1] * w + dy);
    g.stroke();
  };
  if (k === 'crayon') {
    g.lineWidth = lw * 0.75; g.globalAlpha = 0.55;
    [[-1, 0.5], [1, -0.6], [0, 1]].forEach(o => trace(o[0] * u * s.w * 0.3, o[1] * u * s.w * 0.3));
  } else if (k === 'chalk') {
    /* 粉筆：好幾條細線疊在一起，每條有隨機的斷點和位置，邊緣毛毛的、有顆粒 */
    g.lineCap = 'butt';
    for (let i = 0; i < 6; i++) {
      g.lineWidth = Math.max(0.8, lw * (0.35 + rnd() * 0.25));
      g.globalAlpha = 0.5 + rnd() * 0.35;
      g.setLineDash([1 + rnd() * 7 * u * 3, rnd() * 3.2 * u * 3 + 0.6]);
      g.lineDashOffset = rnd() * 20;
      trace((rnd() - 0.5) * lw * 0.7, (rnd() - 0.5) * lw * 0.7);
    }
  } else { g.lineWidth = lw; trace(0, 0); }
  g.restore();
}
function paint(cv, items, photo, key, view) {
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const g = cv.getContext('2d'), vz = view ? view.z : 1, vx = view ? view.ox : 0, vy = view ? view.oy : 0;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  g.save(); g.translate(vx, vy); g.scale(vz, vz);
  if (photo) { const im = getImg(key, photo); if (im) drawCover(g, im, w, h); }
  INK.width = pw; INK.height = ph;
  const ig = INK.getContext('2d');
  ig.setTransform(dpr, 0, 0, dpr, 0, 0); ig.translate(vx, vy); ig.scale(vz, vz);
  items.forEach(s => drawItem(ig, s, w, h));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(INK, 0, 0);
  g.restore();
}
function noteView(n) {
  const body = (n.strokes.length || n.photo) ? '<canvas class="thumb" data-nid="' + n.id + '" style="aspect-ratio:' + (n.pa || 4 / 3) + '"></canvas>' : '';
  const text = n.caption ? ((n.strokes.length || n.photo) ? '<p class="cap">' + esc(n.caption) + '</p>' : '<div class="textonly">' + esc(n.caption) + '</div>') : '';
  return body + text;
}
function paintThumbs(root) { $$('canvas[data-nid]', root).forEach(cv => { const n = S.board.find(x => x.id === cv.dataset.nid); if (n) paint(cv, n.strokes, n.photo, n.id); }); }

/* ---------- 各分頁 ---------- */
function evRow(e) {
  return '<li class="ev"><span class="tm">' + (e.t || '全天') + '</span><span class="tt">' + esc(e.title) + '</span>' + chip(e.who) + '<button class="x" data-act="delEvent" data-id="' + e.id + '" aria-label="刪除行程">×</button></li>';
}

function renderHome() {
  const t = new Date(), hr = t.getHours(), hello = hr < 12 ? '早安' : hr < 18 ? '午安' : '晚安';
  const evs = S.events.filter(e => e.d === TODAY).sort((a, b) => (a.t || '').localeCompare(b.t || ''));
  const P = per();
  let periodCard;
  if (P) {
    const n = pnext(t, P), ph = n.i.ph;
    const line = ph === 'period' ? '經期第 ' + (n.i.idx + 1) + ' 天' : (n.toOv === 0 ? '今天是預估排卵日' : '下次排卵日 ' + md(n.ov) + '，' + n.toOv + ' 天後');
    periodCard = '<button class="card tap" data-act="tab" data-v="period" style="font:inherit;color:inherit"><div class="row"><h3>經期與排卵</h3><span class="chip ' + ph + '">' + PHS[ph] + '</span></div><p class="big">' + PHL[ph] + '</p><p class="muted">' + line + '</p></button>';
  } else {
    periodCard = '<button class="card tap" data-act="tab" data-v="period" style="font:inherit;color:inherit"><h3>經期與排卵</h3><p class="muted">還沒設定上次經期開始日，點這裡開始。</p></button>';
  }
  const last = S.board[0], open = S.memos.filter(m => !m.done);
  $('#home-body').innerHTML =
    '<div><h2>' + esc(S.me) + '，' + hello + '</h2><p class="muted">' + md(t) + ' 週' + WD[t.getDay()] + '</p></div>' +
    '<div class="card"><div class="row"><h3>今天的班表</h3><button class="btn ghost small" data-act="tab" data-v="cal">看整個月</button></div>' + shiftRows(TODAY, false) + togetherHtml(TODAY) + '</div>' +
    homeMoodCard() +
    '<div class="card"><div class="row"><h3>今天的行程</h3></div>' +
      (evs.length ? '<ul class="list">' + evs.map(evRow).join('') + '</ul>' : '<p class="empty">今天沒有行程</p>') + '</div>' +
    periodCard +
    '<button class="card tap" data-act="tab" data-v="board" style="font:inherit;color:inherit"><div class="row"><h3>黑板最新留言</h3><span>' + (unseenNotes().length ? '<span class="newtag">' + unseenNotes().length + ' 則新留言</span> ' : '') + (last ? byChip(last.by) : '') + '</span></div>' +
      (last ? noteView(last) + '<p class="muted" style="font-size:13px">' + fmtTs(last.ts) + '</p>' : '<p class="empty">黑板還是空的</p>') + '</button>' +
    '<div class="card"><div class="row"><h3>還沒做的清單</h3><button class="btn ghost small" data-act="tab" data-v="memo">備忘</button></div>' +
      (open.length ? '<ul class="list">' + open.slice(0, 3).map(m => '<li class="todo"><span class="tx">' + esc(m.text) + '</span>' + byChip(m.by) + '</li>').join('') + '</ul>' : '<p class="empty">全部都做完了</p>') + '</div>' +
    '<div class="card"><div class="row wrap"><span class="muted">外觀</span><div class="seg" role="group" aria-label="外觀">' + THEMES.map(t => '<button data-act="theme" data-v="' + t[0] + '" aria-pressed="' + (getTheme() === t[0]) + '">' + t[1] + '</button>').join('') + '</div></div>' +
      '<div class="row wrap"><span class="muted">新留言通知（' + notifyState() + '）</span><span class="row"><button class="btn ghost small" data-act="notifyOn">開啟</button><button class="btn ghost small" data-act="notifyTest">測試</button></span></div>' +
      '<div class="row wrap"><span class="muted">備份（班表、心情、黑板等全部）</span><span class="row"><button class="btn ghost small" data-act="backup">備份</button><button class="btn ghost small" data-act="restore">還原</button></span></div>' +
      '<div class="row"><span class="muted">這支手機是 ' + esc(S.me) + ' 在用</span><button class="btn ghost small" data-act="logout">換暗號／登出</button></div></div>';
  paintThumbs($('#home-body'));
}

function codeButtons(sel) {
  return CODE_ORDER.map(c => '<button class="code ' + cls(c) + '" data-act="paintCode" data-c="' + c + '" aria-pressed="' + (sel === c) + '">' + c + '</button>').join('') +
    '<button class="code clear" data-act="paintCode" data-c="" aria-pressed="' + (sel === '') + '">清除</button>';
}
function renderCal() {
  const cells = monthCells(calY, calM).map(d => {
    const k = iso(d), a = sh('him', k), b = sh('her', k), hasEv = S.events.some(e => e.d === k), both = a === '休' && b === '休';
    return '<button class="cell cal' + (d.getMonth() !== calM ? ' out' : '') + (k === TODAY ? ' today' : '') + (k === calSel && !paintMode ? ' sel' : '') + (both ? ' bothoff' : '') + '" data-act="calPick" data-d="' + k + '">' +
      '<span>' + d.getDate() + '</span>' + (hasEv ? '<i class="evdot"></i>' : '') +
      '<span class="shifts"><i class="s ' + cls(a) + '">' + (a || '·') + '</i><i class="s ' + cls(b) + '">' + (b || '·') + '</i></span></button>';
  }).join('');
  const sd = parse(calSel), list = S.events.filter(e => e.d === calSel).sort((a, b) => (a.t || '').localeCompare(b.t || ''));
  const st = monthStats(calY, calM);
  const tool = paintMode ?
    '<div class="card"><h3>快速輸入班表</h3><p class="muted" style="font-size:14px">先選人和班別，再點日期，點一下就填入。</p>' +
      '<div class="seg" style="align-self:flex-start" role="group" aria-label="填誰的班表"><button data-act="paintWho" data-w="him" aria-pressed="' + (paintWho === 'him') + '">老公</button><button data-act="paintWho" data-w="her" aria-pressed="' + (paintWho === 'her') + '">老婆</button></div>' +
      '<div class="codes">' + codeButtons(paintCode) + '</div>' +
      '<button class="btn" data-act="paintToggle">填完了</button></div>' : '';
  $('#cal-body').innerHTML =
    '<div class="card"><div class="mhead"><button class="btn ghost small" data-act="calPrev" aria-label="上個月">‹</button><span class="ttl">' + calY + ' 年 ' + (calM + 1) + ' 月</span><button class="btn ghost small" data-act="calNext" aria-label="下個月">›</button></div>' +
      '<div class="grid">' + wdRow() + cells + '</div>' +
      '<div class="legend"><span>每格上排老公、下排老婆</span><span><i class="s s-A">A</i>早班</span><span><i class="s s-B">B</i>晚班</span><span><i class="s s-AB">AB</i>兩班都上</span><span><i class="s s-X">C</i>C 班 12 ~ 21</span><span><i class="s s-off">休</i>休假</span></div>' +
      '<div class="legend"><span><i class="sw2" style="box-shadow:inset 0 0 0 2px var(--sOff)"></i>兩人同天休假</span><span><i class="sw2" style="background:var(--accent)"></i>當天有行程</span></div>' +
      (paintMode ? '' : '<div class="row wrap" style="justify-content:flex-start"><button class="btn ghost small" data-act="paintToggle">快速輸入班表</button><button class="btn ghost small" data-act="importForm">貼上整月班表</button></div>') + '</div>' +
    tool +
    (paintMode ? '' :
    '<div class="card"><div class="row"><h3>' + md(sd) + ' 週' + WD[sd.getDay()] + '</h3><button class="btn small" data-act="addEvent">新增行程</button></div>' +
      shiftRows(calSel, true) + togetherHtml(calSel) +
      (list.length ? '<ul class="list">' + list.map(evRow).join('') + '</ul>' : '') + '</div>') +
    (st.has ? '<div class="card"><h3>' + (calM + 1) + ' 月統計</h3><div class="stat"><span><b>兩人同天休假</b>　' + (st.off.length ? st.off.join('、') + '（' + st.off.length + ' 天）' : '這個月沒有') + '</span><span><b>老公</b>　' + cntText(st.cnt.him) + '</span><span><b>老婆</b>　' + cntText(st.cnt.her) + '</span></div></div>' : '');
}
function shiftForm(w, k) {
  const d = parse(k), c = sh(w, k);
  openSheet('<p class="eyebrow">' + md(d) + ' 週' + WD[d.getDay()] + '</p><h2>' + WHO[w] + '的班別</h2>' +
    CODE_ORDER.map(x => '<button class="opt" data-act="setShift" data-w="' + w + '" data-d="' + k + '" data-c="' + x + '" aria-pressed="' + (c === x) + '"><i class="s ' + cls(x) + '">' + x + '</i><span>' + codeTxt(x) + '</span></button>').join('') +
    '<button class="opt" data-act="setShift" data-w="' + w + '" data-d="' + k + '" data-c="" aria-pressed="' + (c === '') + '"><i class="s s-none">·</i><span>清除這天的班別</span></button>' +
    '<button class="btn ghost" data-act="close">取消</button>');
}
function importForm() {
  openSheet('<h2>貼上整月班表</h2><p class="muted" style="font-size:14px">一天一個班別，用空格隔開，從 1 號排到月底。可以用 A、B、AB、C、休、A+G1。</p>' +
    '<div class="row2"><label class="f"><span>月份</span><input id="im-month" type="month" value="' + calY + '-' + pad2(calM + 1) + '"></label>' +
    '<label class="f"><span>誰的班表</span><select id="im-who"><option value="him">老公</option><option value="her">老婆</option></select></label></div>' +
    '<label class="f"><span>班表內容</span><textarea id="im-text" placeholder="休 A AB B A ..."></textarea></label>' +
    '<div class="actions"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="doImport">匯入</button></div>');
}
function eventForm(d) {
  openSheet('<h2>新增行程</h2>' +
    '<label class="f"><span>標題</span><input id="ev-title" type="text" maxlength="40" placeholder="例如：一起看電影"></label>' +
    '<div class="row2"><label class="f"><span>日期</span><input id="ev-date" type="date" value="' + d + '"></label><label class="f"><span>時間（可留空）</span><input id="ev-time" type="time"></label></div>' +
    '<label class="f"><span>是誰的行程</span><select id="ev-who"><option value="both">兩人</option><option value="him"' + (meKey() === 'him' ? ' selected' : '') + '>老公</option><option value="her"' + (meKey() === 'her' ? ' selected' : '') + '>老婆</option></select></label>' +
    '<div class="actions"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="saveEvent">加入行事曆</button></div>');
}

function renderPeriod() {
  const P = per(), t = new Date();
  $('#p-last').value = P ? P.last : '';
  $('#p-cycle').value = P ? P.cycle : 28;
  $('#p-plen').value = P ? P.plen : 5;
  if (!P) {
    $('#period-body').innerHTML = '<div class="card"><h3>經期與排卵</h3><p>還沒有資料。請先在下面填「上次經期開始」的日期，月曆和預測就會出現。</p></div>';
    return;
  }
  const n = pnext(t, P), ph = n.i.ph;
  const l1 = ph === 'period' ? '經期第 ' + (n.i.idx + 1) + ' 天，預計第 ' + P.plen + ' 天結束' : (n.toOv === 0 ? '今天是預估排卵日' : '下次排卵日 ' + md(n.ov) + '，還有 ' + n.toOv + ' 天');
  const cells = monthCells(perY, perM).map(d => {
    const k = iso(d), i = pinfo(d, P), lv = S.love.some(x => x.d === k);
    return '<button class="cell ph-' + i.ph + (d.getMonth() !== perM ? ' out' : '') + (k === TODAY ? ' today' : '') + '" data-act="perPick" data-d="' + k + '"><span>' + d.getDate() + '</span><span class="heart">' + (lv ? '♥' : '') + '</span></button>';
  }).join('');
  $('#period-body').innerHTML =
    '<div class="card"><div class="row"><h3>今天</h3><span class="chip ' + ph + '">' + PHS[ph] + '</span></div><p class="big">' + PHL[ph] + '</p><p>' + l1 + '</p><p class="muted">下次經期預計 ' + md(n.nextStart) + '，還有 ' + n.toNext + ' 天</p></div>' +
    '<div class="card"><div class="mhead"><button class="btn ghost small" data-act="perPrev" aria-label="上個月">‹</button><span class="ttl">' + perY + ' 年 ' + (perM + 1) + ' 月</span><button class="btn ghost small" data-act="perNext" aria-label="下個月">›</button></div>' +
      '<div class="grid">' + wdRow() + cells + '</div>' +
      '<div class="legend"><span><i class="sw2" style="background:var(--period)"></i>經期</span><span><i class="sw2" style="background:var(--ovul)"></i>排卵日</span><span><i class="sw2" style="background:var(--fertile)"></i>易孕期（危險期）</span><span><i class="sw2" style="background:var(--line)"></i>安全期</span><span><span style="color:var(--heart)">♥</span> 愛愛紀錄</span></div></div>';
}
function dayForm(k) {
  const P = per(); if (!P) return;
  const d = parse(k), i = pinfo(d, P), logs = S.love.filter(x => x.d === k).sort((a, b) => a.t.localeCompare(b.t));
  const tm = k === TODAY ? pad2(new Date().getHours()) + ':' + pad2(new Date().getMinutes()) : '22:00';
  openSheet('<p class="eyebrow">' + md(d) + ' 週' + WD[d.getDay()] + '</p><h2>' + PHL[i.ph] + '</h2><p class="muted">週期第 ' + (i.idx + 1) + ' 天</p>' +
    '<h3>愛愛紀錄</h3>' +
    (logs.length ? '<ul class="list">' + logs.map(x => '<li class="ev"><span class="tm">' + x.t + '</span><span class="tt">已記錄</span><button class="x" data-act="delLove" data-id="' + x.id + '" aria-label="刪除紀錄">×</button></li>').join('') + '</ul>' : '<p class="empty">這天沒有紀錄</p>') +
    '<div class="inline"><input id="love-time" type="time" value="' + tm + '" aria-label="時間"><button class="btn" data-act="addLove" data-d="' + k + '">新增紀錄</button></div>' +
    '<button class="btn ghost" data-act="startHere" data-d="' + k + '">從這天開始算經期</button>' +
    '<button class="btn ghost" data-act="close">關閉</button>', { type: 'day', k });
}

function renderMemo() {
  $$('#tab-memo [data-act="memoMode"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === memoMode)));
  $('#memo-todo-form').hidden = memoMode !== 'todo'; $('#memo-note-form').hidden = memoMode !== 'note';
  let h = '';
  if (memoMode === 'todo') {
    const items = S.memos.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
    h = items.length ? '<div class="card"><ul class="list">' + items.map(m =>
      '<li class="todo' + (m.done ? ' done' : '') + '"><button class="check" data-act="toggleTodo" data-id="' + m.id + '" aria-label="完成" aria-pressed="' + !!m.done + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg></button><span class="tx">' + esc(m.text) + '</span>' + byChip(m.by) + '<button class="x" data-act="delMemo" data-id="' + m.id + '" aria-label="刪除">×</button></li>'
    ).join('') + '</ul></div>' : '<p class="empty">清單是空的</p>';
  } else {
    h = S.notes.length ? S.notes.map(n =>
      '<div class="card note-card"><div class="row"><h2>' + esc(n.title || '未命名') + '</h2><button class="x" data-act="delNote" data-id="' + n.id + '" aria-label="刪除筆記">×</button></div><p class="body">' + esc(n.body) + '</p><div>' + byChip(n.by) + '</div></div>'
    ).join('') : '<p class="empty">還沒有筆記</p>';
  }
  $('#memo-body').innerHTML = h;
}

function clampView(w, h) {
  view.z = Math.min(6, Math.max(1, view.z));
  view.ox = Math.min(0, Math.max(w - w * view.z, view.ox));
  view.oy = Math.min(0, Math.max(h - h * view.z, view.oy));
}
function resetView() { view = { z: 1, ox: 0, oy: 0 }; }
function paintPad() {
  const cv = $('#pad'), all = cur ? draft.concat([cur]) : draft;
  const pa = draftPhoto ? draftPA : 4 / 3;
  $('.padwrap').style.aspectRatio = String(pa);
  const r = cv.getBoundingClientRect(); clampView(r.width, r.height);
  paint(cv, all, draftPhoto, 'draft', view); $('#pad-hint').hidden = all.length > 0 || !!draftPhoto;
  $('#photo-clear').hidden = !draftPhoto;
  const zr = $('#zoom-reset'); zr.hidden = view.z < 1.02; zr.textContent = '還原大小（' + Math.round(view.z * 100) + '%）';
}
const fmtTm = ts => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
function dayLabel(ts) {
  const d = new Date(ts), k = iso(d);
  if (k === TODAY) return '今天';
  if (k === iso(addDays(new Date(), -1))) return '昨天';
  return md(d) + ' 週' + WD[d.getDay()];
}
function reactRow(n) {
  const mk = meKey(), r = n.react || {};
  const others = ['him', 'her'].filter(k => r[k]).map(k => WHO[k] + ' ' + r[k]).join('　');
  return '<div class="react-row">' + REACTS.map(e => '<button class="rx" data-act="react" data-id="' + n.id + '" data-e="' + e + '" aria-pressed="' + (r[mk] === e) + '" aria-label="回應 ' + e + '">' + e + '</button>').join('') +
    (others ? '<span class="muted react-who">' + others + '</span>' : '') + '</div>';
}
/* 新留言提示：記下「我這支手機看到哪一則」，對方比這更新的留言就算新的 */
const seenKey = () => 'ourtwo.seen.' + meKey() + '.' + (FID || '').slice(0, 8);
function seenTs() { const v = LS.get(seenKey()); if (v == null) { const t = Date.now(); LS.set(seenKey(), String(t)); return t; } return Number(v) || 0; }
const unseenNotes = () => { const s = seenTs(); return S.board.filter(n => n.by !== S.me && n.ts > s); };
function updateBadge() {
  const c = curTab === 'board' ? 0 : unseenNotes().length, b = $('.tabs [data-v="board"]');
  if (!b) return;
  let dot = b.querySelector('.nbadge');
  if (c) { if (!dot) { dot = document.createElement('i'); dot.className = 'nbadge'; b.appendChild(dot); } dot.textContent = c > 9 ? '9+' : String(c); }
  else if (dot) dot.remove();
  try { if (c && navigator.setAppBadge) navigator.setAppBadge(c); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) { /* ignore */ }
}
function renderBoard() {
  paintPad();
  const un = unseenNotes(); un.forEach(n => boardNew.add(n.id));
  if (un.length) LS.set(seenKey(), String(Math.max.apply(null, un.map(n => n.ts))));
  let h = '', lastDay = '';
  S.board.forEach(n => {
    const k = iso(new Date(n.ts));
    if (k !== lastDay) { lastDay = k; h += '<h3 class="daygroup">' + dayLabel(n.ts) + '</h3>'; }
    h += '<article class="card note"><div class="row"><span>' + byChip(n.by) + (boardNew.has(n.id) ? ' <span class="newtag">新</span>' : '') + '</span><span class="muted" style="font-size:13px">' + fmtTm(n.ts) + '</span></div>' +
      noteView(n) + reactRow(n) + '</article>';
  });
  if (!S.board.length) h = '<p class="empty">黑板還是空的，畫一隻醜醜的小動物吧</p>';
  else if (S.board.length >= boardLimit) h += '<button class="btn ghost" data-act="moreBoard">看更早的留言</button>';
  $('#wall').innerHTML = h;
  paintThumbs($('#wall'));
}

const RENDER = { home: renderHome, cal: renderCal, period: renderPeriod, memo: renderMemo, board: renderBoard };
function showTab(n) {
  curTab = n;
  if (n !== 'board') boardNew.clear();
  $$('section[data-tab]').forEach(s => { s.hidden = s.dataset.tab !== n; });
  $$('.tabs button').forEach(b => { if (b.dataset.v === n) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  RENDER[n](); updateBadge(); window.scrollTo(0, 0);
}
function rerender() {
  if (!booted) return;
  RENDER[curTab](); updateBadge();
  if (curSheet && curSheet.type === 'day' && !$('#sheet').hidden) dayForm(curSheet.k);
}
function updateWho() { $$('.top [data-act="me"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.me))); }

/* ---------- 同步 ---------- */
function syncErr(e) {
  console.error(e);
  toast(e && e.code === 'permission-denied' ? '沒有權限，請確認 Firestore 規則已發布' : '同步發生問題：' + ((e && e.code) || (e && e.message) || ''));
}
function listItems(name, key, map) {
  return onSnapshot(col(name), snap => { S[key] = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); if (map) map(); rerender(); }, syncErr);
}
function subBoard() {
  if (boardUnsub) { try { boardUnsub(); } catch (e) { /* ignore */ } }
  boardUnsub = onSnapshot(query(col('board'), orderBy('ts', 'desc'), limit(boardLimit)), snap => {
    S.board = snap.docs.map(d => {
      const v = d.data(); let strokes = [];
      try { strokes = JSON.parse(v.strokesJson || '[]'); } catch (e) { strokes = []; }
      if (!v.v) strokes = strokes.map(s => s.t === 'st' ? Object.assign({}, s, { y: s.y * 0.75 }) : Object.assign({}, s, { p: s.p.map(q => [q[0], q[1] * 0.75]) }));
      return { id: d.id, by: v.by, ts: v.ts, caption: v.caption || '', strokes, photo: v.photo || '', pa: v.pa || 4 / 3, react: v.react || {} };
    });
    rerender();
  }, syncErr);
}

/* 字體改用內海字體（放在網站上）。清掉之前存在雲端的小熊貓字體檔與手機快取。 */
async function cleanupOldFont() {
  try { await caches.delete('ourtwo-font-v1'); } catch (e) { /* ignore */ }
  try { const m = await getDoc(dref('fonts', 'meta')); if (!m.exists()) return; const n = m.data().parts || 0; for (let i = 0; i < n; i++) await deleteDoc(dref('fonts', 'p' + i)); await deleteDoc(dref('fonts', 'meta')); } catch (e) { /* ignore */ }
}
function startSync() {
  stopSync();
  unsubs.push(onSnapshot(col('shifts'), snap => { const o = {}; snap.forEach(d => { o[d.id] = d.data(); }); S.shifts = o; rerender(); }, syncErr));
  unsubs.push(listItems('events', 'events'));
  unsubs.push(listItems('memos', 'memos', () => S.memos.sort((a, b) => (b.ts || 0) - (a.ts || 0))));
  unsubs.push(listItems('notes', 'notes', () => S.notes.sort((a, b) => (b.ts || 0) - (a.ts || 0))));
  unsubs.push(listItems('love', 'love'));
  subBoard();
  subMood();
  unsubs.push(subPlay());
  cleanupOldFont();
  unsubs.push(onSnapshot(dref('settings', 'period'), snap => { S.period = snap.exists() ? snap.data() : null; rerender(); }, syncErr));
  synced = true;
}
function stopSync() { if (moodUnsub) { try { moodUnsub(); } catch (e) { /* ignore */ } moodUnsub = null; } if (boardUnsub) { try { boardUnsub(); } catch (e) { /* ignore */ } boardUnsub = null; } unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; synced = false; }

function ensureAuth() {
  return new Promise((resolve, reject) => {
    let done = false, off = null;
    off = onAuthStateChanged(auth, u => {
      if (done) return;
      done = true;
      if (off) off();
      if (u) resolve(u); else signInAnonymously(auth).then(r => resolve(r.user), reject);
    });
  });
}
async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ourtwo-v1|' + text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function setNet() { const el = $('#net'); el.hidden = navigator.onLine; el.textContent = '目前離線，恢復網路後會自動同步。'; }

async function boot() {
  if (!FID) { $('#shell').hidden = true; $('#login').hidden = false; return; }
  $('#login').hidden = true; $('#shell').hidden = false;
  const tn = new Date(); $('#today-label').textContent = tn.getFullYear() + ' 年 ' + md(tn) + ' 週' + WD[tn.getDay()];
  updateWho(); setNet();
  booted = true; showTab(curTab);
  try { await ensureAuth(); startSync(); } catch (e) { toast('連線失敗，恢復網路後會自動重試'); }
}

/* ---------- 動作 ---------- */
const ACT = {
  tab(el) { showTab(el.dataset.v); },
  me(el) { S.me = el.dataset.v; LS.set('ourtwo.me', S.me); updateWho(); boardNew.clear(); RENDER[curTab](); updateBadge(); },
  close: closeSheet,
  loginWho(el) { loginWho = el.dataset.v; $$('#login [data-act="loginWho"]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  async login() {
    const err = $('#login-err'), btn = $('#login-btn'); err.hidden = true;
    const code = $('#login-code').value.normalize('NFKC').trim();
    if (code.length < 10) { err.textContent = '暗號至少要 10 個字。'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      await ensureAuth();
      FID = await sha256hex(code);
      LS.set('ourtwo.fid', FID); LS.set('ourtwo.me', loginWho); S.me = loginWho;
      await boot();
    } catch (e) {
      err.textContent = '登入失敗：' + (e.code || e.message) + '。請確認有網路，且 Firebase 已啟用匿名登入。'; err.hidden = false;
    }
    btn.disabled = false;
  },
  theme(el) { LS.set('ourtwo.theme', el.dataset.v); applyTheme(); renderHome(); },
  async notifyOn() {
    if (!('Notification' in window) || !('PushManager' in window)) { toast('請從主畫面圖示打開 App（需要 iOS 16.4 以上）'); return; }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('沒有允許通知，請到 iPhone 設定 > 通知 > Ourtwo 開啟'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(VAPID_PUB) });
      await setDoc(dref('push', meKey()), { sub: JSON.stringify(sub), who: S.me, ts: Date.now() });
      toast('通知已開啟，這支手機會收到另一半的新留言');
      rerender();
    } catch (e) { toast('開啟通知失敗：' + (e.message || e.code || e)); }
  },
  async notifyTest() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') { toast('請先按「開啟」並允許通知'); return; }
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Ourtwo', { body: '測試成功，通知可以顯示 💌', icon: 'icon-192.png', tag: 'ourtwo-test' });
    } catch (e) { toast('測試失敗：' + (e.message || e)); }
  },
  notifyHelper() {
    openSheet('<h3>通知小幫手的設定值</h3><p class="muted">這是你們家的編號（FID），設定 Cloudflare 時要用。請不要傳給別人。按「複製」後貼到 Cloudflare 的 FID 欄位。</p>' +
      '<textarea id="helper-ta" readonly rows="3" style="width:100%;font-size:13px;word-break:break-all">' + esc(FID) + '</textarea>' +
      '<div class="actions"><button class="btn ghost" data-act="close">關閉</button><button class="btn" data-act="copyHelper">複製</button></div>');
  },
  copyHelper() {
    const ta = $('#helper-ta'); if (!ta) return;
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ok) { toast('已複製'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(() => toast('已複製'), () => toast('沒複製成功，請長按文字框，選「全選」再「拷貝」'));
    else toast('沒複製成功，請長按文字框，選「全選」再「拷貝」');
  },
  async backup(el) {
    el.disabled = true; toast('備份中…');
    try {
      const out = { app: 'ourtwo', version: 1, exported: new Date().toISOString(), data: {} };
      let n = 0;
      for (const c of ['shifts', 'events', 'memos', 'notes', 'love', 'settings', 'board', 'mood', 'play']) {
        const snap = await getDocs(col(c)); out.data[c] = {};
        snap.forEach(d => { out.data[c][d.id] = d.data(); n++; });
      }
      const text = JSON.stringify(out);
      const name = 'ourtwo-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Ourtwo 備份' }); toast('已備份 ' + n + ' 筆'); el.disabled = false; return; } catch (e) { if (e && e.name === 'AbortError') { el.disabled = false; return; } }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      toast('已備份 ' + n + ' 筆');
    } catch (e) { toast('備份失敗：' + (e.code || e.message)); }
    el.disabled = false;
  },
  restore() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!j || j.app !== 'ourtwo' || !j.data) throw new Error('不是 Ourtwo 的備份檔');
        let n = 0; Object.keys(j.data).forEach(c => { n += Object.keys(j.data[c]).length; });
        if (!confirm('要把備份裡的 ' + n + ' 筆資料放回去嗎？\n同編號的資料會被備份內容蓋過，其他資料不會被刪除。')) return;
        for (const c of Object.keys(j.data)) {
          if (!['shifts', 'events', 'memos', 'notes', 'love', 'settings', 'board', 'mood', 'play'].includes(c)) continue;
          for (const id of Object.keys(j.data[c])) await setDoc(dref(c, id), j.data[c][id]);
        }
        toast('已還原 ' + n + ' 筆');
      } catch (e) { toast('還原失敗：' + (e.code || e.message)); }
    });
    inp.click();
  },
  logout(el) {
    if (el.dataset.arm !== '1') { el.dataset.arm = '1'; el.textContent = '再按一次確定登出'; return; }
    LS.del('ourtwo.fid'); location.reload();
  },
  calPrev() { calM--; if (calM < 0) { calM = 11; calY--; } renderCal(); },
  calNext() { calM++; if (calM > 11) { calM = 0; calY++; } renderCal(); },
  calPick(el) {
    const k = el.dataset.d;
    if (paintMode) { remoteShift(paintWho, k, paintCode); return; }
    calSel = k; const d = parse(k); calY = d.getFullYear(); calM = d.getMonth(); renderCal();
  },
  paintToggle() { paintMode = !paintMode; if (paintMode) paintWho = meKey(); renderCal(); },
  paintWho(el) { paintWho = el.dataset.w; renderCal(); },
  paintCode(el) { paintCode = el.dataset.c; renderCal(); },
  editShift(el) { shiftForm(el.dataset.w, el.dataset.d); },
  setShift(el) { remoteShift(el.dataset.w, el.dataset.d, el.dataset.c); closeSheet(); },
  importForm,
  doImport() {
    const ym = $('#im-month').value;
    if (!ym) { toast('請選擇月份'); return; }
    const parts = ym.split('-').map(Number), y = parts[0], m = parts[1], n = new Date(y, m, 0).getDate();
    const toks = $('#im-text').value.normalize('NFKC').toUpperCase().split(/[\s,，、]+/).filter(Boolean);
    if (toks.length !== n) { toast(m + ' 月有 ' + n + ' 天，你貼了 ' + toks.length + ' 個'); return; }
    const bad = toks.find(t => !CODES[t]);
    if (bad) { toast('看不懂這個班別：' + bad); return; }
    const obj = {}; toks.forEach((t, i) => { obj[pad2(i + 1)] = t; });
    wr(setDoc(dref('shifts', ym), { [$('#im-who').value]: obj }, { merge: true }));
    calY = y; calM = m - 1; closeSheet(); toast('已匯入 ' + m + ' 月班表'); renderCal();
  },
  addEvent() { eventForm(calSel); },
  saveEvent() {
    const title = $('#ev-title').value.trim(), d = $('#ev-date').value;
    if (!title) { toast('請先輸入標題'); return; }
    if (!d) { toast('請選擇日期'); return; }
    wr(addDoc(col('events'), { d, t: $('#ev-time').value || '', title, who: $('#ev-who').value, by: S.me }));
    calSel = d; const x = parse(d); calY = x.getFullYear(); calM = x.getMonth(); closeSheet(); renderCal(); toast('已加入行事曆');
  },
  delEvent(el) { wr(deleteDoc(dref('events', el.dataset.id))); },
  perPrev() { perM--; if (perM < 0) { perM = 11; perY--; } renderPeriod(); },
  perNext() { perM++; if (perM > 11) { perM = 0; perY++; } renderPeriod(); },
  perPick(el) { dayForm(el.dataset.d); },
  addLove(el) { const t = $('#love-time').value; if (!t) { toast('請選擇時間'); return; } wr(addDoc(col('love'), { d: el.dataset.d, t })); },
  delLove(el) { wr(deleteDoc(dref('love', el.dataset.id))); },
  startHere(el) { savePeriod({ last: el.dataset.d }); closeSheet(); toast('已從 ' + md(parse(el.dataset.d)) + ' 重新計算'); },
  startToday() { savePeriod({ last: TODAY }); toast('已從今天開始計算'); },
  memoMode(el) { memoMode = el.dataset.v; renderMemo(); },
  addTodo() { const i = $('#todo-text'), v = i.value.trim(); if (!v) { toast('請先輸入內容'); return; } wr(addDoc(col('memos'), { text: v, done: false, by: S.me, ts: Date.now() })); i.value = ''; },
  toggleTodo(el) { const m = S.memos.find(x => x.id === el.dataset.id); if (m) wr(updateDoc(dref('memos', m.id), { done: !m.done })); },
  delMemo(el) { wr(deleteDoc(dref('memos', el.dataset.id))); },
  addNote() {
    const t = $('#note-title').value.trim(), b = $('#note-body').value.trim();
    if (!t && !b) { toast('請先輸入內容'); return; }
    wr(addDoc(col('notes'), { title: t, body: b, by: S.me, ts: Date.now() })); $('#note-title').value = ''; $('#note-body').value = '';
  },
  delNote(el) { wr(deleteDoc(dref('notes', el.dataset.id))); },
  color(el) { color = el.dataset.c; $$('.sw').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  brush(el) { brush = parseFloat(el.dataset.w); $$('#brushes button').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  tool(el) {
    tool = el.dataset.v; $$('#tools button').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
    $('#stickers').hidden = tool !== 'sticker'; $('#swatches').hidden = tool === 'eraser' || tool === 'sticker';
  },
  sticker(el) { stickerSel = el.dataset.s; $$('#stickers button').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  photoPick() { $('#photo').click(); },
  photoClear() { draftPhoto = ''; draftPA = 4 / 3; paintPad(); },
  zoomReset() { resetView(); paintPad(); },
  undo() { draft.pop(); paintPad(); },
  clearPad() { draft = []; draftPhoto = ''; draftPA = 4 / 3; resetView(); paintPad(); },
  react(el) {
    const n = S.board.find(x => x.id === el.dataset.id); if (!n) return;
    const mk = meKey(), e = el.dataset.e, same = n.react && n.react[mk] === e;
    wr(updateDoc(dref('board', n.id), { ['react.' + mk]: same ? deleteField() : e }));
  },
  moreBoard() { boardLimit += 30; subBoard(); },
  post() {
    const cap = $('#caption').value.trim();
    if (!draft.length && !cap && !draftPhoto) { toast('先畫點東西或寫一句話'); return; }
    const json = JSON.stringify(draft);
    if (json.length + draftPhoto.length > 900000) { toast('這張畫得太滿了，請擦掉一些再貼'); return; }
    const note = { by: S.me, ts: Date.now(), caption: cap, strokesJson: json, v: 2 };
    if (draftPhoto) { note.photo = draftPhoto; note.pa = draftPA; }
    wr(addDoc(col('board'), note));
    draft = []; draftPhoto = ''; draftPA = 4 / 3; resetView(); $('#caption').value = ''; paintPad(); toast('已貼上黑板');
  }
};

function remoteShift(w, k, c) {
  const mid = k.slice(0, 7), d = k.slice(8);
  wr(setDoc(dref('shifts', mid), { [w]: { [d]: c ? c : deleteField() } }, { merge: true }));
}
function savePeriod(patch) {
  const P = per();
  wr(setDoc(dref('settings', 'period'), Object.assign({ cycle: P ? P.cycle : 28, plen: P ? P.plen : 5 }, patch), { merge: true }));
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const f = ACT[el.dataset.act]; if (f) f(el, e);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'todo-text') ACT.addTodo();
  if (e.key === 'Enter' && e.target.id === 'login-code') ACT.login();
});

/* 週期設定 */
function readSettings() {
  const l = $('#p-last').value, c = parseInt($('#p-cycle').value, 10), p = parseInt($('#p-plen').value, 10), patch = {};
  if (l) patch.last = l;
  if (c >= 20 && c <= 45) patch.cycle = c;
  if (p >= 2 && p <= 10) patch.plen = p;
  if (!patch.last && !per()) { toast('請先填上次經期開始的日期'); return; }
  savePeriod(patch);
}
['p-last', 'p-cycle', 'p-plen'].forEach(id => $('#' + id).addEventListener('change', readSettings));

/* 手指繪圖：一根手指畫畫；兩根手指放大縮小、拖動畫面（不會畫出東西） */
const padEl = $('#pad');
const ptrs = new Map();
let gest = null, gestLock = false;
function pt(e) {
  const r = padEl.getBoundingClientRect();
  const wx = ((e.clientX - r.left) - view.ox) / view.z, wy = ((e.clientY - r.top) - view.oy) / view.z;
  return [Math.round(wx / r.width * 1000) / 1000, Math.round(wy / r.width * 1000) / 1000];
}
function twoPts() {
  const r = padEl.getBoundingClientRect(), v = Array.from(ptrs.values()).slice(0, 2);
  const a = { x: v[0].x - r.left, y: v[0].y - r.top }, b = { x: v[1].x - r.left, y: v[1].y - r.top };
  return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, r };
}
padEl.addEventListener('pointerdown', e => {
  e.preventDefault(); try { padEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size >= 2) {
    cur = null; gestLock = true;
    const t = twoPts();
    gest = { d0: t.d, z0: view.z, wx: (t.mx - view.ox) / view.z, wy: (t.my - view.oy) / view.z };
    paintPad(); return;
  }
  if (gestLock) return;
  const p = pt(e);
  if (tool === 'sticker') cur = { t: 'st', s: stickerSel, x: p[0], y: p[1], z: brush < 4 ? 0.1 : brush < 7 ? 0.16 : 0.26 };
  else { cur = { c: color, w: brush, p: [p] }; if (tool !== 'chalk') cur.k = tool; }
  paintPad();
});
padEl.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gest && ptrs.size >= 2) {
    const t = twoPts();
    view.z = Math.min(6, Math.max(1, gest.z0 * t.d / gest.d0));
    view.ox = t.mx - gest.wx * view.z; view.oy = t.my - gest.wy * view.z;
    paintPad(); return;
  }
  if (!cur) return;
  const p = pt(e); if (cur.t === 'st') { cur.x = p[0]; cur.y = p[1]; } else cur.p.push(p); paintPad();
});
function endStroke() { if (!cur) return; draft.push(cur); cur = null; paintPad(); }
function upPtr(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) gest = null;
  if (ptrs.size === 0) { gestLock = false; endStroke(); }
}
padEl.addEventListener('pointerup', upPtr);
padEl.addEventListener('pointercancel', e => { if (ptrs.size <= 1) cur = null; upPtr(e); });
['gesturestart', 'gesturechange'].forEach(n => padEl.addEventListener(n, e => e.preventDefault()));
window.addEventListener('resize', () => { if (booted && ['board', 'home', 'mood', 'play'].includes(curTab)) RENDER[curTab](); });
/* ---------- 心情筆記 ---------- */
/* 一人一天一篇，文件編號是「日期_him／her」。兩人互看，可以按愛心回應。手繪小圖跟黑板用同一套畫法。 */
const MOODS = [['happy', '😄', '開心'], ['love', '🥰', '幸福'], ['calm', '😌', '平靜'], ['tired', '😴', '好累'], ['sad', '😢', '難過'], ['angry', '😠', '生氣'], ['sick', '🤒', '不舒服'], ['stress', '🤯', '壓力大']];
const MOOD_OF = Object.fromEntries(MOODS.map(m => [m[0], m]));
const MINK = ['#4a3f45', '#e76f6f', '#f4a3b5', '#f6a04d', '#e9c24a', '#7cbf6e', '#5aa9e6', '#a57fd9'];
let moodLimit = 40, moodUnsub = null;
let mDate = TODAY, mMood = '', mDraft = [], mCur = null, mInk = MINK[0], mPhoto = '', mPA = 4 / 3, mLoaded = '';
const moodId = (d, mk) => d + '_' + mk;
function subMood() {
  if (moodUnsub) { try { moodUnsub(); } catch (e) { /* ignore */ } }
  moodUnsub = onSnapshot(query(col('mood'), orderBy('d', 'desc'), limit(moodLimit)), snap => {
    S.mood = snap.docs.map(d => {
      const v = d.data(); let strokes = [];
      try { strokes = JSON.parse(v.strokesJson || '[]'); } catch (e) { strokes = []; }
      return { id: d.id, by: v.by, d: v.d, ts: v.ts || 0, mood: v.mood || '', did: v.did || '', text: v.text || '', strokes, photo: v.photo || '', pa: v.pa || 4 / 3, react: v.react || {} };
    });
    rerender();
  }, syncErr);
}
/* 把自己那天寫過的內容放進編輯區（只在換日期或第一次進來時，避免打字打到一半被蓋掉） */
function loadMoodEditor(force) {
  const key = moodId(mDate, meKey());
  if (!force && mLoaded === key) return;
  const e = S.mood.find(x => x.id === key);
  mMood = e ? e.mood : ''; mDraft = e ? e.strokes.slice() : []; mPhoto = e ? e.photo : ''; mPA = e ? e.pa : 4 / 3;
  $('#mood-did').value = e ? e.did : ''; $('#mood-text').value = e ? e.text : '';
  mLoaded = key;
}
function paintM() {
  $('#mpad').parentElement.style.aspectRatio = '4 / 3';
  paint($('#mpad'), mCur ? mDraft.concat([mCur]) : mDraft, '', 'mpad');
  const img = $('#mphoto-prev'); img.hidden = !mPhoto; if (mPhoto) img.src = mPhoto;
  $('#mphoto-clear').hidden = !mPhoto;
}
function moodCard(e) {
  const m = MOOD_OF[e.mood], mine = e.by === S.me, other = e.by === '老公' ? 'her' : 'him';
  const heart = e.react[mine ? other : meKey()];
  return '<article class="card mood-entry">' +
    '<div class="row"><span class="mood-face">' + (m ? m[1] : '📝') + '</span><span class="mood-meta">' + byChip(e.by) + (m ? ' <span class="muted">' + m[2] + '</span>' : '') + '</span>' +
      (mine ? '<button class="btn ghost small" data-act="mEdit" data-d="' + e.d + '">編輯</button>' : '<button class="btn ghost small rx" data-act="mHeart" data-id="' + e.id + '" aria-pressed="' + (!!heart) + '">' + (heart ? '❤️' : '🤍') + '</button>') + '</div>' +
    (e.did ? '<p class="mood-did"><b>做了什麼</b>　' + esc(e.did) + '</p>' : '') +
    (e.text ? '<p class="mood-text">' + esc(e.text) + '</p>' : '') +
    (e.strokes.length ? '<canvas class="mthumb" data-mid="' + e.id + '" style="aspect-ratio:4/3"></canvas>' : '') +
    (e.photo ? '<img class="mphoto" src="' + e.photo + '" alt="照片" loading="lazy">' : '') +
    (mine && heart ? '<p class="muted" style="font-size:13px">' + (e.by === '老公' ? '老婆' : '老公') + ' 按了 ❤️</p>' : '') +
    '</article>';
}
function renderMood() {
  if (!$('#moods').childElementCount) $('#moods').innerHTML = MOODS.map(m => '<button data-act="mMood" data-v="' + m[0] + '" aria-pressed="false"><span>' + m[1] + '</span>' + m[2] + '</button>').join('');
  if (!$('#mswatches').childElementCount) $('#mswatches').innerHTML = MINK.map((c, i) => '<button class="msw" data-act="mInk" data-c="' + c + '" style="--c:' + c + '" aria-pressed="' + (i === 0) + '" aria-label="顏色"></button>').join('');
  loadMoodEditor(false);
  $$('#moods button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === mMood)));
  $('#mood-title').textContent = mDate === TODAY ? '今天的心情' : md(parse(mDate)) + ' 的心情';
  $('#mood-today').hidden = mDate === TODAY;
  paintM();
  const days = [];
  S.mood.forEach(e => { let g = days.find(x => x.d === e.d); if (!g) { g = { d: e.d, list: [] }; days.push(g); } g.list.push(e); });
  $('#mood-feed').innerHTML = days.length ? days.map(g => {
    const dt = parse(g.d);
    return '<div class="daygroup"><h3 class="daylabel">' + (g.d === TODAY ? '今天' : md(dt)) + ' 週' + WD[dt.getDay()] + '</h3>' + g.list.sort((a, b) => a.by === S.me ? -1 : b.by === S.me ? 1 : 0).map(moodCard).join('') + '</div>';
  }).join('') + (S.mood.length >= moodLimit ? '<button class="btn ghost" data-act="mMore">看更早的</button>' : '') : '<p class="empty">還沒有心情筆記，寫下今天的第一篇吧</p>';
  $$('canvas[data-mid]', $('#mood-feed')).forEach(cv => { const e = S.mood.find(x => x.id === cv.dataset.mid); if (e) paint(cv, e.strokes, '', e.id); });
}
function homeMoodCard() {
  const mine = S.mood.find(x => x.id === moodId(TODAY, meKey())), theirs = S.mood.find(x => x.id === moodId(TODAY, meKey() === 'him' ? 'her' : 'him'));
  const face = e => e && MOOD_OF[e.mood] ? MOOD_OF[e.mood][1] + ' ' + MOOD_OF[e.mood][2] : (e ? '📝 寫好了' : '還沒寫');
  return '<button class="card tap" data-act="tab" data-v="mood" style="font:inherit;color:inherit"><div class="row"><h3>今天的心情</h3></div>' +
    '<div class="row"><span>' + byChip('老公') + ' ' + face(S.me === '老公' ? mine : theirs) + '</span><span>' + byChip('老婆') + ' ' + face(S.me === '老婆' ? mine : theirs) + '</span></div></button>';
}

/* ---------- 玩 ---------- */
const EAT = ['便當', '拉麵', '火鍋', '滷肉飯', '牛肉麵', '壽司', '麥當勞', '義大利麵', '炒飯', '鍋燒意麵', '韓式料理', '咖哩飯'];
const DRINK = ['珍珠奶茶', '紅茶拿鐵', '四季春', '美式咖啡', '多多綠', '冬瓜檸檬', '水果茶', '奶蓋紅茶', '楊枝甘露', '烏龍鮮奶'];
const WCOL = ['#f4b6c2', '#f9d98a', '#a9d4f0', '#b9e0ae', '#f7c08f', '#d3bdf0', '#f3a6a6', '#9fd8cf'];
const TRUTH = ['第一次見到我的時候，你心裡在想什麼？', '我做過最讓你心動的一件小事是什麼？', '你最喜歡我身上的哪個地方？', '如果明天放假一整天，你最想跟我做什麼？', '我哪個習慣你其實偷偷覺得很可愛？', '最近一次被我惹生氣是什麼時候？', '你覺得我們最像的地方是什麼？', '你最想跟我一起去的國家是哪裡？', '如果可以回到過去，你想重來我們的哪一天？', '我做的哪道菜（或買的哪樣東西）你最喜歡？', '你覺得十年後的我們會在做什麼？', '你最想對我說，但一直沒說出口的話？', '我們吵架時，你最希望我怎麼做？', '你覺得我最近壓力大的原因是什麼？', '你記得我們第一次約會吃了什麼嗎？', '用三個詞形容我。', '你最喜歡我們的哪張合照？為什麼？', '最近有什麼事讓你覺得「還好有你」？', '你小時候的夢想是什麼？', '如果我變成一隻動物，你覺得會是什麼？', '你最想跟我一起完成的一件事？', '你覺得我們家最需要添購的東西是什麼？', '今天上班最累的瞬間是什麼時候？', '如果只能選一樣，你選消夜還是早餐約會？', '我讓你覺得最安心的是什麼時候？', '你覺得我最近有哪裡變了？', '有什麼小事是你希望我多做一點的？', '最想收到我送的什麼禮物？', '週末早上，你理想的起床方式是？', '說一件今天想謝謝我的事。'];
const QUIZ = [['週末最想怎麼過？', ['在家耍廢', '出去走走', '吃大餐', '睡到自然醒']], ['消夜首選？', ['鹹酥雞', '泡麵', '滷味', '不吃消夜']], ['旅行比較想去？', ['日本', '韓國', '海島', '台灣環島']], ['吵架後誰會先道歉？', ['老公', '老婆', '看情況', '都不會']], ['家裡誰比較會花錢？', ['老公', '老婆', '一樣', '都很省']], ['下雨天最適合？', ['看電影', '睡覺', '吃火鍋', '打電動']], ['理想的約會時間？', ['早上', '下午', '晚上', '半夜']], ['比較喜歡的寵物？', ['貓', '狗', '兔子', '都不要']], ['最常一起吃的？', ['火鍋', '拉麵', '便當', '燒肉']], ['生日最想收到？', ['驚喜派對', '一封手寫信', '想要很久的東西', '一起去旅行']], ['誰比較會賴床？', ['老公', '老婆', '一樣', '都不會']], ['誰比較會記仇？', ['老公', '老婆', '一樣', '都不會']], ['放假第一件事？', ['補眠', '追劇', '出門吃', '打掃']], ['最想一起學的？', ['煮飯', '游泳', '跳舞', '外語']], ['家裡誰負責找東西？', ['老公', '老婆', '一起找', '找不到就算了']], ['最喜歡的季節？', ['春天', '夏天', '秋天', '冬天']], ['手搖飲的甜度？', ['全糖', '半糖', '微糖', '無糖']], ['誰比較怕黑？', ['老公', '老婆', '一樣', '都不怕']], ['理想的家？', ['市區公寓', '郊區透天', '海邊小屋', '鄉下農舍']], ['一起看電影選？', ['喜劇', '恐怖片', '愛情片', '動畫']]];
const RPS = [['rock', '✊', '石頭'], ['scissors', '✌️', '剪刀'], ['paper', '🖐️', '布']];
const MARK = { him: '🐻', her: '🐰' };
let playKind = 'eat', wheelRot = 0, wheelSpin = false, wheelResult = '', truthIdx = -1;
const otherKey = mk => mk === 'him' ? 'her' : 'him';
const PL = k => (S.play && S.play[k]) || null;
function wheelList() { const w = PL('wheel') || {}; const l = w[playKind]; return (l && l.length ? l : (playKind === 'eat' ? EAT : DRINK)).slice(0, 24); }
function drawWheel() {
  const cv = $('#wheel'); if (!cv) return;
  const list = wheelList(), r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.round(r.width);
  if (!w) return;
  cv.width = w * dpr; cv.height = w * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = w / 2, R = c - 4, seg = Math.PI * 2 / list.length;
  list.forEach((t, i) => {
    const a0 = -Math.PI / 2 + i * seg;
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, a0, a0 + seg); g.closePath();
    g.fillStyle = WCOL[i % WCOL.length]; g.fill(); g.strokeStyle = '#fffaf3'; g.lineWidth = 2; g.stroke();
    g.save(); g.translate(c, c); g.rotate(a0 + seg / 2); g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillStyle = '#4a3f45'; g.font = Math.max(11, Math.min(17, R * 0.12)) + 'px Naikai, sans-serif';
    g.fillText(t.length > 6 ? t.slice(0, 6) + '…' : t, R - 10, 0); g.restore();
  });
  g.beginPath(); g.arc(c, c, R * 0.12, 0, Math.PI * 2); g.fillStyle = '#fffaf3'; g.fill();
  cv.style.transform = 'rotate(' + wheelRot + 'deg)';
}
function wheelHtml() {
  return '<div class="card play-card"><div class="row"><h3>今天' + (playKind === 'eat' ? '吃' : '喝') + '什麼？</h3><div class="seg" role="group" aria-label="輪盤"><button data-act="wKind" data-v="eat" aria-pressed="' + (playKind === 'eat') + '">吃</button><button data-act="wKind" data-v="drink" aria-pressed="' + (playKind === 'drink') + '">喝</button></div></div>' +
    '<div class="wheelwrap"><div class="wheel-pin">▼</div><canvas id="wheel"></canvas></div>' +
    '<p class="wheel-result" id="wheel-result">' + (wheelResult ? '就決定是：<b>' + esc(wheelResult) + '</b>！' : '按下面的按鈕轉轉看') + '</p>' +
    '<div class="row"><button class="btn" data-act="wSpin">轉！</button><button class="btn ghost small" data-act="wEdit">編輯選項</button></div></div>';
}
function truthHtml() {
  return '<div class="card play-card"><div class="row"><h3>真心話小卡</h3><span class="muted">輪流回答</span></div>' +
    '<div class="truth-card">' + (truthIdx < 0 ? '抽一張卡，看看今天要回答什麼' : esc(TRUTH[truthIdx])) + '</div>' +
    '<button class="btn" data-act="tDraw">' + (truthIdx < 0 ? '抽一張' : '換一張') + '</button></div>';
}
function quizHtml() {
  const z = PL('quiz'), mk = meKey(), ok = otherKey(mk), sc = (z && z.score) || {};
  let body;
  if (!z || z.i == null) body = '<p class="muted">兩個人各自作答，看答案一不一樣。</p><button class="btn" data-act="qNew">出題</button>';
  else {
    const q = QUIZ[z.i] || QUIZ[0], a = z.a || {}, mine = a[mk], theirs = a[ok], both = mine != null && theirs != null;
    body = '<p class="quiz-q">' + esc(q[0]) + '</p>';
    if (mine == null) body += '<div class="quiz-opts">' + q[1].map((o, i) => '<button class="btn ghost" data-act="qAns" data-v="' + i + '">' + esc(o) + '</button>').join('') + '</div>' + (theirs != null ? '<p class="muted">' + WHO[ok] + ' 已經作答了，換你</p>' : '');
    else if (!both) body += '<p class="muted">你選了「' + esc(q[1][mine]) + '」，等 ' + WHO[ok] + ' 作答…</p>';
    else body += '<p>' + chip('him') + ' ' + esc(q[1][a.him]) + '　' + chip('her') + ' ' + esc(q[1][a.her]) + '</p><p class="quiz-res">' + (a.him === a.her ? '心有靈犀！💞' : '差一點點…再來一題') + '</p><button class="btn" data-act="qNew">下一題</button>';
  }
  return '<div class="card play-card"><div class="row"><h3>默契大考驗</h3><span class="muted">' + (sc.t ? '默契 ' + (sc.m || 0) + ' / ' + sc.t : '') + '</span></div>' + body + '</div>';
}
function tttWin(b) {
  const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  for (const l of L) if (b[l[0]] !== '.' && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return b[l[0]] === 'h' ? 'him' : 'her';
  return b.includes('.') ? '' : 'draw';
}
function tttHtml() {
  const t = PL('ttt'), mk = meKey(), sc = (t && t.sc) || {};
  let body;
  if (!t || !t.b) body = '<p class="muted">' + MARK.him + ' 老公 vs ' + MARK.her + ' 老婆，兩支手機輪流下。</p><button class="btn" data-act="tttNew">開一局</button>';
  else {
    const st = t.w ? (t.w === 'draw' ? '平手！' : WHO[t.w] + ' 贏了！🎉') : (t.turn === mk ? '輪到你下' : '等 ' + WHO[t.turn] + ' 下…');
    body = '<p class="ttt-status">' + st + '</p><div class="ttt">' + t.b.split('').map((c, i) => '<button data-act="tttMove" data-i="' + i + '"' + (c !== '.' || t.w || t.turn !== mk ? ' disabled' : '') + '>' + (c === 'h' ? MARK.him : c === 'w' ? MARK.her : '') + '</button>').join('') + '</div>' +
      (t.w ? '<button class="btn" data-act="tttNew">再來一局</button>' : '');
  }
  return '<div class="card play-card"><div class="row"><h3>井字遊戲</h3><span class="muted">' + (t ? MARK.him + ' ' + (sc.him || 0) + '：' + (sc.her || 0) + ' ' + MARK.her + (sc.draw ? '（平手 ' + sc.draw + '）' : '') : '') + '</span></div>' + body + '</div>';
}
function rpsResult(a, b) { if (a === b) return 'draw'; return (a === 'rock' && b === 'scissors') || (a === 'scissors' && b === 'paper') || (a === 'paper' && b === 'rock') ? 'him' : 'her'; }
function rpsHtml() {
  const p = PL('rps'), mk = meKey(), ok = otherKey(mk), c = (p && p.c) || {}, sc = (p && p.sc) || {};
  const R = Object.fromEntries(RPS.map(x => [x[0], x]));
  let body;
  if (c[mk] && c[ok]) {
    const w = rpsResult(c.him, c.her);
    body = '<p class="rps-show">' + MARK.him + ' ' + R[c.him][1] + '　vs　' + R[c.her][1] + ' ' + MARK.her + '</p><p class="quiz-res">' + (w === 'draw' ? '平手！' : WHO[w] + ' 贏了！') + '</p><button class="btn" data-act="rpsAgain">再來</button>';
  } else if (c[mk]) body = '<p class="muted">你出了 ' + R[c[mk]][1] + '，等 ' + WHO[ok] + ' 出拳…</p>';
  else body = '<div class="rps-opts">' + RPS.map(x => '<button class="btn ghost" data-act="rpsPick" data-v="' + x[0] + '"><span>' + x[1] + '</span>' + x[2] + '</button>').join('') + '</div>' + (c[ok] ? '<p class="muted">' + WHO[ok] + ' 已經出好了</p>' : '');
  return '<div class="card play-card"><div class="row"><h3>剪刀石頭布</h3><span class="muted">' + (p ? MARK.him + ' ' + (sc.him || 0) + '：' + (sc.her || 0) + ' ' + MARK.her : '') + '</span></div>' + body + '</div>';
}
function renderPlay() {
  const root = $('#play-body');
  if (!root.childElementCount) root.innerHTML = ['merge', 'wheel', 'truth', 'quiz', 'ttt', 'rps'].map(k => '<div id="pw-' + k + '"></div>').join('');
  $('#pw-merge').innerHTML = mergeCardHtml();
  if (!wheelSpin) { $('#pw-wheel').innerHTML = wheelHtml(); drawWheel(); }
  $('#pw-truth').innerHTML = truthHtml();
  $('#pw-quiz').innerHTML = quizHtml();
  $('#pw-ttt').innerHTML = tttHtml();
  $('#pw-rps').innerHTML = rpsHtml();
}
function subPlay() {
  return onSnapshot(col('play'), snap => { const o = {}; snap.forEach(d => { o[d.id] = d.data(); }); S.play = o; rerender(); }, syncErr);
}

Object.assign(ACT, {
  mMood(el) { mMood = mMood === el.dataset.v ? '' : el.dataset.v; $$('#moods button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === mMood))); },
  mInk(el) { mInk = el.dataset.c; $$('.msw').forEach(b => b.setAttribute('aria-pressed', String(b === el))); },
  mUndo() { mDraft.pop(); paintM(); },
  mClear() { mDraft = []; paintM(); },
  mPhotoPick() { $('#mphoto').click(); },
  mPhotoClear() { mPhoto = ''; paintM(); },
  mToday() { mDate = TODAY; loadMoodEditor(true); renderMood(); },
  mEdit(el) { mDate = el.dataset.d; loadMoodEditor(true); renderMood(); window.scrollTo(0, 0); },
  mMore() { moodLimit += 40; subMood(); },
  mHeart(el) {
    const e = S.mood.find(x => x.id === el.dataset.id); if (!e) return;
    const k = 'react.' + meKey();
    wr(updateDoc(dref('mood', e.id), { [k]: e.react[meKey()] ? deleteField() : '❤️' }));
  },
  mSave() {
    const did = $('#mood-did').value.trim(), text = $('#mood-text').value.trim();
    if (!mMood && !did && !text && !mDraft.length && !mPhoto) { toast('先選個心情或寫點什麼'); return; }
    const json = JSON.stringify(mDraft);
    if (json.length + mPhoto.length > 900000) { toast('圖畫得太滿了，請擦掉一些'); return; }
    wr(setDoc(dref('mood', moodId(mDate, meKey())), { by: S.me, d: mDate, ts: Date.now(), mood: mMood, did, text, strokesJson: json, photo: mPhoto || deleteField(), pa: mPA }, { merge: true }));
    toast('存好了');
  },
  wKind(el) { if (wheelSpin) return; playKind = el.dataset.v; wheelResult = ''; renderPlay(); },
  wSpin() {
    if (wheelSpin) return;
    const list = wheelList(), n = list.length, seg = 360 / n, i = Math.floor(Math.random() * n);
    const target = Math.ceil(wheelRot / 360) * 360 + 360 * 5 + (360 - (i + 0.5) * seg) + (Math.random() - 0.5) * seg * 0.6;
    wheelSpin = true; wheelResult = '';
    const cv = $('#wheel'); $('#wheel-result').textContent = '轉轉轉…';
    cv.style.transition = 'transform 4s cubic-bezier(.15,.75,.2,1)';
    requestAnimationFrame(() => { wheelRot = target; cv.style.transform = 'rotate(' + wheelRot + 'deg)'; });
    setTimeout(() => { wheelSpin = false; wheelResult = list[i]; cv.style.transition = ''; renderPlay(); }, 4100);
  },
  wEdit() {
    openSheet('<h3>' + (playKind === 'eat' ? '吃什麼' : '喝什麼') + '的選項</h3><p class="muted">一行一個，最多 24 個。兩支手機會共用同一份。</p>' +
      '<textarea id="wheel-ta" rows="10" style="width:100%">' + esc(wheelList().join('\n')) + '</textarea>' +
      '<div class="actions"><button class="btn ghost" data-act="wReset">恢復預設</button><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="wSave">存起來</button></div>');
  },
  wSave() {
    const l = $('#wheel-ta').value.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 24);
    if (l.length < 2) { toast('至少要兩個選項'); return; }
    wr(setDoc(dref('play', 'wheel'), { [playKind]: l }, { merge: true })); wheelResult = ''; closeSheet(); toast('選項存好了');
  },
  wReset() { wr(setDoc(dref('play', 'wheel'), { [playKind]: deleteField() }, { merge: true })); wheelResult = ''; closeSheet(); toast('已恢復預設'); },
  tDraw() { let n; do { n = Math.floor(Math.random() * TRUTH.length); } while (n === truthIdx && TRUTH.length > 1); truthIdx = n; renderPlay(); },
  qNew() {
    const z = PL('quiz'); let n; do { n = Math.floor(Math.random() * QUIZ.length); } while (z && n === z.i && QUIZ.length > 1);
    if (z) wr(updateDoc(dref('play', 'quiz'), { i: n, 'a.him': deleteField(), 'a.her': deleteField() }));
    else wr(setDoc(dref('play', 'quiz'), { i: n, a: {}, score: { m: 0, t: 0 } }));
  },
  qAns(el) {
    const z = PL('quiz'); if (!z) return;
    const mk = meKey(), v = Number(el.dataset.v), o = (z.a || {})[otherKey(mk)], patch = { ['a.' + mk]: v };
    if (o != null) { const sc = z.score || {}; patch['score.t'] = (sc.t || 0) + 1; patch['score.m'] = (sc.m || 0) + (o === v ? 1 : 0); }
    wr(updateDoc(dref('play', 'quiz'), patch));
  },
  tttNew() {
    const t = PL('ttt'), st = t && t.st ? otherKey(t.st) : 'her';
    wr(setDoc(dref('play', 'ttt'), { b: '.........', st, turn: st, w: '' }, { merge: true }));
  },
  tttMove(el) {
    const t = PL('ttt'), mk = meKey(), i = Number(el.dataset.i);
    if (!t || t.w || t.turn !== mk || t.b[i] !== '.') return;
    const b = t.b.slice(0, i) + (mk === 'him' ? 'h' : 'w') + t.b.slice(i + 1), w = tttWin(b), patch = { b, turn: otherKey(mk), w };
    if (w) patch['sc.' + w] = ((t.sc || {})[w] || 0) + 1;
    wr(updateDoc(dref('play', 'ttt'), patch));
  },
  rpsPick(el) {
    const p = PL('rps') || {}, mk = meKey(), ok = otherKey(mk), c = p.c || {};
    if (c[mk]) return;
    if (!PL('rps')) { wr(setDoc(dref('play', 'rps'), { c: { [mk]: el.dataset.v }, sc: {} })); return; }
    const patch = { ['c.' + mk]: el.dataset.v };
    if (c[ok]) { const both = Object.assign({}, c, { [mk]: el.dataset.v }), w = rpsResult(both.him, both.her); patch['sc.' + w] = ((p.sc || {})[w] || 0) + 1; }
    wr(updateDoc(dref('play', 'rps'), patch));
  },
  rpsAgain() { wr(updateDoc(dref('play', 'rps'), { 'c.him': deleteField(), 'c.her': deleteField() })); }
});
RENDER.mood = renderMood; RENDER.play = renderPlay;

/* 心情小圖：一根手指畫，不縮放 */
const mpadEl = $('#mpad');
function mpt(e) { const r = mpadEl.getBoundingClientRect(); return [Math.round((e.clientX - r.left) / r.width * 1000) / 1000, Math.round((e.clientY - r.top) / r.width * 1000) / 1000]; }
mpadEl.addEventListener('pointerdown', e => { e.preventDefault(); if (mCur) return; try { mpadEl.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } mCur = { c: mInk, w: 2.2, p: [mpt(e)], k: 'marker', id: e.pointerId }; paintM(); });
mpadEl.addEventListener('pointermove', e => { if (!mCur || mCur.id !== e.pointerId) return; mCur.p.push(mpt(e)); paintM(); });
function mEnd(e) { if (!mCur || mCur.id !== e.pointerId) return; const s = mCur; delete s.id; mDraft.push(s); mCur = null; paintM(); }
mpadEl.addEventListener('pointerup', mEnd);
mpadEl.addEventListener('pointercancel', e => { if (mCur && mCur.id === e.pointerId) { mCur = null; paintM(); } });
['gesturestart', 'gesturechange'].forEach(n => mpadEl.addEventListener(n, e => e.preventDefault()));

/* ---------- 合成大西瓜 ---------- */
/* 自己寫的小物理：Verlet 積分＋圓形碰撞，世界寬 100、高 140 單位，畫的時候再縮放到螢幕。
   一樣的水果碰到就合成下一級；兩顆西瓜碰到會一起消失加大分。水果超過紅線太久就結束。 */
const FRUITS = [['🍒', 4.4, '#f7c6cf'], ['🍓', 5.8, '#f9b4b4'], ['🍇', 7.4, '#d9c2f0'], ['🍊', 8.8, '#ffd3a1'], ['🍋', 10.4, '#fff0a6'], ['🍎', 12.2, '#ffb8b0'],
  ['🍐', 14.0, '#d9efb0'], ['🍑', 16.0, '#ffd0c2'], ['🍍', 18.2, '#ffe59a'], ['🍈', 20.6, '#cdeec0'], ['🍉', 23.2, '#bfe8b3']];
const MPTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
/* 水果圖（美術畫的 512×512 透明圖，水果主體約佔中間直徑 490 的圓）；圖還沒載好時先用 emoji 代替 */
let FIMG = null;
const fimgs = () => FIMG || (FIMG = FRUITS.map((f, i) => { const im = new Image(); im.src = 'fruits/f' + String(i + 1).padStart(2, '0') + '.webp'; return im; }));
const MW = 100, MH = 140, MDANGER = 24, MG = 300;
let MG_ = null;
function mergeNew() {
  return { bodies: [], score: 0, next: Math.floor(Math.random() * 4), cur: Math.floor(Math.random() * 3), aim: MW / 2, cool: 0, over: false, overT: 0, t: 0, pops: [], saved: false, raf: 0, last: 0 };
}
function mAdd(G, x, y, lv, grow) { const R = FRUITS[lv][1]; G.bodies.push({ x, y, px: x, py: y, R, r: grow ? R * 0.55 : R, lv, born: G.t, dead: false }); }
function mStep(G, dt) {
  G.t += dt; G.cool = Math.max(0, G.cool - dt);
  const sub = 8, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of G.bodies) {
      if (b.r < b.R) b.r = Math.min(b.R, b.r + b.R * h * 4);
      let vx = (b.x - b.px) * 0.995, vy = (b.y - b.py) * 0.995;
      const sp = Math.hypot(vx, vy), MAXV = 0.5; if (sp > MAXV) { vx *= MAXV / sp; vy *= MAXV / sp; }
      b.px = b.x; b.py = b.y; b.x += vx; b.y += vy + MG * h * h;
    }
    for (let it = 0; it < 2; it++) {
      const B = G.bodies;
      for (let i = 0; i < B.length; i++) {
        const a = B[i]; if (a.dead) continue;
        for (let j = i + 1; j < B.length; j++) {
          const c = B[j]; if (c.dead) continue;
          const dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          if (a.lv === c.lv && !G.over) {
            a.dead = c.dead = true;
            const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
            if (a.lv < FRUITS.length - 1) { mAdd(G, mx, my, a.lv + 1, true); G.score += MPTS[a.lv + 1]; G.pops.push({ x: mx, y: my, t: G.t, s: '+' + MPTS[a.lv + 1] }); }
            else { G.score += 100; G.pops.push({ x: mx, y: my, t: G.t, s: '+100 🎉' }); }
            continue;
          }
          const d = Math.sqrt(d2), o = (rr - d) / d * 0.5, ma = a.r * a.r, mc = c.r * c.r, wa = mc / (ma + mc), wc = ma / (ma + mc);
          a.x -= dx * o * 2 * wa; a.y -= dy * o * 2 * wa; c.x += dx * o * 2 * wc; c.y += dy * o * 2 * wc;
        }
      }
      G.bodies = G.bodies.filter(b => !b.dead);
      for (const b of G.bodies) {
        if (b.x < b.r) { b.x = b.r; b.px = b.x + (b.x - b.px) * 0.2; }
        if (b.x > MW - b.r) { b.x = MW - b.r; b.px = b.x + (b.x - b.px) * 0.2; }
        if (b.y < -10) { b.y = -10; b.py = Math.max(b.py, b.y); }
        if (b.y > MH - b.r) { b.y = MH - b.r; b.py = b.y + (b.y - b.py) * 0.2; b.px = b.x - (b.x - b.px) * 0.85; }
      }
    }
  }
  /* 已經落下超過 1.5 秒的水果，頂端還在紅線上方，累積 2 秒就結束 */
  const high = G.bodies.some(b => G.t - b.born > 1.5 && b.y - b.r < MDANGER && Math.abs(b.y - b.py) < 0.03);
  G.overT = high ? G.overT + dt : 0;
  if (G.overT > 2 && !G.over) { G.over = true; mergeOver(G); }
  G.pops = G.pops.filter(p => G.t - p.t < 0.9);
}
function mDraw(G) {
  const cv = $('#mg-cv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const g = cv.getContext('2d'), k = r.width / MW;
  g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  g.clearRect(0, 0, MW, MH);
  g.fillStyle = '#fff7ea'; g.fillRect(0, 0, MW, MH);
  g.strokeStyle = G.overT > 0 ? '#e76f6f' : 'rgba(231,111,111,.45)'; g.lineWidth = 0.5; g.setLineDash([2, 2]);
  g.beginPath(); g.moveTo(0, MDANGER); g.lineTo(MW, MDANGER); g.stroke(); g.setLineDash([]);
  const fruit = (x, y, lv, sc) => {
    const f = FRUITS[lv], rr = f[1] * sc, im = fimgs()[lv];
    if (im.complete && im.naturalWidth) { const d = rr * 2 * 512 / 490; g.drawImage(im, x - d / 2, y - d / 2, d, d); return; }
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fillStyle = f[2]; g.fill();
    g.lineWidth = 0.4; g.strokeStyle = 'rgba(74,63,69,.25)'; g.stroke();
    g.font = (rr * 1.25) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(f[0], x, y + rr * 0.06);
  };
  if (!G.over) {
    const cr = FRUITS[G.cur][1], ax = Math.min(MW - cr, Math.max(cr, G.aim));
    g.strokeStyle = 'rgba(74,63,69,.18)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(ax, 10); g.lineTo(ax, MH); g.stroke();
    if (G.cool <= 0) fruit(ax, 10, G.cur, 1);
  }
  for (const b of G.bodies) fruit(b.x, b.y, b.lv, b.r / b.R);
  g.textAlign = 'center'; g.font = '6px Naikai, sans-serif';
  for (const p of G.pops) { const a = (G.t - p.t) / 0.9; g.globalAlpha = 1 - a; g.fillStyle = '#c0546b'; g.fillText(p.s, p.x, p.y - 6 - a * 10); }
  g.globalAlpha = 1;
  $('#mg-score').textContent = G.score;
  const nx = $('#mg-next'); if (nx.dataset.lv !== String(G.next)) { nx.dataset.lv = G.next; nx.innerHTML = '<img src="' + fimgs()[G.next].src + '" alt="' + FRUITS[G.next][0] + '">'; }
}
function mLoop(ts) {
  const G = MG_; if (!G) return;
  const dt = Math.min(1 / 30, G.last ? (ts - G.last) / 1000 : 1 / 60); G.last = ts;
  if (!G.over) mStep(G, dt);
  mDraw(G);
  G.raf = requestAnimationFrame(mLoop);
}
function mDrop() {
  const G = MG_; if (!G || G.over || G.cool > 0) return;
  const cr = FRUITS[G.cur][1], x = Math.min(MW - cr, Math.max(cr, G.aim));
  mAdd(G, x, 10, G.cur); G.cur = G.next; G.next = Math.floor(Math.random() * 5); G.cool = 0.55;
}
function mergeBest() { const m = PL('merge') || {}; return { him: m.him || 0, her: m.her || 0, top: m.top || [] }; }
function mergeOver(G) {
  if (G.saved) return; G.saved = true;
  const mk = meKey(), m = mergeBest(), isBest = G.score > (m[mk] || 0);
  const top = m.top.concat([{ by: S.me, s: G.score, ts: Date.now() }]).sort((a, b) => b.s - a.s).slice(0, 10);
  if (G.score > 0) wr(setDoc(dref('play', 'merge'), Object.assign({ top }, isBest ? { [mk]: G.score } : {}), { merge: true }));
  const box = $('#mg-over');
  box.innerHTML = '<p class="mg-over-t">遊戲結束</p><p class="mg-over-s">' + G.score + ' 分</p>' + (isBest && G.score > 0 ? '<p class="quiz-res">新紀錄！🎉</p>' : '<p class="muted">你的最高分 ' + (m[mk] || 0) + '</p>') +
    '<div class="row" style="justify-content:center;gap:10px"><button class="btn" data-act="mgAgain">再來一局</button><button class="btn ghost" data-act="mgClose">離開</button></div>';
  box.hidden = false;
}
function mergeCardHtml() {
  const m = mergeBest();
  return '<div class="card play-card"><div class="row"><h3>合成大西瓜 🍉</h3><span class="muted">' + MARK.him + ' ' + m.him + '　' + MARK.her + ' ' + m.her + '</span></div>' +
    '<p class="muted">丟水果，一樣的碰在一起會變大，合出西瓜！水果疊過紅線就結束。</p>' +
    (m.top.length ? '<ol class="mg-top">' + m.top.slice(0, 5).map(t => '<li>' + byChip(t.by) + ' <b>' + t.s + '</b> <span class="muted">' + md(new Date(t.ts)) + '</span></li>').join('') + '</ol>' : '') +
    '<button class="btn" data-act="mgOpen">開始玩</button></div>';
}
function mergeOpen() {
  let ov = $('#mg');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'mg'; ov.className = 'mg';
    ov.innerHTML = '<div class="mg-top-bar"><button class="btn ghost small" data-act="mgClose">‹ 離開</button><span class="mg-sc">分數 <b id="mg-score">0</b></span><span class="mg-nx">下一個 <span id="mg-next"></span></span></div>' +
      '<div class="mg-stage"><canvas id="mg-cv"></canvas><div class="mg-over" id="mg-over" hidden></div></div><p class="mg-tip">手指左右移動對準，放開就丟下去</p>';
    document.body.appendChild(ov);
    const cv = $('#mg-cv');
    const aim = e => { const r = cv.getBoundingClientRect(); if (MG_) MG_.aim = (e.clientX - r.left) / r.width * MW; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } aim(e); });
    cv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') aim(e); });
    cv.addEventListener('pointerup', e => { aim(e); mDrop(); });
    ['gesturestart', 'gesturechange', 'touchmove'].forEach(n => ov.addEventListener(n, e => e.preventDefault(), { passive: false }));
  }
  ov.hidden = false; document.documentElement.classList.add('mg-open');
  if (MG_) cancelAnimationFrame(MG_.raf);
  MG_ = mergeNew(); $('#mg-over').hidden = true;
  MG_.raf = requestAnimationFrame(mLoop);
}
function mergeClose() {
  if (MG_) { cancelAnimationFrame(MG_.raf); if (!MG_.over && MG_.score > 0) { MG_.over = true; mergeOver(MG_); } MG_ = null; }
  const ov = $('#mg'); if (ov) ov.hidden = true; document.documentElement.classList.remove('mg-open');
  if (curTab === 'play') renderPlay();
}
Object.assign(ACT, { mgOpen: mergeOpen, mgClose: mergeClose, mgAgain: mergeOpen });

window.addEventListener('online', () => { setNet(); if (booted && !synced) boot(); });
window.addEventListener('offline', setNet);

/* 開始 */
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
applyTheme();
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getTheme() === 'auto') applyTheme(); }); } catch (e) { /* ignore */ }
boot();

/* 在照片上畫：照片保留原本的長寬比（太極端的才會裁一點），縮到最長邊 1000、壓成 JPEG 再存，
   才不會超過 Firestore 單筆資料的大小上限 */
function compressPhoto(f, done) {
  const rd = new FileReader();
  rd.onerror = () => toast('這張照片讀不進來');
  rd.onload = () => {
    const im = new Image();
    im.onerror = () => toast('這張照片打不開');
    im.onload = () => {
      const a = im.naturalWidth / im.naturalHeight, pa = Math.min(1.8, Math.max(0.6, a));
      const W = pa >= 1 ? 1000 : Math.round(1000 * pa), H = pa >= 1 ? Math.round(1000 / pa) : 1000;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      drawCover(c.getContext('2d'), im, W, H);
      let q = 0.78, out = c.toDataURL('image/jpeg', q);
      while (out.length > 480000 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
      done(out, pa);
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
}
$('#photo').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (f) compressPhoto(f, (out, pa) => { draftPhoto = out; draftPA = pa; resetView(); paintPad(); });
});
$('#mphoto').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (f) compressPhoto(f, (out, pa) => { mPhoto = out; mPA = pa; paintM(); });
});
