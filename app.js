import { createGlobe } from './globe.js';
import { createStore, OWNERS } from './store.js';
import { SEED_POINTS, LEGACY_SEED_IDS, SEED_REV } from './seed.js';
import * as geo from './geo.js';

const OWNER_COLORS = { Marco: '#3d8bff', Estela: '#f2468f' };
const STATUS_LABEL = { pending: 'A visitar', visited: 'Visitado', done: 'Desafio concluído' };

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const body = document.body;
const isMobile = () => window.matchMedia('(max-width: 640px)').matches;
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtDate = (t) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(t);
// Firestore não aceita `undefined`
const clean = (obj) => JSON.parse(JSON.stringify(obj));

// cria elementos com segurança (texto sempre via textContent)
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'icon') el.innerHTML = ICON[v];
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat().filter((x) => x != null && x !== false));
  return el;
}

const ICON = {
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2 4 2 4H6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19l7-7"/></svg>',
  grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
};

const status = (p) => (p.challengeDone ? 'done' : p.visited ? 'visited' : 'pending');
const STATUS_ICON = { pending: 'target', visited: 'flag', done: 'check' };

// ---------- estado ----------
let me = null;
try { me = OWNERS.includes(localStorage.getItem('gg-me')) ? localStorage.getItem('gg-me') : null; } catch { /* sem storage */ }
let store = null;
let points = [];
let selectedId = null;
const filters = { owner: 'all', status: 'all', q: '' };
let media = [];
let mediaFor = null;
let mediaUnsub = null;

const byId = (id) => points.find((p) => p.id === id);

function visiblePoints() {
  const q = norm(filters.q.trim());
  return points.filter((p) => (filters.owner === 'all' || p.owner === filters.owner)
    && (filters.status === 'all' || status(p) === filters.status)
    && (!q || norm([p.place.name, p.place.city, p.place.state, p.place.country, p.challenge?.name, p.challenge?.sci].join(' ')).includes(q)));
}

// ---------- globo ----------
const pointEl = $('#point');
const globe = createGlobe($('#globe'), $('#pins'), {
  onSelect: (id) => openPoint(id),
  onReady: () => $('#loader').classList.add('is-done'),
  onInteract: () => body.classList.add('has-interacted'),
  onSpinChange: (on) => {
    const b = $('#btn-spin');
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Pausar giro (espaço)' : 'Girar (espaço)';
  },
  onError: () => toast('Não foi possível carregar o mapa. Verifique a conexão.'),
  // centraliza o ponto na área que os painéis deixam livre
  paddingFor: () => {
    if (!pointEl.classList.contains('is-open')) return {};
    return isMobile() ? { bottom: window.innerHeight * 0.62 } : { right: 440 };
  },
});

// satélite × mapa (lembra a escolha)
const mapModeEl = $('#map-mode');
let savedMode = 'satellite';
try { savedMode = localStorage.getItem('gg-map-mode') || 'satellite'; } catch { /* sem storage */ }
globe.setMode(savedMode);
setSegmentedLater(savedMode);
mapModeEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  $$('button', mapModeEl).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  globe.setMode(b.dataset.v);
  try { localStorage.setItem('gg-map-mode', b.dataset.v); } catch { /* sem storage */ }
});
function setSegmentedLater(v) { $$('button', mapModeEl).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === v))); }

$('#btn-zoom-in').addEventListener('click', () => globe.zoomBy(0.62, 6));
$('#btn-zoom-out').addEventListener('click', () => globe.zoomBy(1.6, 6));
$('#btn-spin').addEventListener('click', () => globe.setSpinning(!globe.isSpinning()));
$('#btn-home').addEventListener('click', () => { closePoint(); globe.goHome(); });

function refresh() {
  const vis = visiblePoints();
  globe.setPins(vis.map((p) => ({
    id: p.id, lat: p.place.lat, lon: p.place.lon, name: p.place.name,
    color: OWNER_COLORS[p.owner] || '#e3001b', status: status(p),
  })));
  renderList(vis);
  renderDock();
  renderSwitcher();
  if (selectedId) {
    const p = byId(selectedId);
    if (p) renderPoint(p); else closePoint();
  }
}

// ---------- toast e confirmação ----------
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('is-shown');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-shown'), 3200);
}

function openModal(el) { el.classList.add('is-open'); el.setAttribute('aria-hidden', 'false'); }
function closeModal(el) { el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); }

function confirmDialog(title, text, yes = 'Excluir') {
  const el = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-yes').textContent = yes;
  openModal(el);
  $('#confirm-yes').focus();
  return new Promise((resolve) => {
    const done = (v) => {
      closeModal(el);
      $('#confirm-yes').onclick = $('#confirm-no').onclick = el.onclick = null;
      resolve(v);
    };
    $('#confirm-yes').onclick = () => done(true);
    $('#confirm-no').onclick = () => done(false);
    el.onclick = (e) => { if (e.target === el) done(false); };
    el.cancel = () => done(false);
  });
}

// ---------- fotos de perfil ----------
let profiles = {};

// pinta um avatar: foto, se houver; senão a inicial sobre a cor da pessoa
function paintAvatar(el, name) {
  if (!el || !name) return el;
  el.dataset.owner = name;
  el.style.setProperty('--c', OWNER_COLORS[name] || '#666');
  const photo = profiles[name]?.photo;
  el.classList.toggle('has-photo', !!photo);
  el.style.backgroundImage = photo ? `url("${photo}")` : '';
  el.textContent = photo ? '' : name[0];
  return el;
}
function avatar(name, cls = '') {
  return paintAvatar(h('span', { class: `avatar ${cls}`.trim() }), name);
}
function repaintAvatars() {
  $$('.avatar[data-owner]').forEach((el) => paintAvatar(el, el.dataset.owner));
}

// reduz a foto para 320 px antes de enviar (carrega rápido em qualquer lugar)
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const s = 320 / Math.min(bmp.width, bmp.height);
  const w = Math.round(bmp.width * Math.min(s, 1));
  const hh = Math.round(bmp.height * Math.min(s, 1));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  c.getContext('2d').drawImage(bmp, 0, 0, w, hh);
  bmp.close();
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  return new File([blob], 'perfil.jpg', { type: 'image/jpeg' });
}

$$('#identity input[data-photo]').forEach((input) => input.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  toast('Enviando a foto…');
  // uma troca por vez: duas seguidas não se sobrescrevem
  photoQueue = photoQueue.then(async () => {
    try {
      await store.saveProfilePhoto(input.dataset.photo, await shrinkPhoto(file));
      toast('Foto atualizada');
    } catch (err) { failed(err); }
  });
}));
let photoQueue = Promise.resolve();

// ---------- identidade (Marco ou Estela) ----------
function setMe(name) {
  me = name;
  try { localStorage.setItem('gg-me', name); } catch { /* sem storage */ }
  const b = $('#btn-me');
  paintAvatar(b.querySelector('.avatar'), name);
  b.querySelector('.me-name').textContent = name;
}
$('#btn-me').addEventListener('click', () => openModal($('#identity')));
$$('#identity [data-v]').forEach((b) => b.addEventListener('click', () => {
  setMe(b.dataset.v);
  closeModal($('#identity'));
  renderLetterButton();
  let seen = false;
  try { seen = localStorage.getItem(`gg-welcome-${b.dataset.v}`) === '1'; } catch { /* sem storage */ }
  if (!seen) openWelcome(); else toast(`Olá, ${b.dataset.v}!`);
}));

// ---------- boas-vindas e guia ----------
const welcomeEl = $('#welcome');
function openWelcome() {
  const isHer = me === 'Estela';
  $('#welcome-title').textContent = isHer ? 'Feliz aniversário, Estela' : 'Como funciona';
  $('#welcome-lead').textContent = isHer
    ? 'Cada ponto neste globo é uma viagem que a gente ainda vai fazer junto.'
    : 'É o que a Estela vê quando abre o presente. A carta fica no envelope, lá em cima.';
  $('#welcome-letter').hidden = !isHer && !letter?.text;
  openModal(welcomeEl);
  try { if (me) localStorage.setItem(`gg-welcome-${me}`, '1'); } catch { /* sem storage */ }
}
$('#btn-help').addEventListener('click', openWelcome);
$$('[data-close]', welcomeEl).forEach((b) => b.addEventListener('click', () => closeModal(welcomeEl)));
welcomeEl.addEventListener('pointerdown', (e) => { if (e.target === welcomeEl) closeModal(welcomeEl); });
$('#welcome-go').addEventListener('click', () => closeModal(welcomeEl));
$('#welcome-letter').addEventListener('click', () => { closeModal(welcomeEl); openLetter(); });

