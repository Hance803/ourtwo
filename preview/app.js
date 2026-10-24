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
const S = { me: LS.get('ourtwo.me') === '老婆' ? '老婆' : '老公', shifts: {}, events: [], memos: [], notes: [], love: [], board: [], mood: [], play: {}, truth: [], coupons: [], period: null };
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
  RENDER[n](); updateBadge(); scrollTop0();
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
  subTruth();
  subCoupons();
  unsubs.push(subPlay());
  cleanupOldFont();
  unsubs.push(onSnapshot(dref('settings', 'period'), snap => { S.period = snap.exists() ? snap.data() : null; rerender(); }, syncErr));
  synced = true;
}
function stopSync() { if (couponUnsub) { try { couponUnsub(); } catch (e) { /* ignore */ } couponUnsub = null; } if (truthUnsub) { try { truthUnsub(); } catch (e) { /* ignore */ } truthUnsub = null; } if (moodUnsub) { try { moodUnsub(); } catch (e) { /* ignore */ } moodUnsub = null; } if (boardUnsub) { try { boardUnsub(); } catch (e) { /* ignore */ } boardUnsub = null; } unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; synced = false; }

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
      for (const c of ['shifts', 'events', 'memos', 'notes', 'love', 'settings', 'board', 'mood', 'play', 'truth', 'coupons']) {
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
          if (!['shifts', 'events', 'memos', 'notes', 'love', 'settings', 'board', 'mood', 'play', 'truth', 'coupons'].includes(c)) continue;
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
const QUIZ = [['週末最想怎麼過？', ['在家耍廢', '出去走走', '吃大餐', '睡到自然醒']], ['消夜首選？', ['鹹酥雞', '泡麵', '滷味', '不吃消夜']], ['旅行比較想去？', ['日本', '韓國', '海島', '台灣環島']], ['吵架後誰會先道歉？', ['老公', '老婆', '看情況', '都不會']], ['家裡誰比較會花錢？', ['老公', '老婆', '一樣', '都很省']], ['下雨天最適合？', ['看電影', '睡覺', '吃火鍋', '打電動']], ['理想的約會時間？', ['早上', '下午', '晚上', '半夜']], ['比較喜歡的寵物？', ['貓', '狗', '兔子', '都不要']], ['最常一起吃的？', ['火鍋', '拉麵', '便當', '燒肉']], ['生日最想收到？', ['驚喜派對', '一封手寫信', '想要很久的東西', '一起去旅行']], ['誰比較會賴床？', ['老公', '老婆', '一樣', '都不會']], ['誰比較會記仇？', ['老公', '老婆', '一樣', '都不會']], ['放假第一件事？', ['補眠', '追劇', '出門吃', '打掃']], ['最想一起學的？', ['煮飯', '游泳', '跳舞', '外語']], ['家裡誰負責找東西？', ['老公', '老婆', '一起找', '找不到就算了']], ['最喜歡的季節？', ['春天', '夏天', '秋天', '冬天']], ['手搖飲的甜度？', ['全糖', '半糖', '微糖', '無糖']], ['誰比較怕黑？', ['老公', '老婆', '一樣', '都不怕']], ['理想的家？', ['市區公寓', '郊區透天', '海邊小屋', '鄉下農舍']], ['一起看電影選？', ['喜劇', '恐怖片', '愛情片', '動畫']]];
const MARK = { him: '🐻', her: '🐰' };
let playKind = 'eat', wheelRot = 0, wheelSpin = false, wheelResult = '';
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
function renderPlay() {
  const root = $('#play-body');
  if (!root.childElementCount) root.innerHTML = ['merge', 'balloon', 'kuji', 'truth', 'wheel', 'quiz'].map(k => '<div id="pw-' + k + '"></div>').join('');
  $('#pw-merge').innerHTML = mergeCardHtml();
  if (!kDrawing) { $('#pw-balloon').innerHTML = balloonCardHtml(); $('#pw-kuji').innerHTML = kujiCardHtml(); }
  if (!wheelSpin) { $('#pw-wheel').innerHTML = wheelHtml(); drawWheel(); }
  const ga = document.activeElement && document.activeElement.id === 'g-ta';
  if (!gWatch() && !gAnim && !ga) $('#pw-truth').innerHTML = truthHtml();
  $('#pw-quiz').innerHTML = quizHtml();
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
  mEdit(el) { mDate = el.dataset.d; loadMoodEditor(true); renderMood(); scrollTop0(); },
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
/* 水果整體縮到 78%：箱子裡空間比較夠，認真玩有機會合出西瓜（原本的大小幾乎不可能） */
FRUITS.forEach(f => { f[1] = Math.round(f[1] * 0.78 * 100) / 100; });
const MPTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
/* 水果圖（美術圖已裁好邊）。FART = [主體圓心 x, 圓心 y, 圖寬, 圖高]，主體圓直徑一律 490；圖還沒載好時先用 emoji 代替 */
const FART = [[251.7, 402.3, 503, 653], [249.2, 310.8, 498, 560], [279.7, 331.2, 538, 581], [249.5, 230.2, 499, 480], [248.8, 137.7, 498, 386], [248.4, 264.1, 497, 513], [248.6, 252.6, 498, 502], [249.3, 244.5, 499, 494], [249.7, 369.6, 499, 619], [248.6, 319.6, 498, 569], [249.1, 314.5, 499, 564]];
let MBG = null;
const mbg = () => MBG || (MBG = ['bg_stage', 'shot_hit'].map(n => { const im = new Image(); im.src = 'fruits/' + n + '.webp'; return im; }));
let FIMG = null;
const fimgs = () => FIMG || (FIMG = FRUITS.map((f, i) => { const im = new Image(); im.src = 'fruits/f' + String(i + 1).padStart(2, '0') + '.webp'; return im; }));
const MW = 100, MH = 140, MDANGER = 24, MG = 300, MSOFT = 0.8, MFRIC = 0.004;
let MG_ = null;
/* 出水果用「抽袋子」：一袋 8 顆照固定比例洗牌，抽完再換一袋，不會一直連出同一種小水果。
   比例：櫻桃 1、草莓 2、葡萄 2、橘子 2、檸檬 1。 */
const MBAG = [0, 1, 1, 2, 2, 3, 3, 4];
function mNext(G) {
  if (!G.bag || !G.bag.length) { G.bag = MBAG.slice(); for (let i = G.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]]; } }
  return G.bag.pop();
}
/* 道具（每人每天各自累計，換日歸零；存在 play/merge.items.{him|her}）
   復活：每局第一次合出哈密瓜／射爆：連續丟出 3 顆一樣的水果／地震：打出 Combo ×3／換一顆：每局分數每過 1000 分 */
