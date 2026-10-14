/* Ourtwo：夫妻專用的生活 App。資料存在 Firebase Firestore，兩支手機即時同步。 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, deleteField, query, orderBy, limit
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
const codeTxt = c => { const d = CODES[c]; if (!d) return '尚未輸入'; return d.e > d.s ? d.n + '　' + fm(d.s) + '–' + fm(d.e) : d.n; };


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
const S = { me: LS.get('ourtwo.me') === '老婆' ? '老婆' : '老公', shifts: {}, events: [], memos: [], notes: [], love: [], board: [], period: null };
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
  return '兩人都有空：' + free.map(r => fm(r[0]) + '–' + (r[1] === 1440 ? '24:00' : fm(r[1]))).join('、');
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
    '<div class="card"><div class="row"><h3>今天的行程</h3></div>' +
      (evs.length ? '<ul class="list">' + evs.map(evRow).join('') + '</ul>' : '<p class="empty">今天沒有行程</p>') + '</div>' +
    periodCard +
    '<button class="card tap" data-act="tab" data-v="board" style="font:inherit;color:inherit"><div class="row"><h3>黑板最新留言</h3><span>' + (unseenNotes().length ? '<span class="newtag">' + unseenNotes().length + ' 則新留言</span> ' : '') + (last ? byChip(last.by) : '') + '</span></div>' +
      (last ? noteView(last) + '<p class="muted" style="font-size:13px">' + fmtTs(last.ts) + '</p>' : '<p class="empty">黑板還是空的</p>') + '</button>' +
    '<div class="card"><div class="row"><h3>還沒做的清單</h3><button class="btn ghost small" data-act="tab" data-v="memo">備忘</button></div>' +
      (open.length ? '<ul class="list">' + open.slice(0, 3).map(m => '<li class="todo"><span class="tx">' + esc(m.text) + '</span>' + byChip(m.by) + '</li>').join('') + '</ul>' : '<p class="empty">全部都做完了</p>') + '</div>' +
    '<div class="card"><div class="row wrap"><span class="muted">外觀</span><div class="seg" role="group" aria-label="外觀">' + THEMES.map(t => '<button data-act="theme" data-v="' + t[0] + '" aria-pressed="' + (getTheme() === t[0]) + '">' + t[1] + '</button>').join('') + '</div></div>' +
      '<div class="row wrap"><span class="muted">新留言通知（' + notifyState() + '）</span><span class="row"><button class="btn ghost small" data-act="notifyOn">開啟</button><button class="btn ghost small" data-act="notifyTest">測試</button><button class="btn ghost small" data-act="notifyHelper">小幫手程式</button></span></div>' +
      '<div class="row wrap"><span class="muted">備份（班表、備忘、黑板全部）</span><span class="row"><button class="btn ghost small" data-act="backup">備份</button><button class="btn ghost small" data-act="restore">還原</button></span></div>' +
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
      '<div class="legend"><span>每格上排老公、下排老婆</span><span><i class="s s-A">A</i>早班</span><span><i class="s s-B">B</i>晚班</span><span><i class="s s-AB">AB</i>兩班都上</span><span><i class="s s-X">C</i>C 班 12–21</span><span><i class="s s-off">休</i>休假</span></div>' +
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
function startSync() {
  stopSync();
  unsubs.push(onSnapshot(col('shifts'), snap => { const o = {}; snap.forEach(d => { o[d.id] = d.data(); }); S.shifts = o; rerender(); }, syncErr));
  unsubs.push(listItems('events', 'events'));
  unsubs.push(listItems('memos', 'memos', () => S.memos.sort((a, b) => (b.ts || 0) - (a.ts || 0))));
  unsubs.push(listItems('notes', 'notes', () => S.notes.sort((a, b) => (b.ts || 0) - (a.ts || 0))));
  unsubs.push(listItems('love', 'love'));
  subBoard();
  unsubs.push(onSnapshot(dref('settings', 'period'), snap => { S.period = snap.exists() ? snap.data() : null; rerender(); }, syncErr));
  synced = true;
}
function stopSync() { if (boardUnsub) { try { boardUnsub(); } catch (e) { /* ignore */ } boardUnsub = null; } unsubs.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; synced = false; }

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
  async notifyHelper() {
    try {
      const t = (await (await fetch('push-worker.txt', { cache: 'no-store' })).text()).replace('__FID__', FID);
      openSheet('<h3>通知小幫手程式</h3><p class="muted">按下「複製全部」，再到 Cloudflare 的程式區貼上。</p>' +
        '<textarea id="helper-ta" readonly rows="8" style="width:100%;font-size:12px">' + esc(t) + '</textarea>' +
        '<div class="actions"><button class="btn ghost" data-act="close">關閉</button><button class="btn" data-act="copyHelper">複製全部</button></div>');
    } catch (e) { toast('讀取失敗：' + (e.message || e)); }
  },
  copyHelper() {
    const ta = $('#helper-ta'); if (!ta) return;
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ok) { toast('已複製，可以貼到 Cloudflare 了'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(() => toast('已複製，可以貼到 Cloudflare 了'), () => toast('沒複製成功，請長按文字框，選「全選」再「拷貝」'));
    else toast('沒複製成功，請長按文字框，選「全選」再「拷貝」');
  },
  async backup(el) {
    el.disabled = true; toast('備份中…');
    try {
      const out = { app: 'ourtwo', version: 1, exported: new Date().toISOString(), data: {} };
      let n = 0;
      for (const c of ['shifts', 'events', 'memos', 'notes', 'love', 'settings', 'board']) {
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
          if (!['shifts', 'events', 'memos', 'notes', 'love', 'settings', 'board'].includes(c)) continue;
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
window.addEventListener('resize', () => { if (booted && (curTab === 'board' || curTab === 'home')) RENDER[curTab](); });
window.addEventListener('online', () => { setNet(); if (booted && !synced) boot(); });
window.addEventListener('offline', setNet);

/* 開始 */
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
applyTheme();
try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (getTheme() === 'auto') applyTheme(); }); } catch (e) { /* ignore */ }
boot();

/* 在照片上畫：照片保留原本的長寬比（太極端的才會裁一點），縮到最長邊 1000、壓成 JPEG 再存，
   才不會超過 Firestore 單筆資料的大小上限 */
$('#photo').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
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
      draftPhoto = out; draftPA = pa; resetView(); paintPad();
    };
    im.src = rd.result;
  };
  rd.readAsDataURL(f);
});