// ---------- carta ----------
const letterEl = $('#letter');
let letter = null;

function letterUnread() {
  if (me !== 'Estela' || !letter?.text) return false;
  let read = 0;
  try { read = Number(localStorage.getItem('gg-letter-read') || 0); } catch { /* sem storage */ }
  return (letter.updatedAt || 0) > read;
}
function renderLetterButton() {
  $('#btn-letter .badge-dot').hidden = !letterUnread();
}

function renderLetter(editing = false) {
  const text = letter?.text || '';
  const isMarco = me === 'Marco';
  const body = $('#letter-body');
  body.replaceChildren(...(text
    ? text.split(/\n{2,}/).map((para) => h('p', {}, para))
    : [h('p', { class: 'paper-empty' }, isMarco ? 'A carta ainda está em branco. Toque em “Escrever” para começar.' : 'A carta ainda está sendo escrita… ✉️')]));
  body.hidden = editing;
  $('#letter-edit').hidden = !editing;
  $('#letter-edit-btn').hidden = !isMarco || editing;
  $('#letter-edit-btn').textContent = text ? 'Editar a carta' : 'Escrever a carta';
  $('#letter-save').hidden = !editing;
  if (editing) { $('#letter-edit').value = text; setTimeout(() => $('#letter-edit').focus(), 50); }
}

function openLetter() {
  renderLetter(false);
  letterEl.classList.remove('opened');
  openModal(letterEl);
  // o envelope abre e o papel sobe
  requestAnimationFrame(() => setTimeout(() => letterEl.classList.add('opened'), 350));
  if (me === 'Estela' && letter?.text) {
    try { localStorage.setItem('gg-letter-read', String(letter.updatedAt || Date.now())); } catch { /* sem storage */ }
    renderLetterButton();
  }
}
function closeLetter() { closeModal(letterEl); letterEl.classList.remove('opened'); }
$('#btn-letter').addEventListener('click', openLetter);
$$('[data-close]', letterEl).forEach((b) => b.addEventListener('click', closeLetter));
letterEl.addEventListener('pointerdown', (e) => { if (e.target === letterEl) closeLetter(); });
$('#letter-edit-btn').addEventListener('click', () => renderLetter(true));
$('#letter-save').addEventListener('click', async () => {
  try {
    await store.saveLetter({ text: $('#letter-edit').value.trim(), from: 'Marco', to: 'Estela' });
    renderLetter(false);
    toast('Carta salva 💌');
  } catch (err) { failed(err); }
});
if (me) setMe(me);

// ---------- lista ----------
const panel = $('#panel');
const listBtn = $('#btn-list');

function thumbOf(p) {
  return p.cover?.type === 'image' ? p.cover.url : p.challenge?.image || null;
}

function pointRow(p, { compact = false, onClick } = {}) {
  const st = status(p);
  const thumb = thumbOf(p);
  return h('button', {
    class: `poi-item${p.id === selectedId ? ' is-active' : ''}`, 'data-id': p.id, role: compact ? 'menuitem' : null,
    onclick: onClick || (() => { openPoint(p.id); if (isMobile()) togglePanel(false); }),
  },
  h('span', { class: 'thumb' }, thumb ? h('img', { src: thumb, alt: '', loading: 'lazy' }) : null),
  h('span', { class: 'txt' },
    h('span', { class: 'name' }, p.place.name),
    h('span', { class: 'sub' }, compact ? geo.placeLine(p.place) : [geo.placeLine(p.place), p.challenge?.name].filter(Boolean).join(' · '))),
  h('span', { class: `st st-${st}`, title: STATUS_LABEL[st], icon: STATUS_ICON[st] }),
  h('span', { class: 'owner-dot', title: p.owner, style: `--c:${OWNER_COLORS[p.owner]}` }));
}

function renderList(vis) {
  const list = $('#poi-list');
  list.replaceChildren();
  const done = points.filter((p) => p.challengeDone).length;
  const visited = points.filter((p) => p.visited).length;
  $('#panel-stats').textContent = `${points.length} pontos · ${visited} visitados · ${done} desafios concluídos`;

  // agrupa por país; dentro do país, por estado/cidade
  const groups = new Map();
  for (const p of vis) {
    const key = p.place.country || 'Sem país';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  for (const [country, items] of sorted) {
    items.sort((a, b) => `${a.place.state} ${a.place.name}`.localeCompare(`${b.place.state} ${b.place.name}`, 'pt-BR'));
    list.append(h('div', { class: 'poi-group' },
      h('h3', {}, h('span', { class: 'cc' }, items[0].place.countryCode || '—'), country, h('em', {}, String(items.length))),
      items.map((p) => pointRow(p))));
  }
  if (!vis.length) {
    list.append(h('div', { class: 'poi-empty' },
      h('p', {}, points.length ? 'Nenhum ponto com esses filtros.' : 'Nenhum ponto ainda.'),
      h('button', { class: 'pill-btn', onclick: () => openForm() }, h('span', { icon: 'plus' }), 'Criar ponto')));
  }
}

function togglePanel(open = !panel.classList.contains('is-open')) {
  panel.classList.toggle('is-open', open);
  listBtn.setAttribute('aria-expanded', String(open));
  if (open && isMobile()) closePoint();
}
listBtn.addEventListener('click', () => togglePanel());
$('#panel-close').addEventListener('click', () => togglePanel(false));
$('#search').addEventListener('input', (e) => { filters.q = e.target.value; refresh(); });

function bindSegmented(el, onChange) {
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b || b.hidden) return;
    $$('button', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(b.dataset.v);
  });
}
const setSegmented = (el, v) => $$('button', el).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === v)));
bindSegmented($('#filter-owner'), (v) => { filters.owner = v; refresh(); });
bindSegmented($('#filter-status'), (v) => { filters.status = v; refresh(); });

// ---------- dock: navegação rápida ----------
const ordered = () => visiblePoints();

function step(dir) {
  const list = ordered();
  if (!list.length) { toast('Nenhum ponto para mostrar'); return; }
  const i = list.findIndex((p) => p.id === selectedId);
  const next = i === -1 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
  openPoint(list[next].id);
}
$('#btn-prev').addEventListener('click', () => step(-1));
$('#btn-next').addEventListener('click', () => step(1));

function renderDock() {
  const list = ordered();
  const p = selectedId && byId(selectedId);
  const i = p ? list.findIndex((x) => x.id === p.id) : -1;
  const thumb = $('.dock-thumb');
  thumb.replaceChildren();
  if (p) {
    const src = thumbOf(p);
    if (src) thumb.append(h('img', { src, alt: '' }));
    thumb.style.setProperty('--c', OWNER_COLORS[p.owner]);
    $('.dock-name').textContent = p.place.name;
    $('.dock-sub').textContent = i >= 0 ? `${i + 1} de ${list.length} · ${p.place.country}` : p.place.country;
  } else {
    thumb.style.removeProperty('--c');
    $('.dock-name').textContent = 'Escolher ponto';
    $('.dock-sub').textContent = `${list.length} ${list.length === 1 ? 'ponto' : 'pontos'}`;
  }
}

const switcher = $('#switcher');
const dockCurrent = $('#dock-current');
function renderSwitcher() {
  const list = ordered();
  switcher.replaceChildren(
    list.length
      ? h('div', { class: 'switcher-list' }, list.map((p) => pointRow(p, {
        compact: true,
        onClick: () => { toggleSwitcher(false); openPoint(p.id); },
      })))
      : h('p', { class: 'poi-empty' }, 'Nenhum ponto ainda.'),
    h('button', { class: 'switcher-new', onclick: () => { toggleSwitcher(false); openForm(); } }, h('span', { icon: 'plus' }), 'Novo ponto'));
}
function toggleSwitcher(open = !switcher.classList.contains('is-open')) {
  switcher.classList.toggle('is-open', open);
  dockCurrent.setAttribute('aria-expanded', String(open));
  if (open) switcher.querySelector('.is-active')?.scrollIntoView({ block: 'center' });
}
dockCurrent.addEventListener('click', () => toggleSwitcher());
document.addEventListener('pointerdown', (e) => {
  if (switcher.classList.contains('is-open') && !e.target.closest('#switcher, #dock-current')) toggleSwitcher(false);
});