const MITEMS = [['revive', '復活'], ['shot', '射爆'], ['quake', '地震'], ['swap', '換一顆']];
const MITEM_MAX = 9;
let MINV = null;
function mInvLoad() {
  const it = ((PL('merge') || {}).items || {})[meKey()];
  MINV = it && it.d === iso(new Date()) ? Object.assign({ revive: 0, shot: 0, quake: 0, swap: 0 }, it) : { d: iso(new Date()), revive: 0, shot: 0, quake: 0, swap: 0 };
  MINV.d = iso(new Date());
}
function mInvSave() { wr(setDoc(dref('play', 'merge'), { items: { [meKey()]: Object.assign({}, MINV) } }, { merge: true })); }
function mGain(G, k) {
  if (!MINV) mInvLoad();
  if (MINV.d !== iso(new Date())) mInvLoad();
  if (MINV[k] >= MITEM_MAX) return;
  MINV[k]++; mInvSave(); mItemsUI();
  const name = (MITEMS.find(x => x[0] === k) || ['', k])[1];
  G.notes.push({ t: G.t, s: '獲得「' + name + '」×1' });
}
function mItemsUI() {
  const box = $('#mg-items'); if (!box || !MINV) return;
  const G = MG_;
  box.innerHTML = MITEMS.filter(x => x[0] !== 'revive').map(([k, n]) => '<button class="btn ghost small mg-item' + (G && G.mode === k ? ' on' : '') + '" data-act="mgUse" data-k="' + k + '"' + (!MINV[k] || !G || G.over ? ' disabled' : '') + '><img src="fruits/item_' + k + '.webp" alt="">' + n + ' ×' + MINV[k] + '</button>').join('') +
    '<span class="mg-item-rv' + (MINV.revive ? '' : ' zero') + '"><img src="fruits/item_revive.webp" alt="">復活 ×' + MINV.revive + '</span>';
}
function mergeNew() {
  const G = { rt: 0, fx: [], freeze: 0, shakeA: 0, bag: [], bodies: [], notes: [], mode: '', streakLv: -1, streakN: 0, gotRevive: false, swapAt: 1000, paused: false, bag2: 0, score: 0, next: 0, cur: 0, maxLv: 0, combo: 0, comboT: -9, combos: [], best: 0, bestShown: false, aim: MW / 2, cool: 0, over: false, overT: 0, t: 0, pops: [], saved: false, raf: 0, last: 0 };
  G.cur = mNext(G); G.next = mNext(G); G.best = mergeBest()[meKey()] || 0; return G;
}
function mAdd(G, x, y, lv, grow) { const R = FRUITS[lv][1]; G.bodies.push({ x, y, px: x, py: y, R, r: grow ? R * 0.55 : R, lv, born: G.t, dead: false }); }
function mStep(G, dt) {
  G.t += dt; G.cool = Math.max(0, G.cool - dt);
  const sub = 8, h = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (const b of G.bodies) {
      if (b.r < b.R) b.r = Math.min(b.R, b.r + b.R * h * 7);
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
            /* 0.8 秒內接連合成算 Combo，從第 2 下開始每下多加 5×(連段-1) 分 */
            G.combo = G.t - G.comboT < 0.8 ? G.combo + 1 : 1; G.comboT = G.t;
            const bonus = G.combo > 1 ? 5 * (G.combo - 1) : 0;
            if (G.combo > 1) G.combos.push({ x: mx, y: my, t: G.t, n: G.combo });
            if (G.combo === 3) mGain(G, 'quake');
            if (a.lv + 1 === 9 && !G.gotRevive) { G.gotRevive = true; mGain(G, 'revive'); }
            if (a.lv + 1 > G.maxLv) G.maxLv = a.lv + 1;
            if (a.lv < FRUITS.length - 1) { mAdd(G, mx, my, a.lv + 1, true); G.score += MPTS[a.lv + 1] + bonus; G.pops.push({ x: mx, y: my, t: G.t, s: '+' + (MPTS[a.lv + 1] + bonus), n: G.combo }); }
            else { G.score += 100 + bonus; G.maxLv = FRUITS.length; G.pops.push({ x: mx, y: my, t: G.t, s: '+' + (100 + bonus) + ' 🎉', n: G.combo }); }
            mHitFx(G, mx, my, a.lv + 1);
            continue;
          }
          const d = Math.sqrt(d2), o = (rr - d) / d * 0.5, ma = a.r * a.r, mc = c.r * c.r, wa = mc / (ma + mc), wc = ma / (ma + mc);
          const ax = dx * o * 2 * wa, ay = dy * o * 2 * wa, cx2 = dx * o * 2 * wc, cy2 = dy * o * 2 * wc;
          a.x -= ax; a.y -= ay; c.x += cx2; c.y += cy2;
          /* 不彈：推開不產生速度，而且把「互相撞過去」的速度整個吃掉；沿著表面的速度保留，水果還是會滾 */
          a.px -= ax; a.py -= ay; c.px += cx2; c.py += cy2;
          const nx = dx / d, ny = dy / d, rel = ((c.x - c.px) - (a.x - a.px)) * nx + ((c.y - c.py) - (a.y - a.py)) * ny;
          if (rel < -0.08) { a.imp = Math.max(a.imp || 0, -rel); c.imp = Math.max(c.imp || 0, -rel); }
          if (rel < 0) { a.px -= nx * rel * wa; a.py -= ny * rel * wa; c.px += nx * rel * wc; c.py += ny * rel * wc; }
          /* 一點點摩擦：堆好的水果會慢慢停下來，不會一直溜 */
          const tx = -ny, ty = nx, tv = ((c.x - c.px) - (a.x - a.px)) * tx + ((c.y - c.py) - (a.y - a.py)) * ty, fr = tv * MFRIC;
          a.px -= tx * fr * wa; a.py -= ty * fr * wa; c.px += tx * fr * wc; c.py += ty * fr * wc;
        }
      }
      G.bodies = G.bodies.filter(b => !b.dead);
      for (const b of G.bodies) {
        if (b.x < b.r) { b.x = b.r; b.px = b.x; }
        if (b.x > MW - b.r) { b.x = MW - b.r; b.px = b.x; }
        if (b.y < -10) { b.y = -10; b.py = Math.max(b.py, b.y); }
        if (b.y > MH - b.r) { if (b.y - b.py > 0.08) b.imp = Math.max(b.imp || 0, b.y - b.py); b.y = MH - b.r; b.py = b.y; b.px = b.x - (b.x - b.px) * 0.97; }
      }
    }
  }
  /* 撞擊：重重落地／撞到別顆時壓扁一下，順便「咚」一聲 */
  let thud = 0;
  for (const b of G.bodies) { if (b.imp) { if (G.t - (b.sqT || -9) > 0.25) { b.sq = Math.min(0.24, b.imp * 0.55); b.sqT = G.t; thud = Math.max(thud, b.imp); } b.imp = 0; } }
  if (thud > 0.12) sfx('thud', thud);
  /* 滾動角度：用「這一幀實際移動了多少」來轉，太小的抖動不算，才不會停著還在原地轉 */
  for (const b of G.bodies) { if (b.fx == null) b.fx = b.x; const dx = b.x - b.fx; b.fx = b.x; if (Math.abs(dx) > 0.04) b.ang = (b.ang || 0) + dx / b.r; }
  /* 已經落下超過 1.5 秒的水果，頂端還在紅線上方，累積 2 秒就結束 */
  const high = G.bodies.some(b => G.t - b.born > 1.5 && b.y - b.r < MDANGER && Math.abs(b.y - b.py) < 0.03);
  G.overT = high ? G.overT + dt : 0;
  if (G.overT > 2 && !G.over) {
    if (MINV && MINV.revive > 0 && !G.askedRevive) { G.askedRevive = true; G.paused = true; mAskRevive(); }
    else { G.over = true; mergeOver(G); }
  }
  while (G.score >= G.swapAt) { G.swapAt += 1000; mGain(G, 'swap'); }
  G.pops = G.pops.filter(p => G.t - p.t < 0.9);
  G.notes = G.notes.filter(n => G.t - n.t < 1.8);
  G.combos = G.combos.filter(c => G.t - c.t < 1.1);
}
function mDraw(G) {
  const cv = $('#mg-cv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(r.width * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
  const g = cv.getContext('2d'), k = r.width / MW;
  g.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  g.clearRect(0, 0, MW, MH);
  g.fillStyle = '#fff7ea'; g.fillRect(0, 0, MW, MH);
  /* 畫面震動（用真實時間，打擊停頓時也會抖） */
  if (G.shakeA) { const q = 1 - (G.rt - G.shakeT) / G.shakeD; if (q > 0) { const A = G.shakeA * q * q; g.translate((Math.random() - 0.5) * 2 * A, (Math.random() - 0.5) * 2 * A); } else G.shakeA = 0; } { const bg = mbg()[0]; if (bg.complete && bg.naturalWidth) g.drawImage(bg, 0, 0, MW, MH); }
  g.strokeStyle = G.overT > 0 ? '#e76f6f' : 'rgba(231,111,111,.45)'; g.lineWidth = 0.5; g.setLineDash([2, 2]);
  g.beginPath(); g.moveTo(0, MDANGER); g.lineTo(MW, MDANGER); g.stroke(); g.setLineDash([]);
  const fruit = (x, y, lv, sc, ang, b) => {
    const f = FRUITS[lv]; let im = fimgs()[lv], A = FART[lv];
    /* 剛合成出來：先脹大再縮回（啵！）；落地：壓扁再彈回；被撞到／合成時換驚訝臉 */
    let pk = 1, sx = 1, sy = 1;
    if (b) {
      if (b.popT != null) { const t = G.t - b.popT; if (t < 0.6) pk = 1 + 0.34 * Math.exp(-7 * t) * Math.cos(17 * t); }
      if (b.sq) { const t = G.t - b.sqT, e = t < 0.4 ? Math.exp(-9 * t) * Math.cos(24 * t) : 0; sx = 1 + b.sq * e; sy = 1 - b.sq * e; if (!e) b.sq = 0; }
      if (MWOW_ART && b.wowT != null && G.t - b.wowT < 0.55 && FART_WOW[lv]) { const w = mwow()[lv]; if (w && w.complete && w.naturalWidth) { im = w; A = FART_WOW[lv]; } }
    }
    const rr = f[1] * sc * pk;
    if (im.complete && im.naturalWidth) {
      const s = rr * 2 / 490;
      if (ang || sx !== 1 || pk !== 1) { g.save(); g.translate(x, y + rr * (1 - sy)); g.scale(sx, sy); if (ang) g.rotate(ang); g.drawImage(im, -A[0] * s, -A[1] * s, A[2] * s, A[3] * s); g.restore(); }
      else g.drawImage(im, x - A[0] * s, y - A[1] * s, A[2] * s, A[3] * s);
      return;
    }
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fillStyle = f[2]; g.fill();
    g.lineWidth = 0.4; g.strokeStyle = 'rgba(74,63,69,.25)'; g.stroke();
    g.font = (rr * 1.25) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(f[0], x, y + rr * 0.06);
  };
  if (!G.over) {
    const cr = FRUITS[G.cur][1], ax = Math.min(MW - cr, Math.max(cr, G.aim));
    g.strokeStyle = 'rgba(74,63,69,.18)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(ax, 10); g.lineTo(ax, MH); g.stroke();
    /* 夾子：夾著水果；放手時打開，等下一顆補上再合起來 */
    const open = G.cool > 0 ? Math.min(1, G.cool / 0.3) : 0, hr = G.cool > 0 ? FRUITS[G.prev == null ? G.cur : G.prev][1] : cr;
    if (G.cool <= 0) fruit(ax, 10, G.cur, 1);
    mClaw(g, G.cool > 0 ? (G.dropX == null ? ax : G.dropX) : ax, 10, hr, open);
  }
  mFxDraw(G, g, true);
  for (const b of G.bodies) fruit(b.x, b.y, b.lv, b.r / b.R, b.ang, b);
  mFxDraw(G, g, false);
  g.textAlign = 'center'; g.font = '6px Naikai, sans-serif';
  for (const p of G.pops) { if (p.hit) { const a = (G.t - p.t) / 0.5, im = mbg()[1]; if (a < 1 && im.complete && im.naturalWidth) { const d = p.r * (2.2 + a); g.globalAlpha = 1 - a * a; g.drawImage(im, p.x - d / 2, p.y - d / 2, d, d); } continue; } const a = (G.t - p.t) / 0.9, n = Math.min(p.n || 1, 6), sz = (6 + n * 0.9) * (a < 0.12 ? 0.6 + a / 0.12 * 0.6 : 1.2 - Math.min(0.2, (a - 0.12)));
    g.globalAlpha = a < 0.7 ? 1 : (1 - a) / 0.3; g.font = sz + 'px Naikai, sans-serif'; g.lineWidth = 1.1; g.strokeStyle = '#fff7ea'; g.fillStyle = MHOT[n - 1];
    g.strokeText(p.s, p.x, p.y - 6 - a * 12); g.fillText(p.s, p.x, p.y - 6 - a * 12); }
  g.font = '6px Naikai, sans-serif';
  for (const n of G.notes) { const a = (G.t - n.t) / 1.8; g.globalAlpha = a < 0.8 ? 1 : (1 - a) * 5; g.font = '6.5px Naikai, sans-serif'; g.fillStyle = '#3b6e5a'; g.strokeStyle = '#fff7ea'; g.lineWidth = 1; g.strokeText(n.s, MW / 2, 68 - a * 4); g.fillText(n.s, MW / 2, 68 - a * 4); }
  g.globalAlpha = 1;
  if (G.mode === 'shot') { g.font = '6px Naikai, sans-serif'; g.fillStyle = '#c0392b'; g.fillText('點一顆水果射爆它', MW / 2, 40); }
  for (const c of G.combos) { const a = (G.t - c.t) / 1.1, s = 1 + Math.min(c.n, 6) * 0.12; g.globalAlpha = 1 - a * a; g.font = (8 * s) + 'px Naikai, sans-serif'; g.fillStyle = '#e8743b'; g.strokeStyle = '#fff7ea'; g.lineWidth = 1.2; g.strokeText('Combo ×' + c.n, MW / 2, 52 - a * 6); g.fillText('Combo ×' + c.n, MW / 2, 52 - a * 6); }
  g.globalAlpha = 1;
  { const se = $('#mg-score'); if (se.textContent !== String(G.score)) { se.textContent = G.score; se.classList.remove('bump'); void se.offsetWidth; se.classList.add('bump'); } }
  if (!G.bestShown && G.best > 0 && G.score > G.best) { G.bestShown = true; const bx = $('#mg-best'); bx.classList.add('flash'); bx.textContent = '新紀錄！'; }
  else if (!G.bestShown) $('#mg-best').textContent = '最高 ' + G.best;
  const nx = $('#mg-next'); if (nx.dataset.lv !== String(G.next)) { nx.dataset.lv = G.next; nx.innerHTML = '<img src="' + fimgs()[G.next].src + '" alt="' + FRUITS[G.next][0] + '">'; }
  const rt = $('#mg-route'); if (rt && rt.dataset.lv !== String(G.maxLv)) { rt.dataset.lv = G.maxLv; mRoute(); }
}
/* 夾子：美術畫的 claw_closed／claw_open（兩張對齊）。MCA = [夾住的球心 x, 球心 y, 球直徑, 繩子接點 y, 圖寬, 圖高] */
const MCLAW_ART = true, MCA = [235.8, 381.9, 240, 1.0, 470, 506];
let MCLAW = null;
function mClaw(g, x, y, r, open) {
  if (!MCLAW_ART) return;
  if (!MCLAW) MCLAW = ['claw_closed', 'claw_open'].map(n => { const im = new Image(); im.src = 'fruits/' + n + '.webp'; return im; });
  const im = MCLAW[open > 0.5 ? 1 : 0]; if (!im.complete || !im.naturalWidth) return;
  const s = (r * 2) / MCA[2], top = y - (MCA[1] - MCA[3]) * s;
  g.save(); if (top > 0) { g.strokeStyle = '#3b2a24'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x, -2); g.lineTo(x, top + 0.5); g.stroke(); }
  g.drawImage(im, x - MCA[0] * s, y - MCA[1] * s, MCA[4] * s, MCA[5] * s); g.restore();
}
/* ================= 打擊感 =================
   停頓、震動、啵一下、壓扁、分數跳、手機震動、音效。
   果汁噴濺、驚訝臉、合出西瓜的慶祝圖要等美術圖，圖到之前對應的開關是 false，不畫（不用程式自己畫來充數）。 */
