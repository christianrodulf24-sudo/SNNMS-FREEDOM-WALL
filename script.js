const $ = s => document.querySelector(s);
const K = {posts:'snmms_posts_v2', mine:'snmms_mine', react:'snmms_react', hidden:'snmms_hidden', theme:'snmms_theme'};
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const CATS = ['Shoutout','Confession','Question','Advice','Rant','Announcement'];
const COLORS = {yellow:'--n-yellow', pink:'--n-pink', green:'--n-green', blue:'--n-blue', orange:'--n-orange'};
const EMOJI = {love:'❤️', haha:'😂', wow:'😮', sad:'😢'};
const BAD = ['fuck','shit','bitch','putang','tangina','gago','bobo','tanga','ulol','pakyu'];

const H = 3600e3, now = Date.now();
const seed = [];

const CFG = window.FIREBASE_CONFIG || {};
const ONLINE = !!(window.firebase && CFG.apiKey && !CFG.apiKey.startsWith('PASTE'));
let db, uid;
let posts = ONLINE ? [] : (load(K.posts, null) || seed);
let mine = load(K.mine, []), reacted = load(K.react, {}), hidden = load(K.hidden, []);
let state = {cat:'All', q:'', sort:'new', pickCat:'Shoutout', pickColor:'yellow'};

const clean = t => t.replace(new RegExp(BAD.join('|'), 'gi'), m => '*'.repeat(m.length));
const ago = ts => {
  const m = Math.floor((Date.now() - ts) / 6e4);
  if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
};
const total = p => Object.values(p.r).reduce((a, b) => a + b, 0);
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
const rot = id => ((([...id].reduce((a, c) => a + c.charCodeAt(0), 0)) % 5) - 2) * 0.8;
const persist = () => { if (!ONLINE) { save(K.posts, posts); save(K.mine, mine); } save(K.react, reacted); save(K.hidden, hidden); };
const visible = p => !hidden.includes(p.id) && !(p.reports >= 3);
const inc = n => firebase.firestore.FieldValue.increment(n);

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function makeNote(p, preview) {
  const n = el('article', 'note');
  n.style.setProperty('--c', `var(${COLORS[p.color]})`);
  if (!preview) n.style.setProperty('--rot', rot(p.id) + 'deg');
  const meta = el('div', 'meta');
  meta.append(el('span', 'tag', p.cat), el('span', '', preview ? 'just now' : ago(p.ts)));
  n.append(meta, el('p', '', p.text));
  const foot = el('div', 'meta'); foot.append(el('span', '', '— ' + (p.name || 'Anonymous'))); n.append(foot);
  if (preview) return n;
  const acts = el('div', 'acts');
  for (const [k, e] of Object.entries(EMOJI)) {
    const b = el('button', 'react', `${e} ${p.r[k]}`);
    b.setAttribute('aria-pressed', reacted[p.id] === k);
    b.setAttribute('aria-label', `React ${k}`);
    b.onclick = () => react(p, k);
    acts.append(b);
  }
  const own = ONLINE ? p.uid === uid : mine.includes(p.id);
  const l = el('button', 'link', own ? 'Delete' : 'Report');
  l.onclick = () => own ? del(p) : report(p);
  acts.append(l); n.append(acts);
  return n;
}

function react(p, k) {
  const prev = reacted[p.id];
  if (prev) p.r[prev]--;
  if (prev === k) delete reacted[p.id]; else { p.r[k]++; reacted[p.id] = k; }
  persist(); render();
  if (ONLINE) {
    const u = {};
    if (prev) u['r.' + prev] = inc(-1);
    if (prev !== k) u['r.' + k] = inc(1);
    db.collection('posts').doc(p.id).update(u).catch(() => toast('Could not save reaction'));
  }
}
function del(p) { if (!confirm('Delete your note from the wall?')) return; if (ONLINE) db.collection('posts').doc(p.id).delete().catch(() => toast('Could not delete note')); posts = posts.filter(x => x.id !== p.id); persist(); render(); toast('Note deleted'); }
function report(p) { if (!confirm('Report this note? It will be hidden for you.')) return; if (ONLINE) db.collection('posts').doc(p.id).update({reports: inc(1)}).catch(() => {}); hidden.push(p.id); persist(); render(); toast('Reported and hidden'); }