// ---------- cartão do ponto ----------
function openPoint(id, { fly = true } = {}) {
  const p = byId(id);
  if (!p) return;
  const changed = selectedId !== id;
  selectedId = id;
  globe.setActive(id);
  pointEl.classList.add('is-open');
  pointEl.setAttribute('aria-hidden', 'false');
  body.classList.add('point-open');
  if (changed) {
    $('#point-scroll').scrollTop = 0;
    $('#pc-cover').dataset.key = '';
    subscribeMedia(id);
  }
  renderPoint(p);
  if (fly) globe.flyTo(p.place.lat, p.place.lon);
  if (isMobile()) togglePanel(false);
  $$('.poi-item').forEach((b) => b.classList.toggle('is-active', b.dataset.id === id));
  renderDock();
  prefetchNeighbors(id);
}

// adianta as imagens do ponto anterior e do próximo: trocar pela barra fica instantâneo
let neighborTimer = 0;
function prefetchNeighbors(id) {
  clearTimeout(neighborTimer);
  neighborTimer = setTimeout(() => {
    const list = ordered();
    const i = list.findIndex((p) => p.id === id);
    if (i < 0 || list.length < 2) return;
    for (const d of [1, -1]) {
      const n = list[(i + d + list.length) % list.length];
      globe.prefetch(n.place.lat, n.place.lon);
    }
  }, 2500);
}

function closePoint() {
  selectedId = null;
  globe.setActive(null);
  pointEl.classList.remove('is-open');
  pointEl.setAttribute('aria-hidden', 'true');
  body.classList.remove('point-open');
  $('#pc-cover').replaceChildren();
  $('#pc-cover').dataset.key = '';
  mediaUnsub?.();
  mediaUnsub = null;
  mediaFor = null;
  media = [];
  $$('.poi-item.is-active').forEach((b) => b.classList.remove('is-active'));
  renderDock();
}
$('#point-close').addEventListener('click', closePoint);

function mediaEl(m, { controls = false, autoplay = false } = {}) {
  if (m.type === 'youtube') {
    return h('iframe', { src: m.url, title: 'Vídeo do lugar', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', loading: 'lazy' });
  }
  if (m.type === 'video') {
    return h('video', { src: m.url, controls, autoplay, muted: !controls, loop: !controls, playsinline: true, preload: 'metadata' });
  }
  return h('img', { src: m.url, alt: '', loading: 'lazy' });
}

function renderPoint(p) {
  const st = status(p);

  // capa (só recria se mudou, para o vídeo não reiniciar a cada atualização)
  const coverBox = $('#pc-cover');
  const cover = p.cover || (p.challenge?.image ? { type: 'image', url: p.challenge.image } : null);
  const key = cover ? `${cover.type}|${cover.url}` : 'none';
  if (coverBox.dataset.key !== key) {
    coverBox.dataset.key = key;
    coverBox.replaceChildren(
      cover?.url ? mediaEl(cover, { controls: cover.type === 'video' }) : h('div', { class: 'cover-empty', icon: 'leaf' }),
      p.cover?.credit ? h('a', { class: 'cover-credit', href: p.cover.credit, target: '_blank', rel: 'noopener' }, p.cover.creditText ? `Foto: ${p.cover.creditText}` : 'Foto do lugar: fonte') : null);
  }
  coverBox.classList.toggle('is-media', cover?.type === 'youtube' || cover?.type === 'video');

  $('#pc-head').replaceChildren(
    h('div', { class: 'pc-eyebrow' },
      h('span', { class: 'cc' }, p.place.countryCode || '—'),
      h('span', {}, p.place.country || 'Local'),
      h('span', { class: 'owner-chip', style: `--c:${OWNER_COLORS[p.owner]}` }, avatar(p.owner, 'sm'), p.owner)),
    h('h2', {}, p.place.name),
    h('p', { class: 'pc-line' }, geo.placeLine(p.place)),
    h('p', { class: 'pc-coords' }, h('span', { icon: 'pin' }), geo.formatCoords(p.place.lat, p.place.lon)),
    h('div', { class: 'status-row' },
      h('span', { class: `status-chip st-${p.visited ? 'visited' : 'pending'}` },
        h('span', { icon: p.visited ? 'flag' : 'target' }), p.visited ? `Visitado${p.visitedAt ? ` em ${fmtDate(p.visitedAt)}` : ''}` : 'Ainda não visitado'),
      p.challengeDone ? h('span', { class: 'status-chip st-done' }, h('span', { icon: 'check' }), 'Desafio concluído') : null));

  $('#pc-trip').replaceChildren(
    h('header', { class: 'sec-head' }, h('h3', {}, 'O passeio')),
    p.trip
      ? h('p', { class: 'trip-text' }, p.trip)
      : h('button', { class: 'trip-empty', onclick: () => openForm(p) }, h('span', { icon: 'edit' }), 'Contem sobre o passeio que vocês vão fazer aqui'),
    p.place.about ? h('details', { class: 'pc-about', open: !p.trip },
      h('summary', {}, 'Sobre o lugar'),
      h('p', {}, p.place.about,
        p.place.source ? [' ', h('a', { href: p.place.source, target: '_blank', rel: 'noopener' }, 'Wikipédia')] : null)) : null);

  $('#pc-actions').replaceChildren(
    h('button', { class: `pill-btn${p.visited ? ' is-on' : ''}`, onclick: () => toggleVisited(p) },
      h('span', { icon: p.visited ? 'check' : 'flag' }), p.visited ? 'Visitado' : 'Marcar como visitado'),
    h('button', { class: 'pill-btn', onclick: () => openForm(p) }, h('span', { icon: 'edit' }), 'Editar'),
    h('button', { class: 'pill-btn danger', onclick: () => deletePoint(p) }, h('span', { icon: 'trash' }), 'Excluir'));

  renderMission(p);
  renderChallenge(p, st);
  renderAlbumPreview(p);
  $('#pc-meta').textContent = `Criado por ${p.owner}${p.createdAt ? ` em ${fmtDate(p.createdAt)}` : ''}`;
}

// passos do que fazer em cada lugar, marcados automaticamente
function renderMission(p) {
  const tripCount = mediaFor === p.id
    ? media.filter((m) => !m.isChallenge).length
    : Math.max(0, (p.mediaCount || 0) - (p.challengeDone ? 1 : 0));
  const steps = [
    {
      done: !!p.visited,
      title: `Ir até ${p.place.name}`,
      hint: p.visited ? `Visitado${p.visitedAt ? ` em ${fmtDate(p.visitedAt)}` : ''}` : 'Quando chegar, toque em “Marcar como visitado”.',
    },
    {
      done: !!p.challengeDone,
      title: `Encontrar e fotografar: ${p.challenge?.name || 'o desafio'}`,
      hint: p.challengeDone ? 'Foto enviada: ela é a capa do álbum.' : 'Anexe a foto no espaço reservado do álbum, aqui embaixo.',
    },
    {
      done: tripCount > 0,
      title: 'Guardar as fotos da viagem',
      hint: tripCount ? `${tripCount} ${tripCount === 1 ? 'foto' : 'fotos'} no álbum` : 'Adicione fotos e vídeos do passeio ao álbum.',
    },
  ];
  const n = steps.filter((x) => x.done).length;
  $('#pc-mission').replaceChildren(
    h('header', { class: 'sec-head' },
      h('h3', {}, 'Sua missão'),
      h('span', { class: `tag${n === 3 ? ' done' : ''}` }, n === 3 ? 'Missão cumprida! 🎉' : `${n} de 3`)),
    h('div', { class: 'mission-bar' }, h('span', { style: `width:${(n / 3) * 100}%` })),
    h('ol', { class: 'mission' }, steps.map((x) => h('li', { class: x.done ? 'is-done' : '' },
      h('span', { class: 'mission-check', icon: x.done ? 'check' : null }),
      h('div', {}, h('strong', {}, x.title), h('p', {}, x.hint))))));
}

function renderChallenge(p) {
  const ch = p.challenge || {};

  $('#pc-challenge').replaceChildren(
    h('header', { class: 'sec-head' },
      h('h3', {}, 'Desafio'),
      ch.tag ? h('span', { class: 'tag' }, ch.tag) : null,
      p.challengeDone ? h('span', { class: 'tag done' }, h('span', { icon: 'check' }), 'Concluído') : null),
    h('div', { class: 'ch-card' },
      ch.image ? h('figure', { class: 'ch-ref' }, h('img', { src: ch.image, alt: ch.name || '' }), h('figcaption', {}, 'Referência')) : null,
      h('div', { class: 'ch-text' },
        h('h4', {}, ch.name || 'Sem desafio'),
        ch.sci && ch.sci !== ch.name ? h('p', { class: 'sci' }, ch.sci) : null,
        ch.nearby ? h('p', { class: 'ch-near' }, h('span', { icon: 'pin' }), `${ch.nearby} registros num raio de 30 km`) : null,
        ch.description ? h('p', { class: 'ch-desc' }, ch.description) : null,
        ch.url ? h('a', { class: 'ch-link', href: ch.url, target: '_blank', rel: 'noopener' }, 'Saiba mais', h('span', { icon: 'ext' })) : null)),
    h('p', { class: 'ch-foot' }, h('span', { icon: 'camera' }),
      p.challengeDone ? 'A foto de vocês já é a capa do álbum da viagem.' : 'Encontrem e fotografem isto: a foto de vocês vira a capa do álbum.'));
}

// capa do álbum = foto do desafio tirada por vocês; antes disso, um espaço reservado para ela
function albumCover(p, { big = false } = {}) {
  const proof = media.find((m) => m.isChallenge);
  if (proof) {
    return h('button', { class: `album-cover${big ? ' big' : ''}`, onclick: () => openLightbox(media.indexOf(proof)) },
      mediaEl(proof),
      h('span', { class: 'cover-badge' }, h('span', { icon: 'check' }), 'Foto do desafio · capa do álbum'),
      h('span', { class: 'cover-cap' }, [p.challenge?.name, p.challengeBy && `por ${p.challengeBy}`, p.challengeAt && fmtDate(p.challengeAt)].filter(Boolean).join(' · ')));
  }
  return h('label', { class: `album-cover empty${big ? ' big' : ''}` },
    h('span', { class: 'cover-slot-ic', icon: 'camera' }),
    h('strong', {}, `Foto do desafio: ${p.challenge?.name || 'desafio'}`),
    h('span', {}, 'Espaço reservado para a foto tirada por vocês. Ela vira a capa do álbum.'),
    h('span', { class: 'pill-btn' }, h('span', { icon: 'plus' }), 'Anexar foto do desafio'),
    h('input', { type: 'file', accept: 'image/*,video/*', onchange: (e) => { uploadFiles(p.id, e.target.files, { challenge: true }); e.target.value = ''; } }));
}

function tripTile(m) {
  return h('button', { class: 'tile', onclick: () => openLightbox(media.indexOf(m)) },
    m.type === 'video' ? [h('video', { src: m.url, muted: true, preload: 'metadata' }), h('span', { class: 'tile-play', icon: 'play' })] : h('img', { src: m.url, alt: '', loading: 'lazy' }),
    m.by ? avatar(m.by, 'tile-by') : null);
}

function addTripTile(p) {
  return h('label', { class: 'tile add' }, h('span', { icon: 'plus' }), h('span', {}, 'Fotos da viagem'),
    h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, onchange: (e) => { uploadFiles(p.id, e.target.files); e.target.value = ''; } }));
}