const MSPLASH_ART = true, MWOW_ART = true, MCELEB_ART = true;
/* 驚訝臉（美術用原圖改的，對位已核對：和原圖輪廓差 1% 以內）。null = 這顆還沒有圖，用原本的臉 */
const FART_WOW = [[249.0, 403.0, 499, 653], [248.7, 311.3, 498, 560], [276.8, 331.5, 539, 581], [248.4, 229.1, 498, 478], [248.3, 137.9, 497, 387], [248.4, 262.6, 497, 511], [248.6, 253.7, 498, 503], [248.7, 245.0, 498, 494], [248.5, 368.5, 499, 618], [248.6, 317.4, 498, 566], [248.6, 313.4, 497, 563]];
let MWOW = null, MSPL = null;
const mwow = () => MWOW || (MWOW = FRUITS.map((f, i) => { if (!FART_WOW[i]) return null; const im = new Image(); im.src = 'fruits/f' + String(i + 1).padStart(2, '0') + '_wow.webp'; return im; }));
const mspl = () => MSPL || (MSPL = ['splash_1', 'splash_2', 'splash_3', 'drop', 'celebrate_burst', 'confetti_1', 'confetti_2', 'confetti_3', 'confetti_4'].map(n => { if (!MSPLASH_ART && n.startsWith('splash')) return null; const im = new Image(); im.src = 'fruits/' + n + '.webp'; return im; }));
/* 測試用（網址加 #mgtest 才有） */
if (location.hash === '#mgtest') window.__mg = { G: () => MG_, melon: () => mMelon(MG_), hit: (x, y, lv) => mHitFx(MG_, x, y, lv) };
/* 每種水果的果汁顏色（噴濺圖是白色的，由程式染色） */
const MJUICE = ['#c8102e', '#ef3b3b', '#8e44c9', '#ff8a1a', '#ffd21a', '#e8302a', '#cfdc5a', '#ff9e9e', '#ffbf26', '#f5a65b', '#ff4d5e'];
const MHOT = ['#c0546b', '#d9653b', '#e8743b', '#ef5a2a', '#e8342a', '#d81b60'];
function mShake(G, A, D) { if (A >= (G.shakeA || 0) * Math.max(0, 1 - (G.rt - (G.shakeT || 0)) / (G.shakeD || 1))) { G.shakeA = A; G.shakeT = G.rt || 0; G.shakeD = D; } }
function mHitFx(G, x, y, lv) {
  const big = Math.min(lv, 10);
  /* 停頓：水果越大停越久 */
  G.freeze = Math.max(G.freeze || 0, 0.035 + big * 0.009);
  /* 震動：小水果幾乎沒感覺，大水果越來越明顯 */
  if (big >= 3) mShake(G, 0.12 * big * big / 4, 0.18 + big * 0.025);
  /* 新水果「啵」一下，旁邊的水果被輕輕推開 */
  const nb = G.bodies[G.bodies.length - 1]; if (nb && nb.lv === lv) { nb.popT = G.t; nb.wowT = G.t; }
  const R = lv < FRUITS.length ? FRUITS[lv][1] : FRUITS[FRUITS.length - 1][1];
  for (const b of G.bodies) {
    if (b === nb || b.dead) continue;
    const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1, reach = R + b.R + 4;
    if (d < reach) { const f = 0.05 * (1 - d / reach) * (1 + big * 0.06); b.px -= dx / d * f; b.py -= dy / d * f; b.wowT = G.t; }
  }
  /* 果汁噴濺（要美術圖） */
  if (MSPLASH_ART) {
    const col = MJUICE[Math.min(lv, 10)], n = 5 + Math.min(lv, 8);
    G.fx.push({ k: 0, x, y, t: G.t, r: R * 1.35, rot: Math.random() * 6.3, col, life: 0.5 });
    for (let i = 0; i < n; i++) { const an = Math.random() * 6.3, sp = 30 + Math.random() * 40 + lv * 3; G.fx.push({ k: 3, x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 25, t: G.t, r: 1 + Math.random() * 1.2 + lv * 0.12, rot: an, col, life: 0.55 }); }
  }
  sfx('pop', lv, G.combo || 1);
  mHaptic(lv >= 7 ? 2 : 1);
  if (lv >= FRUITS.length - 1) mMelon(G);
}
/* 合出西瓜：長一點的停頓＋大震動＋大字＋音樂（慶祝圖、彩帶要美術） */
function mMelon(G) {
  G.freeze = 0.28; mShake(G, 3.5, 0.9); G.melonT = G.t; sfx('melon'); mHaptic(3);
  if (MCELEB_ART) for (let i = 0; i < 36; i++) G.fx.push({ k: 5 + (i % 4), x: Math.random() * MW, y: -10 - Math.random() * 40, vx: (Math.random() - 0.5) * 20, vy: 30 + Math.random() * 30, t: G.t, r: 3 + Math.random() * 2, rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 10, life: 3 });
}
const MTINT = new Map();
function mTint(im, col) {
  const key = im.src + col; let c = MTINT.get(key); if (c) return c;
  c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d');
  x.drawImage(im, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(im, 0, 0); MTINT.set(key, c); return c;
}
function mFxDraw(G, g, under) {
  if (!G.fx) G.fx = [];
  if (G.fx.length) {
    const sp = mspl();
    if (under) G.fx = G.fx.filter(p => G.t - p.t < p.life);
    for (const p of G.fx) {
      if ((p.k === 0) !== under) continue;
      const t = G.t - p.t, a = t / p.life, im = p.k === 0 ? sp[p.rot * 10 % 3 | 0] : sp[p.k];
      if (!im || !im.complete || !im.naturalWidth) continue;
      let x = p.x, y = p.y, d = p.r * 2;
      if (p.vx != null) { x += p.vx * t; y += p.vy * t + (p.k >= 5 ? 0 : 160 * t * t); }
      if (p.k === 0) d *= 0.6 + Math.min(1, a * 4) * 0.5;
      g.save(); g.globalAlpha = p.k >= 5 ? Math.min(1, (1 - a) * 4) : 1 - a * a; g.translate(x, y); g.rotate(p.rot + (p.spin || 0) * t);
      g.drawImage(p.col ? mTint(im, p.col) : im, -d / 2, -d / 2, d, d); g.restore();
    }
  }
  if (under) return;
  if (G.melonT != null) {
    const t = G.t - G.melonT;
    if (t < 2.2) {
      const s = t < 0.25 ? t / 0.25 * 1.25 : 1.25 - Math.min(0.25, (t - 0.25) * 1.2);
      g.save(); g.globalAlpha = t < 1.8 ? 1 : (2.2 - t) / 0.4; g.translate(MW / 2, 62);
      if (MCELEB_ART) { const bi = mspl()[4]; if (bi.complete && bi.naturalWidth) { g.save(); g.rotate(t * 0.6); g.drawImage(bi, -34 * s, -34 * s, 68 * s, 68 * s); g.restore(); } }
      g.scale(s, s); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '12px Naikai, sans-serif'; g.lineWidth = 2.4; g.strokeStyle = '#fff7ea'; g.strokeText('合出西瓜了！', 0, 0); g.fillStyle = '#2e8b3a'; g.fillText('合出西瓜了！', 0, 0); g.restore();
    } else G.melonT = null;
  }
}
/* 手機震動：Android 用 vibrate；iPhone（iOS 18 以後）用「開關」元件的觸覺回饋 */
let MHAP = null, MHAPT = 0;
function mHaptic(level) {
  if (!SNDON()) return;
  const now = performance.now(); if (now - MHAPT < 70) return; MHAPT = now;
  try { if (navigator.vibrate) { navigator.vibrate(level >= 3 ? [30, 40, 50] : level === 2 ? 28 : 14); return; } } catch (e) { /* ignore */ }
  try {
    if (!MHAP) { MHAP = document.createElement('label'); MHAP.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none'; MHAP.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(MHAP); }
    MHAP.click(); if (level >= 3) setTimeout(() => MHAP.click(), 90);
  } catch (e) { /* ignore */ }
}
/* 音效：用程式即時合成（不用音效檔），可以在遊戲右上角關掉 */
const SNDON = () => LS.get('ourtwo.snd') !== '0';
function mSndUI() { const b = $('#mg-snd'); if (b) b.textContent = SNDON() ? '音效 開' : '音效 關'; }
let MAC = null;
function mAudio() {
  if (!SNDON()) return null;
  try { if (!MAC) MAC = new (window.AudioContext || window.webkitAudioContext)(); if (MAC.state === 'suspended') MAC.resume(); } catch (e) { return null; }
  return MAC;
}
function sTone(ac, f0, f1, dur, type, vol, at) {
  const t = ac.currentTime + (at || 0), o = ac.createOscillator(), v = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(vol, t + 0.008); v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(v); v.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
function sNoise(ac, dur, vol, freq, at) {
  const t = ac.currentTime + (at || 0), n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), v = ac.createGain();
  s.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; v.gain.value = vol; s.connect(f); f.connect(v); v.connect(ac.destination); s.start(t);
}
let MSNDT = 0;
function sfx(k, a, b) {
  const ac = mAudio(); if (!ac) return;
  try {
    if (k === 'pop') { const f = 900 * Math.pow(0.9, a) * Math.pow(1.09, Math.min(b, 8) - 1); sTone(ac, f, f * 1.7, 0.13, 'sine', 0.32); sTone(ac, f * 2, f * 2.6, 0.06, 'triangle', 0.1); if (a >= 6) sTone(ac, f / 2, f / 3, 0.25, 'sine', 0.25); }
    else if (k === 'thud') { const now = ac.currentTime; if (now - MSNDT < 0.06) return; MSNDT = now; const v = Math.min(0.35, a * 0.6); sTone(ac, 150, 55, 0.12, 'sine', v); sNoise(ac, 0.05, v * 0.5, 600); }
    else if (k === 'drop') sTone(ac, 520, 380, 0.05, 'triangle', 0.08);
    else if (k === 'shot') { sNoise(ac, 0.3, 0.6, 2400); sTone(ac, 180, 45, 0.25, 'sine', 0.4); }
    else if (k === 'quake') { sNoise(ac, 0.7, 0.55, 220); sTone(ac, 70, 40, 0.6, 'sine', 0.35); }
    else if (k === 'melon') [523, 659, 784, 1047, 1319].forEach((f, i) => { sTone(ac, f, f, 0.22, 'triangle', 0.22, i * 0.11); sTone(ac, f / 2, f / 2, 0.22, 'sine', 0.12, i * 0.11); });
  } catch (e) { /* ignore */ }
}
/* 合成路線：11 種水果排一排，這局合到的亮起來 */
function mRoute() {
  const G = MG_, rt = $('#mg-route'); if (!G || !rt) return;
  rt.innerHTML = FRUITS.map((f, i) => '<span class="' + (i <= G.maxLv ? 'on' : '') + (i === FRUITS.length - 1 ? ' goal' : '') + '"><img src="' + fimgs()[i].src + '" alt="' + f[0] + '"></span>').join('');
  const lab = $('#mg-route-lab'); if (lab) lab.textContent = G.maxLv >= FRUITS.length - 1 ? '🍉 合出西瓜了！' : '這局最大：第 ' + (G.maxLv + 1) + ' 級・離西瓜還差 ' + (FRUITS.length - 1 - G.maxLv) + ' 級';
}
function mAskRevive() {
  const box = $('#mg-over');
  box.innerHTML = '<p class="mg-over-t">快滿出來了！</p><p class="muted">要用掉一次「復活」嗎？會清掉上半部的水果，繼續玩。</p><p class="muted">今天還有 ' + MINV.revive + ' 次</p>' +
    '<div class="row" style="justify-content:center;gap:10px"><button class="btn" data-act="mgRevive">復活！</button><button class="btn ghost" data-act="mgGiveUp">不用了</button></div>';
  box.hidden = false;
}
function mRevive() {
  const G = MG_; if (!G || !MINV || MINV.revive <= 0) return;
  MINV.revive--; mInvSave();
  G.bodies = G.bodies.filter(b => b.y - b.r > MH * 0.5);
  G.overT = 0; G.paused = false; G.askedRevive = false; G.notes.push({ t: G.t, s: '復活！' });
  $('#mg-over').hidden = true; mItemsUI();
}
function mShootAt(px, py) {
  const G = MG_; if (!G) return;
  let hit = null; for (const b of G.bodies) { if (Math.hypot(b.x - px, b.y - py) <= b.r * 1.15 && (!hit || b.r < hit.r)) hit = b; }
  if (!hit) { G.notes.push({ t: G.t, s: '沒打到，再點一次' }); return; }
  G.bodies = G.bodies.filter(b => b !== hit); G.pops.push({ x: hit.x, y: hit.y, t: G.t, s: '', hit: 1, r: hit.r }); sfx('shot'); mHaptic(2); mShake(G, 2.2, 0.3); G.freeze = 0.08;
  MINV.shot--; mInvSave(); G.mode = ''; mItemsUI();
}
function mQuake() {
  const G = MG_; if (!G) return;
  for (const b of G.bodies) { b.py = b.y + 0.35 + Math.random() * 0.25; b.px = b.x + (Math.random() - 0.5) * 0.6; }
  const st = $('.mg-stage2'); if (st) { st.classList.remove('quake'); void st.offsetWidth; st.classList.add('quake'); }
  mHaptic(3); sfx('quake'); mShake(G, 2.5, 0.6);
  MINV.quake--; mInvSave(); mItemsUI();
}
function mLoop(ts) {
  const G = MG_; if (!G) return;
  const dt = Math.min(1 / 30, G.last ? (ts - G.last) / 1000 : 1 / 60); G.last = ts;
  G.rt = (G.rt || 0) + dt;
  /* 打擊停頓：合成那一下整個畫面停一瞬間 */
  if (G.freeze > 0) G.freeze -= dt;
  else if (!G.over && !G.paused) mStep(G, dt);
  mDraw(G);
  G.raf = requestAnimationFrame(mLoop);
}
function mDrop() {
  const G = MG_; if (!G || G.over || G.paused || G.mode || G.cool > 0) return;
  const cr = FRUITS[G.cur][1], x = Math.min(MW - cr, Math.max(cr, G.aim));
  /* 丟下去時加一點點左右誤差（看不出來），疊在正上方的水果才會自然滾下來，不會疊成一根柱子 */
  mAdd(G, Math.min(MW - cr, Math.max(cr, x + (Math.random() - 0.5) * 0.6)), 10, G.cur);
  /* 西部神射手：最近丟的 5 顆裡有 3 顆一樣 → 射爆（算過之後清空重算） */
  G.recent = (G.recent || []).concat(G.cur).slice(-5);
  if (G.recent.filter(v => v === G.cur).length >= 3) { G.recent = []; mGain(G, 'shot'); }
  sfx('drop'); G.prev = G.cur; G.dropX = x; G.cur = G.next; G.next = mNext(G); G.cool = 0.55;
}
function mergeBest() { const m = PL('merge') || {}; return { him: m.him || 0, her: m.her || 0, top: m.top || [] }; }
function mergeOver(G) {
  if (G.saved) return; G.saved = true; setTimeout(mItemsUI, 0);
  const mk = meKey(), m = mergeBest(), isBest = G.score > (m[mk] || 0);
  const top = m.top.concat([{ by: S.me, s: G.score, ts: Date.now() }]).sort((a, b) => b.s - a.s).slice(0, 10);
  const ml = (PL('merge') || {}).maxlv || {};
  if (G.score > 0) wr(setDoc(dref('play', 'merge'), Object.assign({ top }, isBest ? { [mk]: G.score } : {}, G.maxLv > (ml[mk] || 0) ? { maxlv: { [mk]: G.maxLv } } : {}), { merge: true }));
  const box = $('#mg-over');
  box.innerHTML = '<p class="mg-over-t">遊戲結束</p><p class="mg-over-s">' + G.score + ' 分</p><p class="muted">這局合到：<img class="mg-over-f" src="' + fimgs()[Math.min(G.maxLv, FRUITS.length - 1)].src + '" alt=""></p>' + (isBest && G.score > 0 ? '<p class="quiz-res">新紀錄！🎉</p>' : '<p class="muted">你的最高分 ' + (m[mk] || 0) + '</p>') +
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
    ov.innerHTML = '<div class="mg-top-bar mg-hud"><span class="mg-lbtns"><button class="btn ghost small" data-act="mgClose">‹ 離開</button><button class="btn ghost small mg-snd" data-act="mgSnd" id="mg-snd"></button></span><span class="mg-scorebox"><span class="mg-sl">分數</span><b id="mg-score">0</b><span class="mg-best" id="mg-best"></span></span><span class="mg-nextbox"><span class="mg-sl">下一個</span><span id="mg-next"></span></span></div>' +
      '<div class="mg-stage mg-stage2"><canvas id="mg-cv"></canvas><div class="mg-over" id="mg-over" hidden></div></div>' +
      '<div class="mg-bottom"><div class="mg-items" id="mg-items"></div><p class="mg-route-lab" id="mg-route-lab"></p><div class="mg-route" id="mg-route"></div><p class="mg-tip">手指左右移動對準，放開就丟下去・0.8 秒內連續合成有 Combo 加分</p></div>';
    document.body.appendChild(ov);
    const cv = $('#mg-cv');
    const aim = e => { const r = cv.getBoundingClientRect(); if (MG_) MG_.aim = (e.clientX - r.left) / r.width * MW; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); mAudio(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } aim(e); });
    cv.addEventListener('pointermove', e => { if (e.buttons || e.pointerType === 'touch') aim(e); });
    cv.addEventListener('pointerup', e => {
      if (MG_ && MG_.mode === 'shot') { const r = cv.getBoundingClientRect(); mShootAt((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.width * MW); return; }
      aim(e); mDrop();
    });
    ['gesturestart', 'gesturechange', 'touchmove'].forEach(n => ov.addEventListener(n, e => e.preventDefault(), { passive: false }));
  }
  ov.hidden = false; document.documentElement.classList.add('mg-open');
  if (MG_) cancelAnimationFrame(MG_.raf);
  mInvLoad(); MG_ = mergeNew(); $('#mg-over').hidden = true; mItemsUI(); mSndUI(); const bx = $('#mg-best'); bx.classList.remove('flash'); $('#mg-route').dataset.lv = ''; 
  MG_.raf = requestAnimationFrame(mLoop);
}
function mergeClose() {
  if (MG_) { cancelAnimationFrame(MG_.raf); if (!MG_.over && MG_.score > 0) { MG_.over = true; mergeOver(MG_); } MG_ = null; }
  const ov = $('#mg'); if (ov) ov.hidden = true; document.documentElement.classList.remove('mg-open');
  if (curTab === 'play') renderPlay();
}
Object.assign(ACT, {
  mgOpen: mergeOpen, mgClose: mergeClose, mgAgain: mergeOpen,
  mgRevive() { mRevive(); },
  mgGiveUp() { const G = MG_; if (!G) return; G.paused = false; G.over = true; mergeOver(G); },
  mgSnd() { LS.set('ourtwo.snd', SNDON() ? '0' : '1'); mSndUI(); if (SNDON()) { sfx('pop', 3, 1); mHaptic(1); } },
  mgUse(el) {
    const G = MG_, k = el.dataset.k; if (!G || G.over || G.paused || !MINV || !MINV[k]) return;
    if (k === 'shot') { G.mode = G.mode === 'shot' ? '' : 'shot'; mItemsUI(); return; }
    if (k === 'quake') { mQuake(); return; }
    if (k === 'swap') { const c = G.cur; G.cur = G.next; G.next = c; MINV.swap--; mInvSave(); mItemsUI(); G.notes.push({ t: G.t, s: '換好了' }); }
  }
});