function render() {
  const q = state.q.toLowerCase();
  let list = posts.filter(p => visible(p) && (state.cat === 'All' || p.cat === state.cat) &&
    (!q || p.text.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)));
  list.sort((a, b) => state.sort === 'top' ? total(b) - total(a) : state.sort === 'old' ? a.ts - b.ts : b.ts - a.ts);
  const grid = $('#wall-grid'); grid.replaceChildren(...list.map(p => makeNote(p)));
  $('#empty').hidden = list.length > 0;
  $('#sPosts').textContent = posts.filter(visible).length;
  $('#sReacts').textContent = posts.reduce((a, p) => a + total(p), 0);
  $('#sToday').textContent = posts.filter(p => Date.now() - p.ts < 864e5).length;
}

function buildPickers() {
  const chips = $('#chips'), pick = $('#catPick'), sw = $('#colorPick');
  ['All', ...CATS].forEach(c => {
    const b = el('button', 'chip', c); b.type = 'button'; b.setAttribute('aria-pressed', c === 'All');
    b.onclick = () => { state.cat = c; [...chips.children].forEach(x => x.setAttribute('aria-pressed', x === b)); render(); };
    chips.append(b);
  });
  CATS.forEach(c => {
    const b = el('button', 'pill', c); b.type = 'button'; b.setAttribute('aria-pressed', c === state.pickCat);
    b.onclick = () => { state.pickCat = c; [...pick.children].forEach(x => x.setAttribute('aria-pressed', x === b)); updatePreview(); };
    pick.append(b);
  });
  Object.keys(COLORS).forEach(c => {
    const b = el('button', 'sw'); b.type = 'button'; b.style.background = `var(${COLORS[c]})`;
    b.setAttribute('aria-label', c + ' note'); b.setAttribute('aria-pressed', c === state.pickColor);
    b.onclick = () => { state.pickColor = c; [...sw.children].forEach(x => x.setAttribute('aria-pressed', x === b)); updatePreview(); };
    sw.append(b);
  });
}

function updatePreview() {
  const p = {text: clean($('#text').value.trim()) || 'Your note will look like this.', cat: state.pickCat, color: state.pickColor, name: $('#name').value.trim() || 'Anonymous'};
  $('#preview').replaceWith(Object.assign(makeNote(p, true), {id: 'preview'})); $('#preview').classList.add('preview');
  $('#cnt').textContent = $('#text').value.length;
}

$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const text = clean($('#text').value.trim()); if (!text) return;
  const p = {id: 'p' + Date.now(), text, cat: state.pickCat, color: state.pickColor, name: $('#name').value.trim() || 'Anonymous', ts: Date.now(), r: {love:0, haha:0, wow:0, sad:0}};
  if (ONLINE) {
    if (!uid) return toast('Still connecting. Try again in a moment.');
    const {id, ...data} = p;
    db.collection('posts').add({...data, uid, reports: 0}).catch(() => toast('Could not post. Check your connection.'));
  } else { posts.unshift(p); mine.push(p.id); persist(); }
  e.target.reset(); updatePreview();
  state.cat = 'All'; [...$('#chips').children].forEach((x, i) => x.setAttribute('aria-pressed', i === 0));
  render(); toast('Note pinned to the wall'); $('#wall').scrollIntoView({behavior: 'smooth'});
});
$('#text').addEventListener('input', updatePreview);
$('#name').addEventListener('input', updatePreview);
$('#search').addEventListener('input', e => { state.q = e.target.value; render(); });
$('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
$('#rulesBtn').onclick = () => $('#rules').showModal();
$('#closeRules').onclick = () => $('#rules').close();

function setTheme(t) { document.documentElement.dataset.theme = t; $('#themeBtn').textContent = t === 'dark' ? '☀️' : '🌙'; save(K.theme, t); }
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(load(K.theme, 'light'));

buildPickers(); updatePreview(); render(); setInterval(render, 60000);

if (ONLINE) {
  firebase.initializeApp(CFG);
  db = firebase.firestore();
  firebase.auth().signInAnonymously().then(c => {
    uid = c.user.uid;
    db.collection('posts').orderBy('ts', 'desc').limit(200).onSnapshot(
      snap => { posts = snap.docs.map(d => ({id: d.id, ...d.data()})); render(); },
      () => toast('Could not load the wall. Check your Firebase rules.'));
  }).catch(() => toast('Sign-in failed. Enable Anonymous sign-in in Firebase.'));
} else {
  console.info('Freedom Wall is running in local mode. Add your Firebase config in firebase-config.js to share notes.');
}