function renderAlbumPreview(p) {
  const trip = media.filter((m) => !m.isChallenge);
  const count = mediaFor === p.id ? media.length : p.mediaCount || 0;

  $('#pc-album').replaceChildren(
    h('header', { class: 'sec-head' },
      h('h3', {}, 'Álbum da viagem'),
      h('span', { class: 'muted' }, `${count} ${count === 1 ? 'item' : 'itens'}`),
      h('button', { class: 'text-btn', onclick: openAlbum }, h('span', { icon: 'grid' }), 'Ver álbum')),
    albumCover(p),
    h('div', { class: 'album-preview' }, trip.slice(0, 5).map(tripTile), addTripTile(p)),
    h('div', { class: 'progress', id: 'album-preview-progress', hidden: true }, h('span'), h('em')));
}

async function toggleVisited(p) {
  const visited = !p.visited;
  try {
    await store.updatePoint(p.id, { visited, visitedAt: visited ? Date.now() : null });
    toast(visited ? 'Marcado como visitado' : 'Marcado como não visitado');
  } catch (err) { failed(err); }
}

async function deletePoint(p) {
  const ok = await confirmDialog(`Excluir “${p.place.name}”?`, `O ponto, o desafio e ${p.mediaCount || 0} itens do álbum serão apagados. Isso não pode ser desfeito.`);
  if (!ok) return;
  try {
    closePoint();
    await store.deletePoint(p.id);
    toast('Ponto excluído');
  } catch (err) { failed(err); }
}

function failed(err) {
  console.error(err);
  toast(`Algo deu errado: ${err?.message || err}`);
}

// ---------- mídias ----------
function subscribeMedia(id) {
  mediaUnsub?.();
  media = [];
  mediaFor = id;
  mediaUnsub = store.subscribeMedia(id, (list) => {
    if (mediaFor !== id) return;
    // a foto do desafio vem primeiro: é a capa do álbum
    media = [...list].sort((a, b) => (b.isChallenge ? 1 : 0) - (a.isChallenge ? 1 : 0) || b.createdAt - a.createdAt);
    const p = byId(id);
    if (p) { renderMission(p); renderChallenge(p); renderAlbumPreview(p); }
    if ($('#album').classList.contains('is-open')) renderAlbum();
    if ($('#lightbox').classList.contains('is-open')) renderLightbox();
  }, failed);
}

function setProgress(text, frac) {
  for (const el of $$('#album-preview-progress, #album-progress')) {
    el.hidden = text == null;
    if (text != null) {
      el.querySelector('span').style.width = `${Math.round((frac || 0) * 100)}%`;
      el.querySelector('em').textContent = text;
    }
  }
}

async function uploadFiles(pointId, fileList, { challenge = false } = {}) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  if (!me) { openModal($('#identity')); toast('Diga quem é você antes de enviar'); return; }
  let lastId = null;
  for (const [i, file] of files.entries()) {
    if (!/^(image|video)\//.test(file.type)) { toast(`Formato não suportado: ${file.name}`); continue; }
    const label = files.length > 1 ? `Enviando ${i + 1} de ${files.length}…` : 'Enviando…';
    setProgress(label, 0);
    try {
      lastId = await store.addMedia(pointId, file, { by: me }, (f) => setProgress(label, f));
    } catch (err) { failed(err); }
  }
  setProgress(null);
  if (challenge && lastId) await markChallenge(pointId, lastId);
  else if (lastId) toast(files.length > 1 ? 'Itens adicionados ao álbum' : 'Adicionado ao álbum');
}

async function markChallenge(pointId, mediaId) {
  const p = byId(pointId);
  try {
    for (const m of media.filter((x) => x.isChallenge && x.id !== mediaId)) await store.updateMedia(pointId, m.id, { isChallenge: false });
    await store.updateMedia(pointId, mediaId, { isChallenge: true });
    await store.updatePoint(pointId, {
      challengeDone: true, challengeMediaId: mediaId, challengeBy: me, challengeAt: Date.now(),
      visited: true, visitedAt: p?.visitedAt || Date.now(),
    });
    toast('Desafio concluído! 🌿');
  } catch (err) { failed(err); }
}

async function unmarkChallenge(pointId, mediaId) {
  try {
    await store.updateMedia(pointId, mediaId, { isChallenge: false });
    await store.updatePoint(pointId, { challengeDone: false, challengeMediaId: null, challengeBy: null, challengeAt: null });
  } catch (err) { failed(err); }
}

// ---------- álbum ----------
const albumEl = $('#album');
function openAlbum() {
  renderAlbum();
  openModal(albumEl);
}
function renderAlbum() {
  const p = byId(selectedId);
  if (!p) return;
  const trip = media.filter((m) => !m.isChallenge);
  $('#album-title').textContent = `Álbum · ${p.place.name}`;
  $('#album-sub').textContent = `Desafio: ${p.challenge?.name || '—'} · ${media.length} ${media.length === 1 ? 'item' : 'itens'}`;
  $('#album-cover').replaceChildren(albumCover(p, { big: true }));
  const grid = $('#album-grid');
  grid.replaceChildren(...trip.map(tripTile), addTripTile(p));
}
$('#album-back').addEventListener('click', () => closeModal(albumEl));
$('#album-add').addEventListener('change', (e) => { uploadFiles(selectedId, e.target.files); e.target.value = ''; });