/* ---------- 真心話扭蛋機 ---------- */
/* 兩人共用一顆「目前的扭蛋」（play/gacha.cur）。誰都可以扭，但兩個人都回答完才能扭下一顆。
   兩人都答完時，整顆扭蛋（題目＋兩人回答）存進 truth 收藏，下面的「回答紀錄」可以回顧。
   先回答的人看不到對方答案，自己回答後才看得到，避免被影響。 */
const GCATS = [['sweet', '甜蜜', '#DF7F91'], ['memory', '回憶', '#7FA7D5'], ['future', '未來', '#69B5A4'], ['fun', '好笑', '#E5B857'], ['deep', '真心', '#AB90CA']];
const GACHA = [
  [0, '你最喜歡我身上的哪個地方？'], [0, '我做過最讓你心動的一件小事是什麼？'], [0, '我哪個習慣你其實偷偷覺得很可愛？'], [0, '用三個詞形容我。'], [0, '我讓你覺得最安心的是什麼時候？'],
  [0, '最近有什麼事讓你覺得「還好有你」？'], [0, '最想收到我送的什麼禮物？'], [0, '說一件今天想謝謝我的事。'], [0, '你覺得我穿什麼最好看？'], [0, '如果要幫我取一個新暱稱，你會取什麼？'],
  [0, '你最喜歡我們一起做的哪件小事？'], [0, '我們之間你最喜歡的一個小儀式是什麼？'], [0, '你什麼時候會突然很想我？'], [0, '你覺得我們最像的地方是什麼？'], [0, '如果可以為我做一件事，你想做什麼？'], [0, '我說過哪一句話讓你記到現在？'],
  [1, '第一次見到我的時候，你心裡在想什麼？'], [1, '你記得我們第一次約會吃了什麼嗎？'], [1, '如果可以回到過去，你想重來我們的哪一天？'], [1, '你最喜歡我們的哪張合照？為什麼？'], [1, '什麼時候你確定「就是這個人了」？'],
  [1, '我們一起去過最好玩的地方是哪裡？'], [1, '我們第一次吵架是為了什麼？'], [1, '你印象最深的一次一起過節是哪次？'], [1, '我第一次讓你感動是什麼時候？'], [1, '一起上班以來，最難忘的一天是哪天？'],
  [1, '你小時候的夢想是什麼？'], [1, '你學生時代最糗的一件事是什麼？'], [1, '說一個我可能不知道的你的小秘密。'], [1, '你最懷念的一道家鄉味或媽媽的菜是什麼？'], [1, '你記得我們交往後的第一份禮物嗎？'], [1, '最近一次被我逗笑是因為什麼？'],
  [2, '你覺得十年後的我們會在做什麼？'], [2, '你最想跟我一起去的國家是哪裡？'], [2, '你最想跟我一起完成的一件事？'], [2, '理想中我們的家長什麼樣子？'], [2, '退休後你最想過什麼樣的生活？'],
  [2, '明年你最想跟我一起達成的目標是什麼？'], [2, '如果中了一千萬，你第一件事想做什麼？'], [2, '想不想養寵物？想養什麼？叫什麼名字？'], [2, '你覺得我們家最需要添購的東西是什麼？'], [2, '如果可以一起開一間店，你想開什麼？'],
  [2, '下一次放長假，你想怎麼過？'], [2, '有什麼新東西是你想跟我一起學的？'], [2, '五年後，你希望我們的生活哪裡不一樣？'], [2, '你想跟我一起完成的「人生清單」第一項是什麼？'], [2, '老了以後，你最想跟我每天做什麼？'], [2, '如果明天放假一整天，你最想跟我做什麼？'],
  [3, '如果我變成一隻動物，你覺得會是什麼？'], [3, '如果我們交換身體一天，你第一件事要做什麼？'], [3, '我做過最好笑的一件蠢事是什麼？'], [3, '如果你是店長，第一條新規定是什麼？'], [3, '店裡哪位客人讓你最印象深刻？'],
  [3, '模仿我生氣的樣子，然後描述一下。'], [3, '你覺得我們家誰比較像小孩？為什麼？'], [3, '如果只能選一樣，你選消夜還是早餐約會？'], [3, '我們之中誰比較會撒嬌？舉個例子。'], [3, '你覺得我上輩子是什麼？'],
  [3, '如果要拍一部我們的電影，片名叫什麼？'], [3, '你在我面前做過最不在乎形象的事？'], [3, '週末早上，你理想的起床方式是？'], [3, '你最想吐槽我的一個習慣是什麼？'], [3, '如果我們是一道料理，會是什麼？'], [3, '用一個 emoji 形容今天的我。'],
  [4, '你最想對我說，但一直沒說出口的話？'], [4, '我們吵架時，你最希望我怎麼做？'], [4, '最近有沒有什麼壓力是你還沒跟我說的？'], [4, '你覺得我最近有哪裡變了？'], [4, '有什麼小事是你希望我多做一點的？'],
  [4, '你最怕失去什麼？'], [4, '你覺得自己最需要被理解的地方是什麼？'], [4, '最近一次被我惹生氣是什麼時候？現在還氣嗎？'], [4, '你覺得我們關係中最需要努力的是什麼？'], [4, '什麼樣的時候你會覺得被我忽略？'],
  [4, '如果可以改變自己的一個個性，你想改什麼？'], [4, '你心目中「好的另一半」最重要的是什麼？'], [4, '你覺得我最近壓力大的原因是什麼？'], [4, '最近一次哭是為了什麼？'], [4, '你希望我在你累的時候怎麼陪你？'], [4, '有什麼話想對一年後的我們說？']
];
let gAnim = false, gSeenTs = 0, truthLimit = 20, truthUnsub = null, gDraft = '';
function subTruth() {
  if (truthUnsub) { try { truthUnsub(); } catch (e) { /* ignore */ } }
  truthUnsub = onSnapshot(query(col('truth'), orderBy('ts', 'desc'), limit(truthLimit)), snap => {
    S.truth = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    rerender();
  }, syncErr);
}
const gCur = () => { const g = PL('gacha'); return g && g.cur && g.cur.q ? g.cur : null; };
const gDone = c => !!(c && c.ans && c.ans.him && c.ans.her);
/* 兩人都答完、但還沒存進紀錄 → 看到的那一方幫忙存（同一個編號，重複存也沒關係） */
function gArchive() {
  const c = gCur(); if (!gDone(c) || c.done) return;
  wr(setDoc(dref('truth', String(c.ts)), { q: c.q, c: c.c, by: c.by, ts: c.ts, ans: { him: c.ans.him, her: c.ans.her }, at: Date.now() }));
  wr(updateDoc(dref('play', 'gacha'), { 'cur.done': true }));
}
/* 扭蛋機：美術給的三層圖（600×810 同一畫布疊放），扭蛋群晃動、把手旋轉 */
function gMachine(cls) {
  return '<div class="gacha ' + (cls || '') + '" aria-hidden="true"><img class="g-balls" src="gacha/gacha_balls.webp" alt=""><img class="g-body" src="gacha/gacha_body.webp" alt=""><img class="g-knob" src="gacha/gacha_knob.webp" alt=""></div>';
}
function gCapsule(c, open) {
  const col = GCATS[c.c] ? GCATS[c.c][2] : '#f4a3b5', name = GCATS[c.c] ? GCATS[c.c][1] : '';
  const key = GCATS[c.c] ? GCATS[c.c][0] : 'sweet';
  return '<div class="g-capsule' + (open ? ' open' : '') + '"><img class="g-top" src="gacha/capsule_top_' + key + '.webp" alt=""><img class="g-bot" src="gacha/capsule_bottom.webp" alt=""></div>' +
    '<div class="g-paper' + (open ? ' show' : '') + '"><span class="g-tag" style="background:' + col + '">' + name + '</span><p>' + esc(c.q) + '</p><span class="muted g-by">' + esc(c.by) + ' 扭到的</span></div>';
}
function gAnswerHtml(c) {
  const mk = meKey(), ok = otherKey(mk), a = c.ans || {}, mine = a[mk], theirs = a[ok];
  if (gDone(c)) return '<div class="g-answers">' + ['him', 'her'].map(w => '<div class="g-ans">' + chip(w) + '<p>' + esc(a[w]) + '</p></div>').join('') + '</div>';
  let h = '';
  if (!mine) h += '<label class="f"><span>你的回答</span><textarea id="g-ta" maxlength="500" placeholder="寫下你的答案">' + esc(gDraft) + '</textarea></label><button class="btn" data-act="gAnswer">送出回答</button>';
  else h += '<div class="g-ans">' + chip(mk) + '<p>' + esc(mine) + '</p></div><button class="btn ghost small" data-act="gEdit">修改我的回答</button>';
  h += '<p class="muted">' + (theirs ? WHO[ok] + ' 已經回答了' + (mine ? '' : '，你回答後就看得到') : '等 ' + WHO[ok] + ' 回答…') + '</p>';
  return h;
}
function truthHtml() {
  const c = gCur(), busy = c && !gDone(c), list = S.truth || [];
  let body;
  if (!c) body = gMachine() + '<p class="muted g-hint">扭一顆扭蛋，兩個人都要回答喔</p>';
  else body = gMachine() + '<div class="g-result">' + gCapsule(c, true) + '</div>' + gAnswerHtml(c);
  return '<div class="card play-card" id="g-card"><div class="row"><h3>真心話扭蛋機</h3><span class="muted">' + (list.length ? '已收藏 ' + list.length + (list.length >= truthLimit ? '+' : '') + ' 顆' : '') + '</span></div>' + body +
    '<button class="btn g-spin" data-act="gSpin"' + (busy ? ' disabled' : '') + '>' + (busy ? '兩個人都回答完才能再扭' : '扭一顆！') + '</button>' +
    (list.length ? '<details class="g-hist" id="g-hist"' + detOpen('g-hist') + '><summary>回答紀錄</summary>' + list.map(t => {
      const col = GCATS[t.c] ? GCATS[t.c][2] : '#ccc';
      return '<div class="g-item"><p class="g-q"><i style="background:' + col + '"></i>' + esc(t.q) + '</p>' + ['him', 'her'].map(w => '<p class="g-a">' + chip(w) + ' ' + esc((t.ans || {})[w] || '') + '</p>').join('') + '<p class="muted g-date">' + md(new Date(t.ts)) + '・' + esc(t.by || '') + ' 扭的</p></div>';
    }).join('') + (list.length >= truthLimit ? '<button class="btn ghost small" data-act="gMore">看更早的</button>' : '') + '</details>' : '') + '</div>';
}
/* 扭蛋動畫：轉把手、扭蛋晃動 → 掉出一顆 → 打開看到題目 */
function gPlay(c, done) {
  const box = $('#pw-truth'); if (!box) { done(); return; }
  gAnim = true;
  box.innerHTML = '<div class="card play-card" id="g-card"><div class="row"><h3>真心話扭蛋機</h3></div>' + gMachine('spinning') + '<div class="g-result">' + gCapsule(c, false) + '</div><button class="btn g-spin" disabled>扭扭扭…</button></div>';
  const res = $('.g-result', box); res.classList.add('falling');
  setTimeout(() => { const cap = $('.g-capsule', box); if (cap) cap.classList.add('open'); const p = $('.g-paper', box); if (p) p.classList.add('show'); }, 1700);
  setTimeout(() => { gAnim = false; done(); }, 2500);
}
function gWatch() {
  const c = gCur();
  if (c && c.ts !== gSeenTs) {
    const first = gSeenTs === 0; gSeenTs = c.ts;
    if (!first && c.by !== S.me && curTab === 'play' && !gAnim) { gPlay(c, () => renderPlay()); return true; }
  }
  if (c && gDone(c) && !c.done) gArchive();
  return false;
}
Object.assign(ACT, {
  gSpin() {
    const g = PL('gacha') || {}, c = gCur();
    if (gAnim || (c && !gDone(c))) return;
    let used = (g.used || []).filter(n => n < GACHA.length);
    if (used.length >= GACHA.length) used = [];
    const pool = GACHA.map((x, i) => i).filter(i => !used.includes(i)), n = pool[Math.floor(Math.random() * pool.length)];
    const cur = { n, c: GACHA[n][0], q: GACHA[n][1], by: S.me, ts: Date.now(), ans: {} };
    gSeenTs = cur.ts; gDraft = '';
    wr(setDoc(dref('play', 'gacha'), { cur, used: used.concat([n]) }));
    gPlay(cur, () => renderPlay());
  },
  gAnswer() {
    const c = gCur(), v = ($('#g-ta') || {}).value; if (!c) return;
    const t = (v || '').trim(); if (!t) { toast('先寫下你的答案'); return; }
    gDraft = '';
    wr(updateDoc(dref('play', 'gacha'), { ['cur.ans.' + meKey()]: t }));
  },
  gEdit() {
    const c = gCur(); if (!c || gDone(c)) return;
    gDraft = (c.ans || {})[meKey()] || '';
    wr(updateDoc(dref('play', 'gacha'), { ['cur.ans.' + meKey()]: deleteField() }));
  },
  gMore() { truthLimit += 20; subTruth(); }
});

document.addEventListener('input', e => { if (e.target && e.target.id === 'g-ta') gDraft = e.target.value; });

/* 畫面重畫時記住哪些摺疊區塊是打開的（另一支手機更新資料時，不會把你正在看的清單收起來） */
/* 整頁捲動改由 body 自己捲（iPhone 主畫面 App 捲動時下方選單才不會跟著跑），回到頂端要捲 body */
function scrollTop0() { document.body.scrollTop = 0; window.scrollTo(0, 0); }
const OPEN_DET = new Set();
document.addEventListener('toggle', e => { const d = e.target; if (d && d.tagName === 'DETAILS' && d.id) { if (d.open) OPEN_DET.add(d.id); else OPEN_DET.delete(d.id); } }, true);
const detOpen = id => OPEN_DET.has(id) ? ' open' : '';

/* ---------- 射氣球 ---------- */
/* 夜市玩法：一局 7 支鏢、6×6 氣球。手指按住瞄準（準星會像手一樣微微晃），放開射出；射在氣球身上才會破。
   得分：每破一顆 1 點，橫／直／斜連續 4 顆以上算一條線，每條線加 5 點。
   點數存在 play/balloon.pts，各自累積；用點數向另一半換獎勵，換到的變成「兌換券」（coupons）。 */
const BN = 6, BDARTS = 7, BLINE = 4, BLINE_PTS = 5;
/* 難度（單位都是「一格」）：手抖有大晃／穩定兩段（像呼吸），氣球會飄，擦到邊緣會彈開，出手有一點誤差。
   電腦模擬：亂射命中約 5 成（全中約 1%），抓穩定時機約 8 成（全中約 17%）。 */