// ---------- visualizador ----------
const lb = $('#lightbox');
let lbIndex = 0;
function openLightbox(i) {
  if (i < 0) return;
  lbIndex = i;
  renderLightbox();
  openModal(lb);
}
function renderLightbox() {
  const m = media[lbIndex];
  if (!m) { closeModal(lb); return; }
  $('#lb-media').replaceChildren(mediaEl(m, { controls: true, autoplay: true }));
  $('#lb-info').textContent = [m.by && `Enviado por ${m.by}`, m.createdAt && fmtDate(m.createdAt), `${lbIndex + 1} de ${media.length}`].filter(Boolean).join(' · ');
  const chBtn = $('#lb-challenge');
  chBtn.replaceChildren(h('span', { icon: 'check' }), m.isChallenge ? 'Foto do desafio' : 'Usar como foto do desafio');
  chBtn.classList.toggle('is-on', !!m.isChallenge);
  $('#lb-open').href = m.url;
  $('#lb-prev').hidden = $('#lb-next').hidden = media.length < 2;
}
function lbStep(d) { lbIndex = (lbIndex + d + media.length) % media.length; renderLightbox(); }
$('#lb-prev').addEventListener('click', () => lbStep(-1));
$('#lb-next').addEventListener('click', () => lbStep(1));
$('#lb-close').addEventListener('click', () => { closeModal(lb); $('#lb-media').replaceChildren(); });
$('#lb-challenge').addEventListener('click', () => {
  const m = media[lbIndex];
  if (!m) return;
  if (m.isChallenge) unmarkChallenge(selectedId, m.id); else markChallenge(selectedId, m.id);
});
$('#lb-delete').addEventListener('click', async () => {
  const m = media[lbIndex];
  if (!m) return;
  const ok = await confirmDialog('Excluir este item?', m.isChallenge ? 'É a foto do desafio: o desafio volta a ficar pendente.' : 'Ele será removido do álbum.');
  if (!ok) return;
  try {
    if (m.isChallenge) await unmarkChallenge(selectedId, m.id);
    await store.deleteMedia(selectedId, m);
    toast('Item excluído');
  } catch (err) { failed(err); }
});

// ---------- formulário: criar / editar ----------
const formEl = $('#form');
let form = null;
let placeAbort = null;
let infoAbort = null;
let chAbort = null;

function openForm(p = null) {
  form = {
    id: p?.id || null,
    owner: p?.owner || me || null,
    place: p ? { ...p.place } : null,
    info: null,
    coverMode: p?.cover ? 'keep' : 'auto',
    oldCover: p?.cover || null,
    coverFile: null,
    challenge: p?.challenge ? { ...p.challenge } : null,
    tab: 'near',
  };
  $('#form-title').textContent = p ? 'Editar ponto' : 'Novo ponto';
  $('#form-save').textContent = p ? 'Salvar alterações' : 'Criar ponto';
  $('#form-error').textContent = '';
  $('#f-place-q').value = '';
  $('#f-trip').value = p?.trip || '';
  $('#f-place-results').replaceChildren();
  $('#f-cover-link').value = '';
  $('#f-cover-file').value = '';
  $('#f-cover-file-name').textContent = 'Escolher foto ou vídeo';
  $('#f-ch-q').value = '';
  $('#f-ch-name').value = $('#f-ch-desc').value = $('#f-ch-img').value = '';
  $('[data-v="keep"]', $('#f-cover-mode')).hidden = !p?.cover;
  setSegmented($('#f-cover-mode'), form.coverMode);
  setSegmented($('#f-ch-tabs'), 'near');
  renderOwnerPick();
  renderPlaceSelected();
  renderCoverControls();
  renderChosen();
  setTab('near');
  if (form.place) loadPlaceExtras(form.place, { keepAbout: true });
  closePoint();
  toggleSwitcher(false);
  openModal(formEl);
  setTimeout(() => (form.owner ? $('#f-place-q') : $('#f-owner button')).focus(), 60);
}

function closeForm() {
  closeModal(formEl);
  globe.setPickMode(null);
  globe.setPickMarker(null);
  body.classList.remove('form-hidden');
  form = null;
}
$$('[data-close]', formEl).forEach((b) => b.addEventListener('click', closeForm));
formEl.addEventListener('pointerdown', (e) => { if (e.target === formEl) closeForm(); });
$('#btn-new').addEventListener('click', () => openForm());

// 1. pessoa
function renderOwnerPick() {
  $$('#f-owner button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === form.owner)));
}
$('#f-owner').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-v]');
  if (!b) return;
  form.owner = b.dataset.v;
  if (!me) setMe(b.dataset.v);
  renderOwnerPick();
});

// 2. localidade
let placeTimer = 0;
$('#f-place-q').addEventListener('input', (e) => {
  clearTimeout(placeTimer);
  const q = e.target.value.trim();
  if (q.length < 3) { $('#f-place-results').replaceChildren(); return; }
  placeTimer = setTimeout(() => runPlaceSearch(q), 650); // respeita o limite de 1 req/s do OpenStreetMap
});
$('#f-place-q').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  clearTimeout(placeTimer);
  if (e.target.value.trim().length >= 2) runPlaceSearch(e.target.value.trim());
});

async function runPlaceSearch(q) {
  placeAbort?.abort();
  placeAbort = new AbortController();
  const box = $('#f-place-results');
  box.replaceChildren(h('li', { class: 'muted pad' }, 'Buscando…'));
  try {
    const results = await geo.searchPlaces(q, placeAbort.signal);
    box.replaceChildren(...(results.length ? results.map((r) => h('li', {},
      h('button', { type: 'button', onclick: () => { box.replaceChildren(); $('#f-place-q').value = ''; setPlace(r); } },
        h('span', { class: 'cc' }, r.countryCode || '—'),
        h('span', { class: 'txt' }, h('strong', {}, r.name), h('span', {}, geo.placeLine(r) || r.display)),
        h('span', { class: 'kind' }, r.kind)))) : [h('li', { class: 'muted pad' }, 'Nada encontrado. Tente outro nome ou marque no globo.')]));
  } catch (err) {
    if (err.name !== 'AbortError') box.replaceChildren(h('li', { class: 'muted pad' }, 'Falha na busca. Verifique a conexão.'));
  }
}

function setPlace(place) {
  form.place = { ...place };
  form.info = null;
  renderPlaceSelected();
  globe.setPickMarker(place.lat, place.lon);
  globe.flyTo(place.lat, place.lon);
  loadPlaceExtras(form.place);
}

function renderPlaceSelected() {
  const box = $('#f-place-selected');
  box.hidden = !form.place;
  if (!form.place) return;
  $('#f-name').value = form.place.name;
  $('#f-place-line').textContent = geo.placeLine(form.place) || form.place.display || '';
  $('#f-place-coords').textContent = geo.formatCoords(form.place.lat, form.place.lon);
}

// foto/descrição do lugar + sugestões de desafio
async function loadPlaceExtras(place, { keepAbout = false } = {}) {
  infoAbort?.abort();
  infoAbort = new AbortController();
  const signal = infoAbort.signal;
  renderCoverControls(true);
  loadSuggestions();
  try {
    const info = await geo.placeInfo(place, signal);
    if (!form || form.place !== place) return;
    form.info = info || { image: null, about: '', source: '' };
    if (!keepAbout || !place.about) {
      place.about = form.info.about;
      place.source = form.info.source;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (form) form.info = { image: null, about: '', source: '' };
  }
  renderCoverControls();
}

$('#f-pick').addEventListener('click', () => {
  body.classList.add('form-hidden');
  globe.setPickMode(async (ll) => {
    globe.setPickMode(null);
    body.classList.remove('form-hidden');
    $('#f-place-line').textContent = 'Identificando o local…';
    try {
      setPlace(await geo.reversePlace(ll.lat, ll.lon));
    } catch {
      setPlace({ name: 'Ponto no mapa', city: '', state: '', country: '', countryCode: '', lat: ll.lat, lon: ll.lon });
    }
  });
});
$('#pick-cancel').addEventListener('click', () => {
  globe.setPickMode(null);
  body.classList.remove('form-hidden');
});

$('#f-geo').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Localização indisponível neste navegador'); return; }
  toast('Obtendo sua localização…');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    try { setPlace(await geo.reversePlace(lat, lon)); } catch { setPlace({ name: 'Minha localização', city: '', state: '', country: '', countryCode: '', lat, lon }); }
  }, (err) => toast(err.code === 1 ? 'Permissão de localização negada' : 'Não foi possível obter a localização'),
  { enableHighAccuracy: true, timeout: 15000 });
});

// 3. capa
bindSegmented($('#f-cover-mode'), (v) => { form.coverMode = v; renderCoverControls(); });
$('#f-cover-link').addEventListener('input', () => renderCoverControls());
$('#f-cover-file').addEventListener('change', (e) => {
  form.coverFile = e.target.files[0] || null;
  $('#f-cover-file-name').textContent = form.coverFile?.name || 'Escolher foto ou vídeo';
  renderCoverControls();
});