const B_SHAKE = 0.6, B_CALM = 0.12, B_PERIOD = 2.6, B_CALMFRAC = 0.25, B_CORE = 0.72, B_DRIFTX = 0.14, B_DRIFTY = 0.07, B_SCATTER = 0.05;
const bGauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function bDrift(G, i, t) { const p = G.ph[i], c = i % BN; let x = B_DRIFTX * Math.sin(t * 0.9 + p[0]); if (c === 0) x = Math.abs(x); else if (c === BN - 1) x = -Math.abs(x); return { x, y: B_DRIFTY * Math.sin(t * 1.3 + p[1]) }; }
function bShake(t) { const ph = (t % B_PERIOD) / B_PERIOD; return ph < B_CALMFRAC ? B_CALM : B_SHAKE * (0.6 + 0.4 * Math.sin(ph * Math.PI)); }
const BCOL = ['#F15E61', '#F39D53', '#EFCB55', '#6BBEA4', '#6DAEE5', '#B283CA'];
/* 美術的氣球圖：256×256，本體橢圓中心 (128,120)、半徑 (100,110)。命中判定用同一個橢圓。 */
const BRX = 100 / 256, BRY = 110 / 256, BOY = (120 - 128) / 256;
let BIMG = null;
const bimgs = () => BIMG || (BIMG = BCOL.map((c, i) => { const im = new Image(); im.src = 'balloon/balloon_' + (i + 1) + '.webp'; return im; }));
/* 其他美術圖：破掉的氣球、木板、飛鏢（鏢尖在 (32,8)） */
const BART = {};
const bart = n => { if (!BART[n]) { const im = new Image(); im.src = 'balloon/' + n + '.webp'; BART[n] = im; } const im = BART[n]; return im.complete && im.naturalWidth ? im : null; };
/* 直接兌換＝保證拿到但比較貴；想碰運氣就去抽一番賞 */
const BREWARDS = [['親親', 20], ['抱抱', 20], ['撒嬌一次', 20], ['買飲料', 50], ['洗碗一次', 50], ['按摩 10 分鐘', 50], ['跑腿一次', 120], ['掃地', 120], ['陪看一部電影', 120], ['早餐服務', 120]];
let BG = null, couponUnsub = null;
const BLIMIT = 3;
const bInfo = () => { const b = PL('balloon') || {}; return { limit: b.limit || BLIMIT, daily: b.daily || {}, pts: b.pts || {}, best: b.best || {}, rewards: (b.rewards && b.rewards.length ? b.rewards : BREWARDS.map(r => ({ n: r[0], p: r[1] }))) }; };
function subCoupons() {
  if (couponUnsub) { try { couponUnsub(); } catch (e) { /* ignore */ } }
  couponUnsub = onSnapshot(query(col('coupons'), orderBy('ts', 'desc'), limit(60)), snap => { S.coupons = snap.docs.map(d => Object.assign({ id: d.id }, d.data())); rerender(); }, syncErr);
}
function bLines(p) {
  let n = 0; const at = (r, c) => r >= 0 && c >= 0 && r < BN && c < BN && p[r * BN + c];
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    for (let r = 0; r < BN; r++) for (let c = 0; c < BN; c++) {
      if (!at(r, c) || at(r - dr, c - dc)) continue; /* 只從一段連續的起點開始數 */
      let k = 0; while (at(r + dr * k, c + dc * k)) k++;
      if (k >= BLINE) n++;
    }
  }
  return n;
}
/* 每人每天可以玩幾局：射出第一支鏢才算一局 */
function bPlayedToday(mk) { const d = bInfo().daily[mk]; return d && d.d === TODAY ? d.n || 0 : 0; }
function bLeftToday() { return Math.max(0, bInfo().limit - bPlayedToday(meKey())); }
function bNew() {
  return { popped: new Array(BN * BN).fill(false), ci: Array.from({ length: BN * BN }, () => Math.floor(Math.random() * BCOL.length)), ph: Array.from({ length: BN * BN }, () => [Math.random() * 6.28, Math.random() * 6.28]), falls: [], darts: BDARTS, stuck: [], fly: null, bursts: [], aim: null, t0: performance.now(), done: false, raf: 0 };
}
function bScore(G) { const pops = G.popped.filter(Boolean).length, lines = bLines(G.popped); return { pops, lines, pts: pops + lines * BLINE_PTS }; }
function bDraw() {
  const G = BG, cv = $('#bl-cv'); if (!G || !cv) return;
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, S_ = r.width;
  if (cv.width !== Math.round(S_ * dpr)) { cv.width = Math.round(S_ * dpr); cv.height = Math.round(S_ * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cell = S_ / BN, now = performance.now();
  const bd = bart('board');
  if (bd) g.drawImage(bd, 0, 0, S_, S_);
  else { g.fillStyle = '#e8c48c'; g.fillRect(0, 0, S_, S_); }
  g.strokeStyle = 'rgba(120,80,40,.12)'; g.lineWidth = 1;
  if (!bd) for (let i = 1; i < 14; i++) { g.beginPath(); g.moveTo(0, i * S_ / 14 + Math.sin(i) * 3); g.bezierCurveTo(S_ / 3, i * S_ / 14 - 4, S_ * 2 / 3, i * S_ / 14 + 4, S_, i * S_ / 14); g.stroke(); }
  const tt = (now - G.t0) / 1000;
  /* 沒射中、插在木板上的鏢畫在氣球後面 */
  const dimB = bart('dart');
  G.stuck.filter(d => !d.hit).forEach(d => { if (dimB) { const w = cell * 0.36 * 0.9, h = w * 160 / 64; g.save(); g.translate(d.x * S_, d.y * S_); g.rotate(d.a); g.drawImage(dimB, -w * 32 / 64, -h * 8 / 160, w, h); g.restore(); } });
  for (let i = 0; i < BN * BN; i++) {
    const dr = G.popped[i] ? G.popped[i] : bDrift(G, i, tt);
    const cx = (i % BN + 0.5 + dr.x) * cell, cy = (Math.floor(i / BN) + 0.5 + BOY + dr.y) * cell, rx = cell * BRX, ry = cell * BRY, colr = BCOL[G.ci[i]];
    if (G.popped[i]) {
      const pim = bart('popped_' + (G.ci[i] + 1));
      if (pim) { g.drawImage(pim, cx - cell / 2, cy - BOY * cell - cell / 2, cell, cell); continue; }
      g.fillStyle = colr; g.globalAlpha = 0.85;
      for (let k = 0; k < 5; k++) { const a = k * 1.3 + i; g.beginPath(); g.ellipse(cx + Math.cos(a) * rx * 0.35, cy + Math.sin(a) * ry * 0.3, rx * 0.16, ry * 0.08, a, 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1; continue;
    }
    const wob = 0, im = bimgs()[G.ci[i]];
    if (im.complete && im.naturalWidth) { g.drawImage(im, cx - cell / 2, cy - BOY * cell - cell / 2 + wob, cell, cell); continue; }
    const gr = g.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4 + wob, rx * 0.1, cx, cy + wob, ry * 1.1);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, colr); gr.addColorStop(1, colr);
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy + wob, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(74,63,69,.55)'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = colr; g.beginPath(); g.moveTo(cx, cy + ry + wob - 2); g.lineTo(cx - 4, cy + ry + wob + 5); g.lineTo(cx + 4, cy + ry + wob + 5); g.closePath(); g.fill(); g.stroke();
  }
  const dart = (x, y, s, ang) => {
    const dim = bart('dart');
    if (dim) { const w = cell * 0.36 * s, h = w * 160 / 64; g.save(); g.translate(x, y); g.rotate(ang); g.drawImage(dim, -w * 32 / 64, -h * 8 / 160, w, h); g.restore(); return; }
    g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
    g.strokeStyle = '#4a3f45'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 22); g.stroke();
    g.fillStyle = '#e76f6f'; g.beginPath(); g.moveTo(0, 14); g.lineTo(-6, 24); g.lineTo(0, 21); g.lineTo(6, 24); g.closePath(); g.fill();
    g.fillStyle = '#9aa3ad'; g.beginPath(); g.arc(0, 0, 1.6, 0, Math.PI * 2); g.fill(); g.restore();
  };
  G.stuck.forEach(d => { if (d.hit || !dimB) dart(d.x * S_, d.y * S_, 0.9, d.a); });
  /* 擦到邊緣被彈開的飛鏢：往下掉、淡出 */
  G.falls = G.falls.filter(f => now - f.t < 700);
  G.falls.forEach(f => {
    const k = (now - f.t) / 700; g.globalAlpha = 1 - k;
    dart(f.x * S_ + k * 18 * f.dir, f.y * S_ + k * k * cell * 1.6, 0.9, f.a + k * 2.2 * f.dir);
    g.font = Math.round(cell * 0.3) + 'px Naikai, sans-serif'; g.textAlign = 'center'; g.fillStyle = '#7a3b2e';
    g.fillText('彈開！', f.x * S_, f.y * S_ - cell * 0.35 - k * 12); g.globalAlpha = 1;
  });
  G.bursts = G.bursts.filter(b => now - b.t < 450);
  G.bursts.forEach(b => {
    const k = (now - b.t) / 450; g.strokeStyle = b.c; g.lineWidth = 3 * (1 - k); g.globalAlpha = 1 - k;
    for (let j = 0; j < 8; j++) { const a = j * Math.PI / 4; g.beginPath(); g.moveTo(b.x * S_ + Math.cos(a) * cell * 0.2 * (1 + k), b.y * S_ + Math.sin(a) * cell * 0.2 * (1 + k)); g.lineTo(b.x * S_ + Math.cos(a) * cell * 0.5 * (0.5 + k), b.y * S_ + Math.sin(a) * cell * 0.5 * (0.5 + k)); g.stroke(); }
    g.globalAlpha = 1;
  });
  if (G.fly) {
    const k = Math.min(1, (now - G.fly.t) / 220), x = 0.5 + (G.fly.x - 0.5) * k, y = 1.15 + (G.fly.y - 1.15) * k;
    dart(x * S_, y * S_, 1.6 - 0.7 * k, G.fly.a);
    if (k >= 1) bLand();
  }
  if (G.aim && !G.fly && G.darts > 0) {
    const p = bAimPos(), sh = bShake((now - G.t0) / 1000); g.strokeStyle = 'rgba(192,40,60,.9)'; g.lineWidth = 2;
    g.beginPath(); g.arc(p.x * S_, p.y * S_, cell * (0.1 + sh * 0.3), 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(p.x * S_ - cell * 0.28, p.y * S_); g.lineTo(p.x * S_ + cell * 0.28, p.y * S_); g.moveTo(p.x * S_, p.y * S_ - cell * 0.28); g.lineTo(p.x * S_, p.y * S_ + cell * 0.28); g.stroke();
  }
  const sc = bScore(G);
  $('#bl-darts').textContent = '🎯'.repeat(G.darts) || '—';
  $('#bl-score').textContent = sc.pts; $('#bl-lines').textContent = sc.lines;
}
/* 手會抖：一陣大晃、一陣比較穩（準星圈圈變小的時候最穩） */
function bAimPos() {
  const G = BG, t = (performance.now() - G.t0) / 1000, A = bShake(t) / BN;
  return { x: G.aim.x + A * (Math.sin(t * 2.3) + 0.6 * Math.sin(t * 3.9 + 1.3)) / 1.6, y: G.aim.y + A * (Math.sin(t * 1.9 + 2) + 0.6 * Math.sin(t * 4.4)) / 1.6 };
}
function bThrow() {
  const G = BG; if (!G || G.fly || G.darts <= 0 || !G.aim) return;
  if (G.darts === BDARTS && !G.counted) {
    if (bLeftToday() <= 0) { G.aim = null; toast('今天的次數用完了，明天再來'); return; }
    G.counted = true; const mk = meKey();
    wr(setDoc(dref('play', 'balloon'), { daily: { [mk]: { d: TODAY, n: bPlayedToday(mk) + 1 } } }, { merge: true }));
  }
  const p0 = bAimPos(), p = { x: p0.x + bGauss() * B_SCATTER / BN, y: p0.y + bGauss() * B_SCATTER / BN }; G.darts--; G.fly = { x: p.x, y: p.y, t: performance.now(), a: (Math.random() - 0.5) * 0.5 }; G.aim = null;
}
function bLand() {
  const G = BG, f = G.fly; G.fly = null;
  /* 找落點碰到的氣球（氣球會飄，所以用落地當下的位置算）：中間 72% 才會破，邊緣會彈開 */
  const t = (performance.now() - G.t0) / 1000; let best = -1, bd = 9;
  for (let i = 0; i < BN * BN; i++) {
    if (G.popped[i]) continue;
    const dr = bDrift(G, i, t), dx = (f.x * BN - (i % BN) - 0.5 - dr.x) / BRX, dy = (f.y * BN - Math.floor(i / BN) - 0.5 - BOY - dr.y) / BRY, d = Math.sqrt(dx * dx + dy * dy);
    if (d < bd) { bd = d; best = i; }
  }
  if (best >= 0 && bd <= B_CORE) {
    G.popped[best] = bDrift(G, best, t); G.stuck.push({ x: f.x, y: f.y, a: f.a, hit: true });
    G.bursts.push({ x: f.x, y: f.y, t: performance.now(), c: BCOL[G.ci[best]] }); try { navigator.vibrate && navigator.vibrate(30); } catch (e) { /* ignore */ }
  } else if (best >= 0 && bd <= 1) {
    G.falls.push({ x: f.x, y: f.y, a: f.a, t: performance.now(), dir: Math.random() < 0.5 ? -1 : 1 });
  } else G.stuck.push({ x: f.x, y: f.y, a: f.a });
  if (G.darts === 0 && !G.done) { G.done = true; setTimeout(bEnd, 700); }
}
function bLoop() { if (!BG) return; bDraw(); BG.raf = requestAnimationFrame(bLoop); }
function bEnd() {
  const G = BG; if (!G) return;
  const sc = bScore(G), mk = meKey(), info = bInfo(), total = (info.pts[mk] || 0) + sc.pts, best = Math.max(info.best[mk] || 0, sc.pts);
  wr(setDoc(dref('play', 'balloon'), { pts: { [mk]: total }, best: { [mk]: best } }, { merge: true }));
  const box = $('#bl-over');
  box.innerHTML = '<p class="mg-over-t">' + (sc.lines >= 2 ? '太神了！' : sc.lines ? '連線成功！' : sc.pops >= 5 ? '手感不錯！' : '再接再厲！') + '</p>' +
    '<p class="bl-res">破了 <b>' + sc.pops + '</b> 顆・連線 <b>' + sc.lines + '</b> 條</p><p class="mg-over-s">+' + sc.pts + ' 點</p>' +
    '<p class="muted">你現在有 ' + total + ' 點' + (sc.pts > (info.best[mk] || 0) && sc.pts > 0 ? '・單局新紀錄！' : '') + '</p><p class="muted">今天還可以玩 ' + bLeftToday() + ' 局</p>' +
    '<div class="row" style="justify-content:center;gap:10px;flex-wrap:wrap">' + (bLeftToday() > 0 ? '<button class="btn" data-act="blAgain">再來一局</button>' : '<button class="btn" data-act="blClose">今天玩完了</button>') + '<button class="btn ghost" data-act="blShop">去換獎勵</button></div>';
  box.hidden = false;
}
function bOpen() {
  ['board', 'dart', 'popped_1', 'popped_2', 'popped_3', 'popped_4', 'popped_5', 'popped_6'].forEach(bart); bimgs();
  if (bLeftToday() <= 0) { toast('今天 ' + bInfo().limit + ' 局都玩完了，明天再來！'); if (BG) bClose(false); return; }
  let ov = $('#bl');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'bl'; ov.className = 'mg';
    ov.innerHTML = '<div class="mg-top-bar"><button class="btn ghost small" data-act="blClose">‹ 離開</button><span class="mg-sc">點數 <b id="bl-score">0</b></span><span class="mg-nx">連線 <b id="bl-lines">0</b></span></div>' +
      '<p class="bl-darts" id="bl-darts"></p><div class="bl-stage"><canvas id="bl-cv"></canvas><div class="mg-over" id="bl-over" hidden></div></div>' +
      '<p class="mg-tip">手指按住瞄準，手會抖；準星圈圈縮小的那一下最穩，抓時機放開<br>打中氣球中間才會破，擦到邊會彈開・氣球會飄・連續 4 顆算一條線（+5 點）</p>';
    document.body.appendChild(ov);
    const cv = $('#bl-cv');
    /* 準星在手指上方一點，手指才不會擋住 */
    const aim = e => { const r = cv.getBoundingClientRect(); if (BG && !BG.fly && BG.darts > 0) BG.aim = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top - 56) / r.width }; };
    ov.addEventListener('pointerdown', e => { if (e.target.closest('button') || !BG || BG.done) return; e.preventDefault(); aim(e); });
    ov.addEventListener('pointermove', e => { if (BG && BG.aim) aim(e); });
    ov.addEventListener('pointerup', e => { if (BG && BG.aim) { aim(e); bThrow(); } });
    ov.addEventListener('pointercancel', () => { if (BG) BG.aim = null; });
    ['gesturestart', 'gesturechange', 'touchmove'].forEach(n => ov.addEventListener(n, e => e.preventDefault(), { passive: false }));
  }
  ov.hidden = false; document.documentElement.classList.add('mg-open');
  if (BG) cancelAnimationFrame(BG.raf);
  BG = bNew(); $('#bl-over').hidden = true; bLoop();
}
function bClose(toShop) {
  if (BG) { cancelAnimationFrame(BG.raf); if (!BG.done && BG.darts < BDARTS) { BG.done = true; const sc = bScore(BG); if (sc.pts) { const mk = meKey(), info = bInfo(); wr(setDoc(dref('play', 'balloon'), { pts: { [mk]: (info.pts[mk] || 0) + sc.pts }, best: { [mk]: Math.max(info.best[mk] || 0, sc.pts) } }, { merge: true })); } } BG = null; }
  const ov = $('#bl'); if (ov) ov.hidden = true; document.documentElement.classList.remove('mg-open');
  if (curTab === 'play') renderPlay();
  if (toShop) setTimeout(() => { const s = $('#bl-shop'); if (s) { s.open = true; OPEN_DET.add('bl-shop'); s.scrollIntoView({ block: 'start' }); } }, 50);
}
/* 一樣的兌換券疊成一張，顯示「×張數」；按使用時先用掉最舊的那張 */
function cpGroup(list) {
  const m = new Map();
  for (const c of list) { const k = c.to + '|' + c.from + '|' + c.what; const g = m.get(k); if (g) { g.n++; if (c.ts < g.c.ts) g.c = c; } else m.set(k, { c, n: 1 }); }
  return [...m.values()];
}
function couponRow(c, mine, n) {
  return '<li class="bl-cp' + (c.used ? ' used' : '') + '"><img class="bl-cp-i" src="balloon/coupon.webp" alt=""><span class="bl-cp-n">' + esc(c.what) + (n > 1 ? ' <b class="bl-cp-x">×' + n + '</b>' : '') + '<small class="bl-cp-s muted">' + (c.used ? md(new Date(c.usedAt || c.ts)) + ' 兌換了' : (c.from === S.me ? '你要兌現' : '由 ' + c.from + ' 兌現')) + '</small></span>' +
    (!c.used && mine ? '<button class="btn small" data-act="blUse" data-id="' + c.id + '">使用</button>' : '') + '</li>';
}
function balloonCardHtml() {
  const info = bInfo(), mk = meKey(), ok = otherKey(mk), mine = info.pts[mk] || 0;
  const cps = S.coupons || [], myCp = cps.filter(c => c.to === S.me && !c.used), theirCp = cps.filter(c => c.to !== S.me && !c.used), used = cps.filter(c => c.used).slice(0, 10);
  return '<div class="card play-card"><div class="row"><h3>射氣球 🎈</h3><span class="muted">' + MARK.him + ' ' + (info.pts.him || 0) + ' 點　' + MARK.her + ' ' + (info.pts.her || 0) + ' 點</span></div>' +
    '<p class="muted">夜市玩法！一局 7 支鏢，破一顆 1 點，連成一條線再加 5 點。點數可以拿去抽一番賞碰運氣，或存起來直接跟' + WHO[ok] + '換指定的獎勵。</p>' +
    (bLeftToday() > 0 ? '<button class="btn" data-act="blOpen">開始射氣球（今天還有 ' + bLeftToday() + ' 局）</button>' : '<button class="btn" disabled>今天 ' + info.limit + ' 局都玩完了，明天再來</button>') +
    '<details class="bl-shop" id="bl-shop"' + detOpen('bl-shop') + '><summary>直接兌換（保證拿到，你有 ' + mine + ' 點）</summary><ul class="bl-rw">' +
      info.rewards.map((r, i) => '<li><span>' + esc(r.n) + '</span><span class="muted">' + r.p + ' 點</span><button class="btn ghost small" data-act="blBuy" data-i="' + i + '"' + (mine < r.p ? ' disabled' : '') + '>換</button></li>').join('') +
    '</ul><button class="btn ghost small" data-act="blEditRw">編輯獎勵和每日次數</button></details>' +
    '<div class="bl-cps">' +
    (myCp.length ? '<details id="bl-mine"' + detOpen('bl-mine') + '><summary class="bl-h">你的兌換券 ' + myCp.length + ' 張（' + WHO[ok] + '要兌現）</summary><ul>' + cpGroup(myCp).map(g => couponRow(g.c, true, g.n)).join('') + '</ul></details>' : '<p class="bl-h">你的兌換券（' + WHO[ok] + '要兌現）</p><p class="muted">還沒有，快去射氣球</p>') +
    (theirCp.length ? '<details id="bl-theirs"' + detOpen('bl-theirs') + '><summary class="bl-h">' + WHO[ok] + '的兌換券 ' + theirCp.length + ' 張（你要兌現）</summary><ul>' + cpGroup(theirCp).map(g => couponRow(g.c, false, g.n)).join('') + '</ul></details>' : '<p class="bl-h">' + WHO[ok] + '的兌換券（你要兌現）</p><p class="muted">目前沒有</p>') +
    (used.length ? '<details id="bl-used"' + detOpen('bl-used') + '><summary class="muted">最近兌換過的</summary><ul>' + used.map(c => couponRow(c, false)).join('') + '</ul></details>' : '') + '</div></div>';
}
Object.assign(ACT, {
  blOpen() { bOpen(); }, blAgain() { bOpen(); }, blClose() { bClose(false); }, blShop() { bClose(true); },
  blBuy(el) {
    const info = bInfo(), r = info.rewards[Number(el.dataset.i)], mk = meKey(), have = info.pts[mk] || 0, other = S.me === '老公' ? '老婆' : '老公';
    if (!r || have < r.p) { toast('點數不夠喔'); return; }
    if (!confirm('用 ' + r.p + ' 點跟' + other + '換「' + r.n + '」？')) return;
    wr(setDoc(dref('play', 'balloon'), { pts: { [mk]: have - r.p } }, { merge: true }));
    wr(addDoc(col('coupons'), { to: S.me, from: other, what: r.n, cost: r.p, ts: Date.now(), used: false }));
    toast('換到了！兌換券放在下面，想用的時候按「使用」');
  },
  blUse(el) {
    const c = (S.coupons || []).find(x => x.id === el.dataset.id); if (!c) return;
    if (!confirm('現在要使用「' + c.what + '」嗎？')) return;
    wr(updateDoc(dref('coupons', c.id), { used: true, usedAt: Date.now() }));
    toast('已使用，叫' + c.from + '來兌現！');
  },
  blEditRw() {
    openSheet('<h3>射氣球設定</h3><p class="muted">一行一個，格式：獎勵名稱,點數（例如：親親,10）。兩支手機共用。</p>' +
      '<label class="f"><span>每人每天可以玩幾局</span><input id="rw-limit" type="number" inputmode="numeric" min="1" max="20" value="' + bInfo().limit + '"></label>' +
      '<textarea id="rw-ta" rows="12" style="width:100%">' + esc(bInfo().rewards.map(r => r.n + ',' + r.p).join('\n')) + '</textarea>' +
      '<div class="actions"><button class="btn ghost" data-act="blRwReset">恢復預設</button><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="blRwSave">存起來</button></div>');
  },
  blRwSave() {
    const l = $('#rw-ta').value.split('\n').map(s => s.trim()).filter(Boolean).map(s => { const m = s.split(/[,，]/); return { n: m[0].trim().slice(0, 20), p: Math.max(1, Math.min(999, parseInt(m[1], 10) || 10)) }; }).filter(r => r.n).slice(0, 30);
    if (!l.length) { toast('至少要一個獎勵'); return; }
    const lim = Math.max(1, Math.min(20, parseInt($('#rw-limit').value, 10) || BLIMIT));
    wr(setDoc(dref('play', 'balloon'), { rewards: l, limit: lim }, { merge: true })); closeSheet(); toast('設定存好了');
  },
  blRwReset() { wr(setDoc(dref('play', 'balloon'), { rewards: deleteField() }, { merge: true })); closeSheet(); toast('已恢復預設'); }
});

/* ---------- 一番賞 ---------- */
/* 兩人共用一箱 30 張籤（play/kuji）：A 賞 1、B 賞 2、C 賞 3、D 賞 6、E 賞 18，每抽必中；抽到最後一張的人另外得到「最後賞」。
   每抽花射氣球的點數（預設 8 點）。抽到的獎品變成兌換券（coupons），跟射氣球換來的放在一起。 */
const KTIERS = [['A', 1, '#e9b949'], ['B', 2, '#9fb4c7'], ['C', 3, '#d99a6c'], ['D', 6, '#8fc4a8'], ['E', 18, '#f2a7b8']];
const KCOST = 8;
const KPRIZES = { A: '對方包辦家事一整天', B: '一頓大餐（對方請客）', C: '按摩 30 分鐘', D: '買宵夜或飲料', E: ['親親', '抱抱', '撒嬌一次', '摸頭十下', '誇我三句'], last: '指定對方做一件事' };
let kDrawing = null;
const kInfo = () => { const k = PL('kuji') || {}; return { box: k.box || 0, tickets: k.tickets || [], prizes: Object.assign({}, KPRIZES, k.prizes || {}), cost: k.cost || KCOST, log: k.log || [], lastBy: k.lastBy || '' }; };
function kMakeBox(prizes) {
  const t = [];
  KTIERS.forEach(([tier, n]) => { for (let i = 0; i < n; i++) t.push({ t: tier, p: tier === 'E' ? prizes.E[Math.floor(Math.random() * prizes.E.length)] : prizes[tier], d: false }); });
  for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
  return t;
}
const kLeft = (tk, tier) => tk.filter(x => !x.d && (!tier || x.t === tier)).length;
const kColor = tier => (KTIERS.find(x => x[0] === tier) || ['', 0, '#c3a6e8'])[2];
function kujiCardHtml() {
  const k = kInfo(), mk = meKey(), have = (bInfo().pts[mk] || 0), left = kLeft(k.tickets), empty = !k.tickets.length || left === 0;
  const tiers = KTIERS.map(([tier, n, c]) => { const l = kLeft(k.tickets, tier); return '<li class="' + (k.tickets.length && !l ? 'gone' : '') + '"><img class="k-badge" src="kuji/badge_' + tier + '.webp" alt="' + tier + ' 賞"><span class="k-prize">' + esc(tier === 'E' ? k.prizes.E.join('／') : k.prizes[tier]) + '</span><span class="k-left">' + (k.tickets.length ? l : n) + '/' + n + '</span></li>'; }).join('') +
    '<li class="k-lastrow' + (k.lastBy ? ' gone' : '') + '"><img class="k-badge" src="kuji/badge_last.webp" alt="最後賞"><b class="k-lastname">最後賞</b><span class="k-prize">' + esc(k.prizes.last) + '</span><span class="k-left">' + (k.lastBy ? esc(k.lastBy) + ' 拿走了' : '抽到最後一張') + '</span></li>';
  let btn;
  if (!k.tickets.length) btn = '<button class="btn" data-act="kNewBox">開第一箱</button>';
  else if (empty) btn = '<p class="quiz-res">這一箱抽完了！</p><button class="btn" data-act="kNewBox">開新的一箱</button>';
  else btn = '<button class="btn" data-act="kDraw"' + (have < k.cost ? ' disabled' : '') + '>' + (have < k.cost ? '點數不夠（' + k.cost + ' 點一抽，你有 ' + have + ' 點）' : '抽一張（' + k.cost + ' 點，你有 ' + have + ' 點）') + '</button>';
  return '<div class="card play-card"><img class="k-header" src="kuji/kuji_header.webp" alt=""><div class="row"><h3>一番賞</h3><span class="muted">' + (k.box ? '第 ' + k.box + ' 箱・剩 ' + left + '/30 張' : '') + '</span></div>' +
    '<p class="muted">每抽必中！點數從射氣球來，抽到的獎品會變成兌換券。抽到最後一張的人另外拿「最後賞」。</p>' +
    '<ul class="k-tiers">' + tiers + '</ul>' + btn +
    (k.log.length ? '<details id="k-log"' + detOpen('k-log') + '><summary class="muted">最近抽到的</summary><ul class="k-log">' + k.log.slice(0, 15).map(l => '<li>' + byChip(l.by) + ' <img class="k-badge sm" src="kuji/badge_' + l.t + '.webp" alt="' + (l.t === 'last' ? '最後賞' : l.t + ' 賞') + '"> ' + esc(l.p) + ' <span class="muted">' + md(new Date(l.ts)) + '</span></li>').join('') + '</ul></details>' : '') +
    '<button class="btn ghost small" data-act="kEdit">編輯獎品（下一箱生效）</button></div>';
}
/* 抽籤流程（像真的一番賞）：
   ① 箱子裡攤開剩下的籤，自己挑一張（每張背後對應箱子裡一張真的籤）
   ② 沿著右邊的虛線把封條撕掉
   ③ 把折起來的籤往上掀開，才看到是哪一賞 */