// foto do lugar colada (Ctrl+V) ou arrastada para o formulário
function useCoverFile(file, how) {
  if (!form || !file || !/^(image|video)\//.test(file.type)) return false;
  form.coverMode = 'file';
  form.coverFile = file;
  setSegmented($('#f-cover-mode'), 'file');
  $('#f-cover-file-name').textContent = how === 'paste' ? 'Imagem colada' : file.name;
  renderCoverControls();
  $('#f-cover-preview').scrollIntoView({ block: 'center', behavior: 'smooth' });
  toast(how === 'paste' ? 'Imagem colada como foto do lugar' : 'Foto do lugar escolhida');
  return true;
}
document.addEventListener('paste', (e) => {
  if (!formEl.classList.contains('is-open')) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  const file = item.getAsFile();
  useCoverFile(new File([file], `colada.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: file.type }), 'paste');
});
const coverDrop = $('#f-cover-preview');
coverDrop.addEventListener('dragover', (e) => { e.preventDefault(); coverDrop.classList.add('is-drop'); });
coverDrop.addEventListener('dragleave', () => coverDrop.classList.remove('is-drop'));
coverDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  coverDrop.classList.remove('is-drop');
  useCoverFile(e.dataTransfer.files[0], 'drop');
});

let coverObjectUrl = null;
function coverChoice() {
  if (!form) return null;
  switch (form.coverMode) {
    case 'keep': return form.oldCover;
    case 'link': return geo.parseMediaLink($('#f-cover-link').value);
    case 'file': {
      if (!form.coverFile) return null;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = URL.createObjectURL(form.coverFile);
      return { type: form.coverFile.type.startsWith('video/') ? 'video' : 'image', url: coverObjectUrl };
    }
    default: return form.info?.image ? { type: 'image', url: form.info.image, credit: form.info.source } : null;
  }
}

function renderCoverControls(loading = false) {
  if (!form) return;
  $('#f-cover-link').hidden = form.coverMode !== 'link';
  $('#f-cover-file-wrap').hidden = form.coverMode !== 'file';
  const box = $('#f-cover-preview');
  const c = coverChoice();
  if (c?.url) box.replaceChildren(mediaEl(c, { controls: c.type !== 'image' }));
  else {
    let msg = 'Escolha a localidade para buscar uma imagem';
    if (form.coverMode === 'auto' && form.place) msg = loading || !form.info ? 'Buscando imagem do lugar…' : 'Nenhuma imagem automática encontrada. Use um link ou envie um arquivo.';
    if (form.coverMode === 'link') msg = 'Cole o link de uma imagem ou de um vídeo do YouTube';
    if (form.coverMode === 'file') msg = 'Envie uma foto ou um vídeo do lugar, arraste para cá ou cole (Ctrl+V)';
    box.replaceChildren(h('span', {}, msg));
  }
}

// 4. desafio
function setTab(tab) {
  form.tab = tab;
  $('#f-ch-search-wrap').hidden = tab !== 'search';
  $('#f-ch-custom').hidden = tab !== 'custom';
  $('#f-ch-grid').hidden = tab === 'custom';
  if (tab === 'search') setTimeout(() => $('#f-ch-q').focus(), 30);
  if (tab === 'custom') {
    $('#f-ch-note').textContent = 'Qualquer coisa natural ligada ao lugar: uma flor, uma rocha, uma árvore específica…';
    return;
  }
  loadSuggestions();
}
bindSegmented($('#f-ch-tabs'), setTab);

async function loadSuggestions() {
  if (!form) return;
  const tab = form.tab;
  const grid = $('#f-ch-grid');
  const note = $('#f-ch-note');
  if (tab === 'custom') return;
  if (tab === 'search') {
    const q = $('#f-ch-q').value.trim();
    note.textContent = q ? '' : 'Busque qualquer planta, flor, árvore ou fungo pelo nome.';
    if (!q) { grid.replaceChildren(); return; }
  } else if (!form.place) {
    note.textContent = 'Escolha a localidade para ver o que existe por lá.';
    grid.replaceChildren();
    return;
  }
  chAbort?.abort();
  chAbort = new AbortController();
  const { signal } = chAbort;
  note.textContent = 'Carregando sugestões…';
  grid.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'ch-option skeleton' })));
  try {
    let items;
    const { lat, lon } = form.place || {};
    if (tab === 'near') {
      items = await geo.nearbySpecies(lat, lon, 'plantas', signal);
      note.textContent = items.length ? 'Plantas mais registradas a até 30 km do ponto (iNaturalist).' : 'Nenhum registro de plantas por perto. Tente “Buscar” ou “Outro”.';
    } else if (tab === 'fungi') {
      items = await geo.nearbySpecies(lat, lon, 'fungos', signal);
      note.textContent = items.length ? 'Fungos registrados a até 30 km do ponto (iNaturalist).' : 'Nenhum fungo registrado por perto.';
    } else if (tab === 'endemic') {
      const r = await geo.endemicSpecies(lat, lon, signal);
      items = r.items;
      note.textContent = r.region ? `Plantas endêmicas registradas em ${r.region} (iNaturalist).` : 'Não encontrei a região deste ponto no iNaturalist.';
      if (r.region && !items.length) note.textContent = `Nenhuma planta endêmica registrada em ${r.region}.`;
    } else {
      items = await geo.searchSpecies($('#f-ch-q').value.trim(), signal);
      note.textContent = items.length ? '' : 'Nada encontrado com esse nome.';
    }
    if (!form || form.tab !== tab) return;
    grid.replaceChildren(...items.map((it) => h('button', {
      type: 'button',
      class: `ch-option${form.challenge?.taxonId === it.taxonId ? ' is-chosen' : ''}`,
      onclick: () => chooseChallenge({ ...it, tag: tab === 'endemic' ? 'Endêmica' : '' }),
    },
    h('span', { class: 'ch-img' }, it.image ? h('img', { src: it.image, alt: '', loading: 'lazy' }) : h('span', { icon: 'leaf' })),
    h('span', { class: 'ch-name' }, it.name),
    it.name !== it.sci ? h('span', { class: 'ch-sci' }, it.sci) : null,
    it.nearby ? h('span', { class: 'ch-count' }, `${it.nearby} registros`) : null)));
  } catch (err) {
    if (err.name === 'AbortError') return;
    note.textContent = 'Não foi possível carregar sugestões agora.';
    grid.replaceChildren();
  }
}

let chTimer = 0;
$('#f-ch-q').addEventListener('input', () => { clearTimeout(chTimer); chTimer = setTimeout(loadSuggestions, 400); });

async function chooseChallenge(it) {
  form.challenge = clean({ ...it, description: '' });
  renderChosen();
  $$('#f-ch-grid .ch-option').forEach((b) => b.classList.remove('is-chosen'));
  if (it.taxonId) {
    try {
      const desc = await geo.speciesSummary(it.taxonId);
      if (form?.challenge?.taxonId === it.taxonId) {
        form.challenge.description = desc.length > 420 ? `${desc.slice(0, 417).trimEnd()}…` : desc;
        renderChosen();
      }
    } catch { /* sem descrição */ }
  }
}

$('#f-ch-custom-ok').addEventListener('click', () => {
  const name = $('#f-ch-name').value.trim();
  if (!name) { $('#f-ch-name').focus(); return; }
  form.challenge = clean({
    source: 'custom', name, sci: '', description: $('#f-ch-desc').value.trim(),
    image: geo.parseMediaLink($('#f-ch-img').value)?.type === 'image' ? $('#f-ch-img').value.trim() : null,
  });
  renderChosen();
});

function renderChosen() {
  const box = $('#f-challenge-chosen');
  const ch = form?.challenge;
  box.hidden = !ch;
  if (!ch) return;
  box.replaceChildren(
    h('span', { class: 'ch-img' }, ch.image ? h('img', { src: ch.image, alt: '' }) : h('span', { icon: 'leaf' })),
    h('div', {},
      h('span', { class: 'mini-label' }, 'Desafio escolhido'),
      h('strong', {}, ch.name),
      ch.sci && ch.sci !== ch.name ? h('em', {}, ch.sci) : null,
      ch.description ? h('p', {}, ch.description) : null),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remover desafio', onclick: () => { form.challenge = null; renderChosen(); loadSuggestions(); } },
      h('span', { icon: 'trash' })));
}

// salvar
$('#form-save').addEventListener('click', saveForm);
async function saveForm() {
  const err = (msg) => { $('#form-error').textContent = msg; };
  if (!form.owner) return err('Escolha quem é você (Marco ou Estela).');
  if (!form.place) return err('Escolha a localidade.');
  if (!form.challenge?.name) return err('Escolha o desafio: o que deve ser encontrado e fotografado.');
  if (form.coverMode === 'link' && $('#f-cover-link').value.trim() && !geo.parseMediaLink($('#f-cover-link').value)) return err('O link da capa não parece válido.');
  err('');

  const name = $('#f-name').value.trim() || form.place.name;
  const place = clean({
    name, city: form.place.city || '', state: form.place.state || '', country: form.place.country || '',
    countryCode: form.place.countryCode || '', lat: form.place.lat, lon: form.place.lon,
    about: form.place.about || '', source: form.place.source || '',
  });
  const btn = $('#form-save');
  btn.disabled = true;
  btn.textContent = 'Salvando…';
  try {
    let cover = form.coverMode === 'file' ? null : coverChoice();
    const data = { owner: form.owner, place, trip: $('#f-trip').value.trim(), challenge: clean(form.challenge) };
    let id = form.id;
    const coverChanged = form.coverMode !== 'keep';
    if (id) {
      // userEdited: a partir daqui, atualizações dos dados iniciais não sobrescrevem este ponto
      await store.updatePoint(id, { ...(coverChanged && form.coverMode !== 'file' ? { ...data, cover: cover ? clean(cover) : null } : data), userEdited: true });
    } else {
      id = await store.createPoint({ ...data, cover: cover ? clean(cover) : null, visited: false, challengeDone: false, createdBy: form.owner });
    }
    if (form.coverMode === 'file' && form.coverFile) {
      btn.textContent = 'Enviando capa…';
      cover = await store.uploadFile(id, form.coverFile, (f) => { btn.textContent = `Enviando capa… ${Math.round(f * 100)}%`; });
      await store.updatePoint(id, { cover: clean(cover) });
    }
    // capa antiga enviada como arquivo é apagada ao ser substituída
    if (form.id && coverChanged && form.oldCover?.path) await store.removeFile(form.oldCover.path);
    const editing = !!form.id;
    closeForm();
    toast(editing ? 'Ponto atualizado' : 'Ponto criado');
    setTimeout(() => openPoint(id), 60);
  } catch (e) {
    failed(e);
    err(`Não foi possível salvar: ${e?.message || e}`);
  } finally {
    btn.disabled = false;
    btn.textContent = form?.id ? 'Salvar alterações' : 'Criar ponto';
  }
}

// ---------- métricas ----------
const statsEl = $('#stats');
const WORLD_COUNTRIES = 195;   // 193 membros da ONU + 2 observadores
const ACCENT = '#1fa863';      // série única (validado no fundo escuro)
const nf = new Intl.NumberFormat('pt-BR');
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const plural = (n, one, many) => `${nf.format(n)} ${n === 1 ? one : many}`;

function haversineKm(a, b) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const q = Math.sin(dLat / 2) ** 2
    + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(q));
}

async function computeStats() {
  const media = await store.listMedia(points.map((p) => p.id));
  const pointsById = new Map(points.map((p) => [p.id, p]));
  const countryOf = (p) => p.place.country || 'Sem país';

  const perCountry = new Map();
  for (const m of media) {
    const p = pointsById.get(m.pointId);
    if (!p) continue;
    const k = countryOf(p);
    const e = perCountry.get(k) || { country: k, cc: p.place.countryCode, photos: 0, videos: 0 };
    if (m.type === 'video') e.videos++; else e.photos++;
    perCountry.set(k, e);
  }
  const countries = [...perCountry.values()]
    .map((e) => ({ ...e, total: e.photos + e.videos }))
    .sort((x, y) => y.total - x.total);

  const visited = points.filter((p) => p.visited);
  const visitedCountries = new Set(visited.map(countryOf));
  const planned = new Map();
  for (const p of points) planned.set(countryOf(p), p.place.countryCode);

  // distância entre os lugares visitados, na ordem em que foram visitados
  const route = [...visited].sort((x, y) => (x.visitedAt || 0) - (y.visitedAt || 0)).map((p) => p.place);
  let km = 0;
  for (let i = 1; i < route.length; i++) km += haversineKm(route[i - 1], route[i]);

  const people = OWNERS.map((name) => ({
    name,
    places: points.filter((p) => (p.createdBy || p.owner) === name).length,
    challenges: points.filter((p) => p.challengeDone && p.challengeBy === name).length,
    uploads: media.filter((m) => m.by === name).length,
    visited: points.filter((p) => p.owner === name && p.visited).length,
  }));

  // fotos por mês, últimos 12 meses
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      year: d.getFullYear(),
      count: 0,
    };
  });
  for (const m of media) {
    if (!m.createdAt) continue;
    const d = new Date(m.createdAt);
    const slot = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (slot) slot.count++;
  }

  return {
    photos: media.filter((m) => m.type !== 'video').length,
    videos: media.filter((m) => m.type === 'video').length,
    countries,
    visitedCountries: [...visitedCountries],
    plannedCountries: [...planned.entries()]
      .map(([country, cc]) => ({ country, cc, visited: visitedCountries.has(country) }))
      .sort((x, y) => Number(y.visited) - Number(x.visited) || x.country.localeCompare(y.country, 'pt-BR')),
    placesVisited: visited.length,
    places: points.length,
    challengesDone: points.filter((p) => p.challengeDone).length,
    km,
    people,
    months,
  };
}

function statTile(label, value, sub, meter) {
  return h('div', { class: 'stat-tile' },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    sub ? h('p', { class: 'stat-sub' }, sub) : null,
    meter != null
      ? h('div', { class: 'meter', role: 'img', 'aria-label': `${meter}%` }, h('span', { style: `width:${meter > 0 ? Math.max(meter, 2) : 0}%` }))
      : null);
}

function chartCard(title, subtitle, ...content) {
  return h('section', { class: 'chart-card' },
    h('header', {}, h('h3', {}, title), subtitle ? h('p', {}, subtitle) : null),
    ...content);
}

const emptyNote = (text) => h('p', { class: 'chart-empty' }, text);

function hbarRow(label, value, max, color, tipText, cc) {
  return h('div', { class: 'hbar-row', 'data-tip': tipText },
    h('span', { class: 'hbar-label' }, cc ? h('span', { class: 'cc' }, cc) : null, label),
    h('span', { class: 'hbar-track' }, h('span', { class: 'hbar', style: `width:${(value / max) * 100}%;background:${color}` })),
    h('span', { class: 'hbar-value' }, nf.format(value)));
}

function renderStats(st) {
  const top = st.countries[0];
  const total = st.photos + st.videos;

  // fotos por país: barras horizontais, uma série
  const maxC = Math.max(1, ...st.countries.map((c) => c.total));
  const shown = st.countries.slice(0, 8);
  const rest = st.countries.slice(8).reduce((acc, c) => acc + c.total, 0);
  if (rest) shown.push({ country: 'Outros', cc: '', total: rest, other: true });
  const byCountry = shown.length
    ? h('div', { class: 'hbars' }, shown.map((c) => hbarRow(c.country, c.total, maxC, ACCENT,
      c.other ? `Outros países: ${c.total}` : `${c.country}: ${plural(c.photos, 'foto', 'fotos')} · ${plural(c.videos, 'vídeo', 'vídeos')}`, c.cc)))
    : emptyNote('Ainda não há fotos. Elas aparecem aqui conforme vocês completam os desafios e montam os álbuns.');

  // perfis: quem adicionou mais lugares, quem achou mais desafios, quem registrou mais
  const metrics = [
    { key: 'places', label: 'Lugares adicionados', one: 'lugar', many: 'lugares' },
    { key: 'challenges', label: 'Desafios encontrados', one: 'desafio', many: 'desafios' },
    { key: 'uploads', label: 'Fotos e vídeos enviados', one: 'item', many: 'itens' },
  ];
  const leads = Object.fromEntries(st.people.map((p) => [p.name, []]));
  for (const mt of metrics) {
    const [a, b] = st.people;
    if (a[mt.key] !== b[mt.key]) leads[a[mt.key] > b[mt.key] ? a.name : b.name].push(mt.label.toLowerCase());
  }
  const profilesCard = h('section', { class: 'chart-card profiles-card' },
    h('header', {}, h('h3', {}, 'Perfis'), h('p', {}, 'Quem adicionou mais lugares e quem achou mais desafios')),
    h('div', { class: 'profiles' }, st.people.map((p) => h('div', { class: 'profile', style: `--c:${OWNER_COLORS[p.name]}` },
      avatar(p.name, 'lg'),
      h('div', { class: 'profile-txt' },
        h('strong', {}, p.name),
        h('span', {}, leads[p.name].length ? `Na frente em ${leads[p.name].join(' e ')}` : 'Empatados por enquanto')),
      h('div', { class: 'profile-nums' },
        metrics.map((mt) => h('span', {}, h('b', {}, nf.format(p[mt.key])), mt.label)))))),
    h('div', { class: 'legend' }, st.people.map((p) => h('span', {}, h('i', { style: `background:${OWNER_COLORS[p.name]}` }), p.name))),
    metrics.map((mt) => {
      const max = Math.max(1, ...st.people.map((p) => p[mt.key]));
      return h('div', { class: 'pair' },
        h('p', { class: 'pair-title' }, mt.label),
        st.people.map((p) => hbarRow(p.name, p[mt.key], max, OWNER_COLORS[p.name], `${p.name}: ${plural(p[mt.key], mt.one, mt.many)}`)));
    }));

  // fotos por mês: colunas, uma série
  const maxM = Math.max(1, ...st.months.map((m) => m.count));
  const monthly = st.months.some((m) => m.count)
    ? h('div', { class: 'cols' }, st.months.map((m) => h('div', { class: 'col', 'data-tip': `${m.label} de ${m.year}: ${plural(m.count, 'item', 'itens')}` },
      h('span', { class: 'col-value' }, m.count ? String(m.count) : ''),
      h('span', { class: 'col-track' }, h('span', { class: 'col-bar', style: `height:${(m.count / maxM) * 100}%;background:${ACCENT}` })),
      h('span', { class: 'col-label' }, m.label))))
    : emptyNote('As fotos dos últimos 12 meses aparecem aqui.');

  const chips = h('div', { class: 'chips' }, st.plannedCountries.map((c) => h('span', { class: `chip-country${c.visited ? ' is-visited' : ''}` },
    h('span', { class: 'cc' }, c.cc || '—'), c.country, c.visited ? h('span', { icon: 'check' }) : null)));

  const table = h('details', { class: 'stats-table' },
    h('summary', {}, 'Ver os dados em tabela'),
    h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'País'), h('th', {}, 'Fotos'), h('th', {}, 'Vídeos'), h('th', {}, 'Visitado'))),
      h('tbody', {}, st.plannedCountries.map((c) => {
        const row = st.countries.find((x) => x.country === c.country) || { photos: 0, videos: 0 };
        return h('tr', {}, h('td', {}, c.country), h('td', {}, String(row.photos)), h('td', {}, String(row.videos)), h('td', {}, c.visited ? 'Sim' : 'Não'));
      }))));

  const nVisited = st.visitedCountries.length;
  $('#stats-body').replaceChildren(
    h('div', { class: 'stat-hero' },
      h('p', { class: 'stat-label' }, 'Fotos e vídeos da aventura'),
      h('p', { class: 'hero-value' }, nf.format(total)),
      h('p', { class: 'stat-sub' }, `${plural(st.photos, 'foto', 'fotos')} · ${plural(st.videos, 'vídeo', 'vídeos')}`)),
    h('div', { class: 'kpis' },
      statTile('Países conhecidos', String(nVisited), `de ${WORLD_COUNTRIES} países do mundo · ${pct(nVisited, WORLD_COUNTRIES)}%`, pct(nVisited, WORLD_COUNTRIES)),
      statTile('Lugares visitados', `${st.placesVisited} de ${st.places}`, `${pct(st.placesVisited, st.places)}% dos pontos do globo`, pct(st.placesVisited, st.places)),
      statTile('Desafios concluídos', `${st.challengesDone} de ${st.places}`, `${pct(st.challengesDone, st.places)}% das missões`, pct(st.challengesDone, st.places)),
      statTile('Distância percorrida', `${nf.format(Math.round(st.km))} km`, st.placesVisited > 1 ? 'entre os lugares visitados, em linha reta' : 'aparece a partir do segundo lugar visitado'),
      statTile('País com mais fotos', top ? top.country : '—', top ? `${plural(top.total, 'item', 'itens')} no álbum` : 'ainda sem fotos'),
      statTile('Países no roteiro', String(st.plannedCountries.length), `${nVisited} já conhecidos · ${st.plannedCountries.length - nVisited} por conhecer`)),
    chartCard('Fotos por país', 'Fotos e vídeos nos álbuns de cada país', byCountry),
    profilesCard,
    chartCard('Fotos por mês', 'Últimos 12 meses', monthly),
    chartCard('Países', 'Conhecidos e no roteiro', chips),
    table);
}

async function openStats() {
  $('#stats-body').replaceChildren(emptyNote('Calculando…'));
  openModal(statsEl);
  try { renderStats(await computeStats()); } catch (err) { failed(err); }
}
$('#btn-stats').addEventListener('click', openStats);
$('#stats-back').addEventListener('click', () => closeModal(statsEl));

// dica ao passar o mouse (ou tocar) nas barras e colunas
const tip = $('#stats-tip');
statsEl.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip;
  tip.hidden = false;
});
statsEl.addEventListener('pointermove', (e) => {
  if (tip.hidden) return;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.transform = `translate(${x}px, ${e.clientY + 16}px)`;
});
statsEl.addEventListener('pointerleave', () => { tip.hidden = true; });

// ---------- teclado ----------
window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (k === 'Escape') {
    if (lb.classList.contains('is-open')) { $('#lb-close').click(); return; }
    if ($('#confirm').classList.contains('is-open')) { $('#confirm-no').click(); return; }
    if (letterEl.classList.contains('is-open')) { closeLetter(); return; }
    if (welcomeEl.classList.contains('is-open')) { closeModal(welcomeEl); return; }
    if (body.classList.contains('is-picking')) { $('#pick-cancel').click(); return; }
    if (formEl.classList.contains('is-open')) { closeForm(); return; }
    if (albumEl.classList.contains('is-open')) { closeModal(albumEl); return; }
    if (statsEl.classList.contains('is-open')) { closeModal(statsEl); return; }
    if (switcher.classList.contains('is-open')) { toggleSwitcher(false); return; }
    if (pointEl.classList.contains('is-open')) { closePoint(); return; }
    togglePanel(false);
    return;
  }
  if (lb.classList.contains('is-open')) {
    if (k === 'ArrowRight') lbStep(1);
    if (k === 'ArrowLeft') lbStep(-1);
    return;
  }
  if (e.target.closest('input, textarea') || $$('.modal.is-open, .album.is-open').length) return;
  if (k === 'ArrowRight') step(1);
  else if (k === 'ArrowLeft') step(-1);
  else if (k === '+' || k === '=') globe.zoomBy(0.62, 6);
  else if (k === '-') globe.zoomBy(1.6, 6);
  else if (k === 'h' || k === 'H') $('#btn-home').click();
  else if (k === 'l' || k === 'L') togglePanel();
  else if (k === 'n' || k === 'N') openForm();
  else if (k === ' ' && !e.target.closest('button')) { e.preventDefault(); globe.setSpinning(!globe.isSpinning()); }
});

// pontos iniciais que ninguém editou recebem fotos e textos atualizados
async function syncSeeds(seeds) {
  for (const s of seeds) {
    const p = byId(s.seedId);
    if (!p || p.userEdited || (p.seedRev || 0) >= s.seedRev) continue;
    const { seedId, owner, ...data } = s;
    try { await store.updatePoint(p.id, clean(data)); } catch (err) { console.error('seed sync', err); }
  }
}

// ---------- início ----------
(async () => {
  store = await createStore();
  if (store.mode === 'local') {
    const banner = $('#mode-banner');
    banner.hidden = false;
    banner.textContent = store.error
      ? `Não foi possível conectar ao Firebase (${store.error.message}). Usando modo local: os dados ficam só neste navegador.`
      : 'Modo local: os dados ficam só neste navegador. Configure o Firebase para Marco e Estela compartilharem.';
  }
  store.subscribePoints((list) => { points = list; refresh(); }, failed);
  store.subscribeProfiles((data) => { profiles = data || {}; repaintAvatars(); }, failed);
  store.subscribeLetter((data) => {
    letter = data;
    renderLetterButton();
    if (letterEl.classList.contains('is-open') && $('#letter-edit').hidden) renderLetter(false);
  }, failed);
  const seeds = SEED_POINTS.map((s) => ({ ...s, seedRev: SEED_REV }));
  try { await store.seedOnce(seeds, LEGACY_SEED_IDS); } catch (err) { console.error('seed', err); }
  setTimeout(() => syncSeeds(seeds), 1500);
  if (!me) openModal($('#identity'));
})();