let kStep = 0;
/* 籤的圖先載好再顯示，避免蓋子還沒出現、底下的獎品先露出來 */
const KIMG = {};
function kImg(name) { if (!KIMG[name]) { const im = new Image(); im.src = 'kuji/' + name + '.webp'; KIMG[name] = im.decode ? im.decode().catch(() => {}) : new Promise(r => { im.onload = im.onerror = r; }); } return KIMG[name]; }
function kPreload() { ['kuji_flap', 'kuji_strip', 'kuji_small', 'kuji_box', 'kuji_A', 'kuji_B', 'kuji_C', 'kuji_D', 'kuji_E', 'kuji_last'].forEach(kImg); }
function kBoxView() {
  kPreload();
  const k = kInfo(), idx = k.tickets.map((x, i) => x.d ? -1 : i).filter(i => i >= 0);
  let ov = $('#kj');
  if (!ov) { ov = document.createElement('div'); ov.id = 'kj'; ov.className = 'kj'; document.body.appendChild(ov); }
  /* 籤在箱子裡的位置每次打亂，避免記住哪個位置是 A 賞 */
  const order = idx.slice().sort(() => Math.random() - 0.5);
  ov.className = 'kj';
  ov.innerHTML = '<div class="kj-box"><p class="kj-title">從箱子裡挑一張（剩 ' + idx.length + ' 張）</p>' +
    '<div class="kj-pile">' + order.map(i => '<button class="kt" data-act="kPick" data-i="' + i + '" style="--r:' + (Math.random() * 6 - 3).toFixed(1) + 'deg" aria-label="選這張籤"></button>').join('') + '</div>' +
    '<button class="btn ghost" data-act="kClose">先不抽</button></div>';
  ov.hidden = false; document.documentElement.classList.add('mg-open');
}
function kTicketView(res) {
  const ov = $('#kj');
  kStep = 1; ov.className = 'kj';
  ov.innerHTML = '<div class="kj-box"><p class="kj-title" id="kj-step">① 沿著右邊的虛線，把封條撕掉</p>' +
    '<div class="kj-ticket"><div class="kj-in" style="background-image:url(kuji/kuji_' + res.t + '.webp)"><span class="kj-prize">' + esc(res.p) + '</span></div>' +
    '<div class="kj-flap"><span class="kj-no">No.' + String(res.no).padStart(2, '0') + '</span></div>' +
    '<div class="kj-strip" aria-label="封條"></div></div>' +
    (res.last ? '<div class="kj-lastone" hidden>🎉 最後一張！另外得到「最後賞」：' + esc(res.last) + '</div>' : '') +
    '<div class="kj-btns"><button class="btn ghost" data-act="kTear">撕掉封條</button></div></div>';
  const strip = $('.kj-strip', ov), flap = $('.kj-flap', ov);
  let s0 = null;
  strip.addEventListener('pointerdown', e => { e.preventDefault(); s0 = { x: e.clientX, y: e.clientY }; try { strip.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
  strip.addEventListener('pointermove', e => {
    if (!s0) return; const dy = e.clientY - s0.y, dx = e.clientX - s0.x, d = Math.max(Math.abs(dy), dx);
    strip.style.transform = 'translate(' + Math.max(0, dx) * 0.5 + 'px,' + dy * 0.6 + 'px) rotate(' + (dy / 12) + 'deg)';
    if (d > strip.offsetHeight * 0.45) { s0 = null; kTearStrip(); }
  });
  strip.addEventListener('pointerup', () => { if (s0) { s0 = null; strip.style.transform = ''; } });
  let f0 = null;
  flap.addEventListener('pointerdown', e => { if (kStep !== 2) return; e.preventDefault(); f0 = e.clientY; try { flap.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
  flap.addEventListener('pointermove', e => { if (f0 == null) return; const dy = f0 - e.clientY; flap.style.transform = 'rotateX(' + Math.min(170, Math.max(0, dy * 1.4)) + 'deg)'; if (dy > 70) { f0 = null; kOpen(); } });
  flap.addEventListener('pointerup', () => { if (f0 != null) { f0 = null; flap.style.transform = ''; kOpen(); } });
}
function kTearStrip() {
  const ov = $('#kj'); if (!ov || kStep !== 1) return;
  kStep = 2; ov.classList.add('stripped');
  $('#kj-step').textContent = '② 把折起來的籤往上掀開';
  $('.kj-btns', ov).innerHTML = '<button class="btn ghost" data-act="kOpen">打開</button>';
  try { navigator.vibrate && navigator.vibrate(20); } catch (e) { /* ignore */ }
}
function kOpen() {
  const ov = $('#kj'); if (!ov || kStep !== 2) return;
  kStep = 3; ov.classList.add('opened'); const fl = $('.kj-flap', ov); if (fl) fl.style.transform = '';
  $('#kj-step').textContent = '第 ' + kDrawing.no + ' 張';
  const lo = $('.kj-lastone', ov); if (lo) lo.hidden = false;
  $('.kj-btns', ov).innerHTML = '<button class="btn" data-act="kClose">收下兌換券</button>';
  try { navigator.vibrate && navigator.vibrate([30, 40, 30]); } catch (e) { /* ignore */ }
}
Object.assign(ACT, {
  kNewBox() {
    const k = kInfo(); if (k.tickets.length && kLeft(k.tickets)) return;
    wr(setDoc(dref('play', 'kuji'), { box: k.box + 1, tickets: kMakeBox(k.prizes), lastBy: '' }, { merge: true }));
    toast('新的一箱來了！');
  },
  kDraw() {
    const k = kInfo(), have = bInfo().pts[meKey()] || 0;
    if (kDrawing || have < k.cost || !kLeft(k.tickets)) return;
    kBoxView();
  },
  kPick(el) {
    const k = kInfo(), mk = meKey(), have = bInfo().pts[mk] || 0, i = Number(el.dataset.i);
    if (kDrawing || have < k.cost) return;
    if (!k.tickets[i] || k.tickets[i].d) { toast('這張剛被抽走了，換一張'); kBoxView(); return; }
    const left = kLeft(k.tickets), tk = k.tickets.map(x => Object.assign({}, x)), tix = tk[i];
    tix.d = true; tix.by = S.me; tix.ts = Date.now();
    const isLast = left === 1, other = S.me === '老公' ? '老婆' : '老公', no = 31 - left;
    const log = [{ by: S.me, t: tix.t, p: tix.p, ts: tix.ts }].concat(isLast ? [{ by: S.me, t: 'last', p: k.prizes.last, ts: tix.ts }] : []).concat(k.log).slice(0, 30);
    const patch = { tickets: tk, log }; if (isLast) patch.lastBy = S.me;
    kDrawing = { t: tix.t, p: tix.p, no, last: isLast ? k.prizes.last : '' };
    wr(setDoc(dref('play', 'kuji'), patch, { merge: true }));
    wr(setDoc(dref('play', 'balloon'), { pts: { [mk]: have - k.cost } }, { merge: true }));
    wr(addDoc(col('coupons'), { to: S.me, from: other, what: '【' + tix.t + '賞】' + tix.p, ts: tix.ts, used: false, src: 'kuji' }));
    if (isLast) wr(addDoc(col('coupons'), { to: S.me, from: other, what: '【最後賞】' + k.prizes.last, ts: tix.ts + 1, used: false, src: 'kuji' }));
    el.classList.add('picked');
    const res = kDrawing, wait = Promise.all([kImg('kuji_flap'), kImg('kuji_strip'), kImg('kuji_' + res.t)]);
    Promise.race([Promise.all([wait, new Promise(r => setTimeout(r, 450))]), new Promise(r => setTimeout(r, 6000))]).then(() => { if (kDrawing === res) kTicketView(res); });
  },
  kTear() { kTearStrip(); },
  kOpen() { kOpen(); },
  kClose() { kDrawing = null; kStep = 0; const ov = $('#kj'); if (ov) { ov.hidden = true; ov.className = 'kj'; } document.documentElement.classList.remove('mg-open'); if (curTab === 'play') renderPlay(); },
  kEdit() {
    const p = kInfo().prizes;
    openSheet('<h3>一番賞獎品</h3><p class="muted">改好後從「下一箱」開始生效。E 賞可以填好幾個，用逗號分開，抽到時隨機一個。</p>' +
      ['A', 'B', 'C', 'D'].map(t => '<label class="f"><span>' + t + ' 賞</span><input id="kp-' + t + '" maxlength="30" value="' + esc(p[t]) + '"></label>').join('') +
      '<label class="f"><span>E 賞（逗號分開）</span><input id="kp-E" maxlength="200" value="' + esc(p.E.join('，')) + '"></label>' +
      '<label class="f"><span>最後賞</span><input id="kp-last" maxlength="30" value="' + esc(p.last) + '"></label>' +
      '<label class="f"><span>一抽幾點</span><input id="kp-cost" type="number" inputmode="numeric" min="1" max="99" value="' + kInfo().cost + '"></label>' +
      '<div class="actions"><button class="btn ghost" data-act="close">取消</button><button class="btn" data-act="kSave">存起來</button></div>');
  },
  kSave() {
    const v = id => ($('#kp-' + id).value || '').trim(), E = v('E').split(/[,，、]/).map(s => s.trim()).filter(Boolean).slice(0, 10);
    if (!v('A') || !v('B') || !v('C') || !v('D') || !E.length || !v('last')) { toast('每一賞都要填'); return; }
    const cost = Math.max(1, Math.min(99, parseInt(v('cost'), 10) || KCOST));
    wr(setDoc(dref('play', 'kuji'), { prizes: { A: v('A'), B: v('B'), C: v('C'), D: v('D'), E, last: v('last') }, cost }, { merge: true }));
    closeSheet(); toast('存好了，下一箱生效（一抽 ' + cost + ' 點馬上生效）');
  }
});

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
