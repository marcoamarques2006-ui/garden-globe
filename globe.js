// Globo com mapa de verdade: MapLibre GL em projeção de globo.
// De longe é um planeta; ao dar zoom, entra no mapa e mostra países, estados,
// cidades, bairros e ruas (OpenStreetMap via OpenFreeMap), com imagens de
// satélite (Sentinel-2 cloudless, EOX) ou estilo de mapa.

const maplibregl = window.maplibregl;
// mais tiles baixando ao mesmo tempo: a imagem nítida chega mais rápido depois do zoom
maplibregl.setMaxParallelImageRequests?.(32);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const SATELLITE_TILES = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg';
const SATELLITE_CREDIT = '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> por EOX IT Services (dados Copernicus Sentinel 2021)';
// de perto: imagens submétricas (prédios, casas, carros) da Esri World Imagery
const HD_TILE = (z, y, x) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
const HD_CREDIT = 'Imagens de alta resolução: Esri, Maxar, Earthstar Geographics e comunidade GIS';
const HD_FROM_ZOOM = 9;             // a imagem detalhada começa a aparecer aqui…
const HD_FULL_ZOOM = 10.5;          // …e cobre tudo a partir daqui
const PLACEHOLDER_MAX_BYTES = 3000; // tiles "Map data not yet available" são bem pequenos

// Carrega tiles da Esri; onde não há imagem naquele nível de zoom, amplia o tile
// do nível acima que tiver imagem, em vez de mostrar o aviso cinza da Esri.
const missing = new Set(); // tiles que a Esri não tem (evita pedir de novo, e pular direto para o nível acima)
const tileKey = (z, y, x) => `${z}/${y}/${x}`;
maplibregl.addProtocol('hdsat', async (params, abort) => {
  const [z, y, x] = params.url.replace('hdsat://', '').split('/').map(Number);
  const get = async (zz, yy, xx) => {
    const res = await fetch(HD_TILE(zz, yy, xx), { signal: abort.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength <= PLACEHOLDER_MAX_BYTES && zz > HD_FROM_ZOOM) missing.add(tileKey(zz, yy, xx));
    return buf;
  };
  // se o tile "pai" já não tinha imagem, este também não tem: nem pergunta
  const parentMissing = missing.has(tileKey(z - 1, y >> 1, x >> 1));
  const own = parentMissing ? null : await get(z, y, x);
  if (own && (own.byteLength > PLACEHOLDER_MAX_BYTES || z <= HD_FROM_ZOOM)) return { data: own };
  if (parentMissing) missing.add(tileKey(z, y, x));
  for (let up = 1; up <= 5; up++) {
    if (missing.has(tileKey(z - up, y >> up, x >> up)) && up < 5) continue;
    const parent = await get(z - up, y >> up, x >> up);
    if (parent.byteLength <= PLACEHOLDER_MAX_BYTES && up < 5) continue;
    const bmp = await createImageBitmap(new Blob([parent]));
    const size = 256 >> up;
    const canvas = new OffscreenCanvas(256, 256);
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, (x - ((x >> up) << up)) * size, (y - ((y >> up) << up)) * size, size, size, 0, 0, 256, 256);
    bmp.close(); // libera a memória da imagem decodificada
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
    return { data: await blob.arrayBuffer() };
  }
  return { data: own || new ArrayBuffer(0) };
});

// ---------- pré-carregamento ----------
// Antes (e durante) um voo, baixa as imagens da área de destino no nível de zoom
// em que o mapa vai chegar. Quando a câmera chega, os tiles já estão no cache do
// navegador e aparecem nítidos na hora, sem a fase "pixelada".
const SAT_URL = (z, y, x) => SATELLITE_TILES.replace('{z}', z).replace('{y}', y).replace('{x}', x);
const prefetched = new Set();
const queue = [];
let active = 0;
function pump() {
  while (active < 6 && queue.length) {
    const url = queue.shift();
    active++;
    fetch(url, { priority: 'low', mode: 'cors' }).catch(() => {}).finally(() => { active--; pump(); });
  }
}
function enqueue(url) {
  if (prefetched.has(url)) return;
  prefetched.add(url);
  queue.push(url);
}
// área = fração da tela a cobrir (1 = tela inteira; 0,6 = só o miolo, onde o zoom costuma ir)
function prefetchArea(lat, lon, mapZoom, w, h, { urgent = false, area = 1 } = {}) {
  const z = Math.min(Math.round(mapZoom) + 1, 19); // tiles de 256 px: um nível acima do zoom do mapa
  const n = 2 ** z;
  const la = Math.max(-85, Math.min(85, lat)) * DEG;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n;
  const rx = Math.ceil((w * area) / 512) + 1;
  const ry = Math.ceil((h * area) / 512) + 1;
  const tiles = [];
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const y = Math.floor(fy) + dy;
      if (y < 0 || y >= n) continue;
      tiles.push({ x: (((Math.floor(fx) + dx) % n) + n) % n, y, d: Math.hypot(dx, dy) });
    }
  }
  // do centro para fora: o que aparece primeiro na tela chega primeiro
  tiles.sort((a, b) => a.d - b.d);
  const urls = [];
  for (const t of tiles) {
    if (z <= 14) urls.push(SAT_URL(z, t.y, t.x));
    if (z >= HD_FROM_ZOOM) urls.push(HD_TILE(z, t.y, t.x));
  }
  const fresh = urls.filter((u) => !prefetched.has(u));
  fresh.forEach((u) => prefetched.add(u));
  if (urgent) queue.unshift(...fresh); else queue.push(...fresh);
  if (prefetched.size > 6000) prefetched.clear(); // o cache do navegador continua; só esquece a lista
  pump();
}

const HOME_LAT = 8;
const LABEL_ZOOM = 4.2;        // a partir daqui os pins ganham nome
const FOCUS_ZOOM = 12;         // zoom ao voar até um ponto
const SPIN_DEG_PER_SEC = 0.3;  // giro automático, bem lento

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;

const ICONS = {
  pending: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.5"/></svg>',
  visited: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4M6 4h11l-2 4 2 4H6"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

// camadas que somem no modo satélite (a imagem de satélite fica no lugar delas)
const isSatellite = (l) => l.id.startsWith('satellite');
const isMapOnly = (l) => l.type === 'fill' || l.type === 'fill-extrusion' || l.type === 'hillshade'
  || (l.type === 'raster' && !isSatellite(l)) || l.id.startsWith('waterway');

// nomes em português quando o OpenStreetMap tiver; senão, o nome latino ou o local
const NAME_PT = ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name']];

async function buildStyle() {
  const style = await (await fetch(STYLE_URL)).json();
  style.sources.satellite = {
    type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 14, attribution: SATELLITE_CREDIT,
  };
  const bgIndex = style.layers.findIndex((l) => l.type === 'background');
  style.sources['satellite-hd'] = {
    type: 'raster', tiles: ['hdsat://{z}/{y}/{x}'], tileSize: 256, minzoom: HD_FROM_ZOOM, maxzoom: 19, attribution: HD_CREDIT,
  };
  style.layers.splice(bgIndex + 1, 0, {
    id: 'satellite', type: 'raster', source: 'satellite', maxzoom: HD_FULL_ZOOM + 0.5,
    paint: { 'raster-fade-duration': 120, 'raster-saturation': 0.08, 'raster-contrast': 0.06 },
  }, {
    id: 'satellite-hd', type: 'raster', source: 'satellite-hd', minzoom: HD_FROM_ZOOM,
    paint: {
      'raster-fade-duration': 120,
      'raster-opacity': ['interpolate', ['linear'], ['zoom'], HD_FROM_ZOOM, 0, HD_FULL_ZOOM, 1],
    },
  });
  for (const l of style.layers) {
    const tf = l.layout?.['text-field'];
    if (l.type === 'symbol' && tf && JSON.stringify(tf).includes('name')) l.layout['text-field'] = NAME_PT;
  }
  style.projection = { type: 'globe' };
  style.sky = {
    'sky-color': '#05070d',
    'horizon-color': '#4d84ff',
    'fog-color': '#0b1430',
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  };
  return style;
}

// céu estrelado desenhado uma vez num canvas, atrás do mapa
function starfield(el) {
  const c = document.createElement('canvas');
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = w * dpr;
  c.height = h * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const n = Math.round((w * h) / 900);
  for (let i = 0; i < n; i++) {
    const r = Math.random() < 0.04 ? 1.4 : Math.random() * 0.8 + 0.2;
    g.globalAlpha = Math.random() * 0.7 + 0.2;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    g.fill();
  }
  el.style.backgroundImage = `url(${c.toDataURL()}), radial-gradient(ellipse at 50% 50%, #0a0f1d 0%, #02030a 60%, #000 100%)`;
  el.style.backgroundSize = 'cover, cover';
}

/**
 * Cria o globo dentro de `container`.
 * opts.onSelect(id)  — clique num pin
 * opts.onReady()     — mapa carregado
 * opts.onInteract()  — o usuário mexeu no mapa
 * opts.onSpinChange(on)
 * opts.paddingFor()  — espaço ocupado por painéis ({ top, right, bottom, left }), para centralizar o ponto na área livre
 */
export function createGlobe(container, pinsLayer, opts = {}) {
  const body = document.body;
  starfield(container);

  const homeZoom = () => {
    // zoom em que o planeta ocupa ~80% da menor dimensão da tela
    const r = (Math.min(container.clientWidth, container.clientHeight) / 2) * (container.clientWidth < 640 ? 0.88 : 0.8);
    return Math.log2((r * 2 * Math.PI) / 512) + 0.3; // +0,3: a perspectiva da câmera deixa o globo menor que o raio teórico
  };

  let map = null;
  let ready = false;
  let mode = 'satellite';
  let spinning = true;
  let spinLevel = 1;
  let lastUserMove = 0;
  let pickHandler = null;
  let labelsOn = false;

  // ---------- pins (camada HTML própria, com agrupamento) ----------
  // Pins próximos na tela viram uma bolha com a quantidade (como no Apple Maps):
  // clicar nela aproxima até separá-los. Nada é deslocado da posição real.
  const pins = new Map();
  let activeId = null;
  const CLUSTER_PX = 30;        // pins mais perto que isso na tela se agrupam

  function makePin(item) {
    const el = document.createElement('div');
    el.className = 'pin';
    const label = document.createElement('button');
    label.className = 'pin-label';
    label.innerHTML = '<span class="pin-status"></span><span class="pin-name"></span>';
    const dot = document.createElement('button');
    dot.className = 'pin-dot';
    const more = document.createElement('button');
    more.className = 'pin-more';
    more.hidden = true;
    const select = () => opts.onSelect?.(item.id);
    label.addEventListener('click', select);
    dot.addEventListener('click', select);
    more.addEventListener('click', (e) => { e.stopPropagation(); zoomToGroup(more._members); });
    el.append(label, dot, more);
    pinsLayer.append(el);
    return { id: item.id, el, label, dot, more, lat: 0, lon: 0, color: '#e3001b', hidden: false, key: '', w: 0, ax: 0, ay: 0, css: '', z: '', state: '' };
  }

  function updatePin(pin, item) {
    const key = `${item.lat}|${item.lon}|${item.name}|${item.color}|${item.status}`;
    if (pin.key === key) return;
    pin.key = key;
    pin.lat = item.lat;
    pin.lon = item.lon;
    pin.color = item.color;
    pin.el.style.setProperty('--pin', item.color);
    pin.el.dataset.status = item.status;
    pin.label.querySelector('.pin-status').innerHTML = ICONS[item.status] ?? ICONS.pending;
    pin.label.querySelector('.pin-name').textContent = item.name;
    pin.dot.setAttribute('aria-label', item.name);
    pin.w = pin.label.offsetWidth; // largura do rótulo, usada para evitar sobreposição
  }
  document.fonts?.ready.then(() => { for (const pin of pins.values()) pin.w = pin.label.offsetWidth; repaint(); });

  // items: [{ id, lat, lon, name, color, status: 'pending'|'visited'|'done' }]
  function setPins(items) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item.id);
      let pin = pins.get(item.id);
      if (!pin) { pin = makePin(item); pins.set(item.id, pin); }
      updatePin(pin, item);
    }
    for (const [id, pin] of pins) {
      if (!seen.has(id)) { pin.el.remove(); pins.delete(id); }
    }
    setActive(activeId);
  }

  function setActive(id) {
    activeId = id;
    for (const [pid, pin] of pins) pin.el.classList.toggle('is-active', pid === id);
    pinsLayer.classList.toggle('has-active', id != null && pins.has(id));
    repaint();
  }

  // marcador temporário do modo "marcar no mapa"
  const pickPin = makePin({ id: '__pick' });
  pickPin.el.classList.add('pin-pick');
  pickPin.el.dataset.hidden = '';
  pickPin.hidden = true;
  pickPin.off = true;

  function setPickMarker(lat, lon) {
    pickPin.off = lat == null;
    if (!pickPin.off) { pickPin.lat = lat; pickPin.lon = lon; }
    repaint();
  }

  function hidePin(pin) {
    if (pin.hidden) return;
    pin.el.dataset.hidden = '';
    pin.hidden = true;
    pin.css = '';
  }
  function showPin(pin) {
    if (!pin.hidden) return;
    delete pin.el.dataset.hidden;
    pin.hidden = false;
  }

  // aproxima até os pins do grupo se separarem
  function zoomToGroup(members) {
    if (!map || !members?.length) return;
    setSpinning(false);
    opts.onInteract?.();
    const b = new maplibregl.LngLatBounds();
    for (const m of members) b.extend([m.lon, m.lat]);
    const cam = map.cameraForBounds(b, { padding: 120 });
    const zoom = Math.min(Math.max(cam?.zoom ?? map.getZoom() + 2, map.getZoom() + 1.5), 15);
    map.flyTo({ center: cam?.center ?? b.getCenter(), zoom, speed: 1.3, essential: true });
  }

  // bolhas de grupo: cada uma pertence a um grupo (chave = ids dos lugares), então
  // a bolha embaixo do cursor continua sendo a mesma enquanto o grupo existir
  const bubbles = new Map();
  function bubble(key) {
    let b = bubbles.get(key);
    if (!b) {
      const el = document.createElement('button');
      el.className = 'cluster';
      el.addEventListener('click', () => zoomToGroup(el._members));
      pinsLayer.append(el);
      b = { el, css: '', txt: '', bg: '', z: '' };
      bubbles.set(key, b);
    }
    b.seen = true;
    return b;
  }

  function place(item, x, y, z) {
    const css = `translate3d(${Math.round(x * 2) / 2}px, ${Math.round(y * 2) / 2}px, 0)`;
    if (css !== item.css) { item.el.style.transform = css; item.css = css; }
    if (z !== item.z) { item.el.style.zIndex = z; item.z = z; }
  }

  // cor da bolha: a de quem é dono dos lugares (azul, rosa ou as duas em proporção)
  function groupBackground(members) {
    const colors = new Map();
    for (const m of members) colors.set(m.color, (colors.get(m.color) || 0) + 1);
    if (colors.size === 1) return [...colors.keys()][0];
    let acc = 0;
    const stops = [...colors.entries()].map(([c, n]) => {
      const from = (acc / members.length) * 100;
      acc += n;
      return `${c} ${from}% ${(acc / members.length) * 100}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  function layoutPins() {
    if (!map) return;
    const transform = map.transform;
    const center = map.getCenter();
    const sinC = Math.sin(center.lat * DEG);
    const cosC = Math.cos(center.lat * DEG);

    const visible = [];
    for (const pin of [...pins.values(), pickPin]) {
      const ll = new maplibregl.LngLat(pin.lon, pin.lat);
      if (pin.off || transform.isLocationOccluded?.(ll)) { hidePin(pin); continue; }
      const p = map.project(ll);
      pin.ax = p.x;
      pin.ay = p.y;
      // proximidade do centro da vista: os da frente têm prioridade e ficam por cima
      pin.depth = sinC * Math.sin(pin.lat * DEG) + cosC * Math.cos(pin.lat * DEG) * Math.cos((pin.lon - center.lng) * DEG);
      pin.active = pin.id === activeId;
      visible.push(pin);
    }
    // ordem estável (o ponto aberto primeiro, o resto por id): os grupos não trocam
    // de composição só porque o globo girou um pouco
    visible.sort((a, b) => (b.active - a.active) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    // agrupa pins que caem perto um do outro na tela; quem já estava junto só se
    // separa um pouco mais longe (histerese), evitando o pisca-pisca na fronteira
    const groups = [];
    for (const p of visible) {
      if (p === pickPin) { groups.push({ lead: p, members: [p] }); continue; }
      const g = groups.find((x) => x.lead !== pickPin
        && Math.hypot(x.lead.ax - p.ax, x.lead.ay - p.ay) < (p.prevLead === x.lead.id ? CLUSTER_PX * 1.4 : CLUSTER_PX));
      if (g) g.members.push(p); else groups.push({ lead: p, members: [p] });
    }
    for (const g of groups) for (const m of g.members) m.prevLead = g.lead.id;

    // rótulos: do mais importante ao menos; quem não couber fica só como ponto
    const boxes = [];
    const fits = (x1, y1, x2, y2) => !boxes.some((b) => x1 < b[2] && x2 > b[0] && y1 < b[3] && y2 > b[1]);
    let n = 0;
    for (const g of groups) {
      const { lead, members } = g;
      const z = lead.active || lead === pickPin ? '5000' : String(Math.round((lead.depth + 1) * 1000));
      if (members.length > 1 && !lead.active) {
        // bolha com a quantidade, no centro do grupo
        for (const m of members) hidePin(m);
        const cx = members.reduce((s, m) => s + m.ax, 0) / members.length;
        const cy = members.reduce((s, m) => s + m.ay, 0) / members.length;
        const b = bubble(members.map((m) => m.id).sort().join('|'));
        n++;
        b.el._members = members;
        b.el.hidden = false;
        place(b, cx, cy, z);
        const txt = String(members.length);
        if (txt !== b.txt) { b.el.textContent = txt; b.txt = txt; }
        const bg = groupBackground(members);
        if (bg !== b.bg) { b.el.style.background = bg; b.bg = bg; }
        b.el.setAttribute('aria-label', `${members.length} lugares: ${members.map((m) => m.dot.getAttribute('aria-label')).join(', ')}`);
        boxes.push([cx - 18, cy - 18, cx + 18, cy + 18]);
        continue;
      }
      // pin sozinho (ou o ponto aberto, que leva um selo "+N" com os vizinhos colados)
      for (const m of members.slice(1)) hidePin(m);
      showPin(lead);
      place(lead, lead.ax, lead.ay, z);
      const extra = members.length - 1;
      lead.more.hidden = extra === 0;
      if (extra) { lead.more.textContent = `+${extra}`; lead.more._members = members; lead.more.title = `Mais ${extra} ${extra === 1 ? 'lugar' : 'lugares'} aqui perto`; }
      let state = '';
      if (lead !== pickPin && (labelsOn || lead.active)) {
        const hw = Math.max(lead.w / 2, 12) + 4;
        const top = lead.active ? 72 : 52;
        const box = [lead.ax - hw, lead.ay - top, lead.ax + hw, lead.ay + 12];
        if (lead.active || fits(...box)) { boxes.push(box); state = 'labeled'; } else { boxes.push([lead.ax - 12, lead.ay - 12, lead.ax + 12, lead.ay + 12]); state = 'dot'; }
      } else {
        boxes.push([lead.ax - 12, lead.ay - 12, lead.ax + 12, lead.ay + 12]);
      }
      if (state !== lead.state) { lead.el.classList.toggle('no-label', state === 'dot'); lead.state = state; }
    }
    // bolhas de grupos que deixaram de existir saem da tela
    for (const [key, b] of bubbles) {
      if (b.seen) { b.seen = false; continue; }
      b.el.remove();
      bubbles.delete(key);
    }
  }

  function repaint() {
    if (map) map.triggerRepaint(); else layoutPins();
  }

  function updateLabels() {
    const on = map.getZoom() >= LABEL_ZOOM;
    if (on !== labelsOn) {
      labelsOn = on;
      body.classList.toggle('show-labels', on);
    }
  }

  // ---------- giro automático ----------
  function setSpinning(on) {
    spinning = on;
    opts.onSpinChange?.(on);
  }

  let pointerDown = false;
  let hoveringPin = false;
  pinsLayer.addEventListener('pointerover', (e) => { hoveringPin = !!e.target.closest('.pin, .cluster'); });
  pinsLayer.addEventListener('pointerout', (e) => { if (!e.relatedTarget?.closest?.('.pin, .cluster')) hoveringPin = false; });
  let lastFrame = performance.now();
  function spinLoop(now) {
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (ready && !document.hidden) {
      const busy = pointerDown || hoveringPin || map.isMoving() || pickHandler || now - lastUserMove < 1500 || map.getZoom() > 5;
      spinLevel += ((spinning && !busy ? 1 : 0) - spinLevel) * (1 - Math.exp(-dt * 1.5));
      if (spinLevel > 0.002 && !map.isMoving()) {
        const c = map.getCenter();
        map.jumpTo({ center: [c.lng - SPIN_DEG_PER_SEC * spinLevel * dt, c.lat] });
      }
    }
    requestAnimationFrame(spinLoop);
  }
  requestAnimationFrame(spinLoop);

  // ---------- navegação ----------
  const padding = () => {
    const p = opts.paddingFor?.() || {};
    return { top: p.top || 0, right: p.right || 0, bottom: p.bottom || 0, left: p.left || 0 };
  };

  function flyTo(lat, lon) {
    if (!map) return;
    setSpinning(false);
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    // do mais fino ao mais grosso, cada um furando a fila: o grosso (poucos tiles) chega primeiro
    for (const z of [zoom, zoom - 3, zoom - 6]) {
      if (z >= 3) prefetchArea(lat, lon, z, container.clientWidth, container.clientHeight, { urgent: true });
    }
    map.flyTo({
      center: [lon, lat],
      zoom,
      padding: padding(),
      speed: 1.1,
      curve: 1.5,
      essential: true,
    });
  }

  function goHome() {
    if (!map) return;
    map.flyTo({ center: [map.getCenter().lng, HOME_LAT], zoom: homeZoom(), bearing: 0, pitch: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, speed: 1.2, essential: true });
    setSpinning(true);
  }

  function zoomBy(factor) {
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() - Math.log2(factor), duration: 380 });
    opts.onInteract?.();
  }

  function setPickMode(handler) {
    pickHandler = handler;
    body.classList.toggle('is-picking', !!handler);
    if (!handler) setPickMarker(null);
  }

  // ---------- modos: satélite × mapa ----------
  const savedPaint = new Map();
  function applyMode() {
    if (!map?.isStyleLoaded()) return;
    const sat = mode === 'satellite';
    for (const l of map.getStyle().layers) {
      if (isSatellite(l)) { map.setLayoutProperty(l.id, 'visibility', sat ? 'visible' : 'none'); continue; }
      if (l.type === 'background') {
        // no satélite, o que ainda não carregou fica escuro (e não branco/creme)
        if (!savedPaint.has(l.id)) savedPaint.set(l.id, { bg: map.getPaintProperty(l.id, 'background-color') });
        map.setPaintProperty(l.id, 'background-color', sat ? '#0b1220' : savedPaint.get(l.id).bg);
        continue;
      }
      if (isMapOnly(l)) { map.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible'); continue; }
      if (l.type === 'symbol') {
        // no satélite: texto claro com contorno escuro, como no app de mapas
        if (!savedPaint.has(l.id)) {
          savedPaint.set(l.id, {
            color: map.getPaintProperty(l.id, 'text-color'),
            halo: map.getPaintProperty(l.id, 'text-halo-color'),
            width: map.getPaintProperty(l.id, 'text-halo-width'),
          });
        }
        const s = savedPaint.get(l.id);
        map.setPaintProperty(l.id, 'text-color', sat ? '#ffffff' : s.color);
        map.setPaintProperty(l.id, 'text-halo-color', sat ? 'rgba(0,0,0,0.78)' : s.halo);
        map.setPaintProperty(l.id, 'text-halo-width', sat ? 1.4 : s.width);
      }
      if (l.type === 'line' && /^(road|bridge|tunnel|highway)/.test(l.id)) {
        // de perto, as ruas ficam mais transparentes para não esconder a imagem
        map.setPaintProperty(l.id, 'line-opacity', sat ? ['interpolate', ['linear'], ['zoom'], 12, 0.55, 17, 0.25] : 1);
      }
    }
    body.dataset.mapMode = mode;
  }

  function setMode(next) {
    mode = next === 'map' ? 'map' : 'satellite';
    applyMode();
  }

  // ---------- criação do mapa ----------
  buildStyle().then((style) => {
    map = new maplibregl.Map({
      container,
      style,
      center: [-50, HOME_LAT],
      zoom: homeZoom() - 1.2,
      minZoom: 0.6,
      // nível 19 é o mais detalhado das fotos aéreas; além de ~18,6 a imagem só seria esticada
      maxZoom: 18.6,
      maxTileCacheSize: 800,       // volta a regiões já vistas sem baixar de novo
      attributionControl: false,
      keyboard: false,
      dragRotate: true,
      pitchWithRotate: true,
      renderWorldCopies: false,
      fadeDuration: 200,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), // telas muito densas não precisam de mais que 2×
      refreshExpiredTiles: false,
      // num zoom grande de uma vez, os níveis do meio continuam chegando: sempre há
      // uma imagem próxima do nível certo para mostrar, em vez de uma muito esticada
      cancelPendingTileRequestsWhileZooming: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    // créditos começam recolhidos (o "i" abre a lista completa)
    const collapseCredits = () => container.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    map.once('idle', collapseCredits);

    map.on('load', () => {
      ready = true;
      collapseCredits();
      applyMode();
      map.easeTo({ zoom: homeZoom(), duration: 2200, easing: (t) => 1 - (1 - t) ** 3 });
      opts.onReady?.();
    });
    map.on('render', () => { updateLabels(); layoutPins(); });
    // com o mapa parado, adianta o próximo nível de zoom do centro da tela:
    // ao aproximar, as imagens nítidas já estão no cache em vez de aparecer pixeladas
    map.on('idle', () => {
      const zoom = map.getZoom();
      if (zoom < 7 || zoom > 18 || mode !== 'satellite') return;
      const c = map.getCenter();
      prefetchArea(c.lat, c.lng, zoom + 1, container.clientWidth, container.clientHeight, { area: 0.6 });
    });
    map.on('movestart', (e) => { if (e.originalEvent) { lastUserMove = performance.now(); opts.onInteract?.(); } });
    map.on('move', (e) => { if (e.originalEvent) lastUserMove = performance.now(); });
    // Touchpad: arrastar com dois dedos move o mapa/gira o globo (como no celular).
    // A pinça (ctrl + rolagem) e a rodinha do mouse continuam com o MapLibre, dando zoom.
    const isMouseWheel = (e) => e.deltaMode !== 0
      || (e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50);
    let vel = { x: 0, y: 0, t: 0 };
    let glideTimer = 0;
    container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || isMouseWheel(e)) return;
      e.preventDefault();
      e.stopPropagation();
      lastUserMove = performance.now();
      opts.onInteract?.();
      if (map.isEasing()) map.stop();
      map.panBy([e.deltaX, e.deltaY], { duration: 0 });
      const now = performance.now();
      const dt = Math.max(now - (vel.t || now - 16), 8);
      vel = { x: vel.x * 0.6 + (e.deltaX / dt) * 0.4, y: vel.y * 0.6 + (e.deltaY / dt) * 0.4, t: now };
      // inércia ao soltar (no Mac o sistema já manda a inércia; aí a velocidade final é baixa e nada é somado)
      clearTimeout(glideTimer);
      glideTimer = setTimeout(() => {
        if (Math.hypot(vel.x, vel.y) > 0.35) {
          map.panBy([vel.x * 320, vel.y * 320], { duration: 750, easing: (t) => 1 - (1 - t) ** 3 });
        }
        vel = { x: 0, y: 0, t: 0 };
      }, 80);
    }, { capture: true, passive: false });

    // Gestos em cima dos pins (ou de qualquer coisa sobre o mapa) não podem virar
    // "zoom da página" do navegador: a pinça e o arrasto de dois dedos vão para o mapa.
    window.addEventListener('wheel', (e) => {
      if (container.contains(e.target)) return;              // o próprio mapa já trata
      const overMap = e.target.closest?.('.pins');
      if (e.ctrlKey) {
        e.preventDefault();                                   // nunca dá zoom na página
        if (!overMap) return;
        map.easeTo({ zoom: map.getZoom() - e.deltaY * 0.012, around: map.unproject([e.clientX, e.clientY]), duration: 0 });
        lastUserMove = performance.now();
        return;
      }
      if (!overMap) return;
      e.preventDefault();
      lastUserMove = performance.now();
      if (isMouseWheel(e)) map.easeTo({ zoom: map.getZoom() - Math.sign(e.deltaY) * 0.5, around: map.unproject([e.clientX, e.clientY]), duration: 250 });
      else map.panBy([e.deltaX, e.deltaY], { duration: 0 });
    }, { passive: false });
    // Safari (Mac): bloqueia o zoom da página por gesto
    for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });

    // marca botão pressionado em qualquer lugar do mapa (pausa o giro imediatamente)
    const down = () => { pointerDown = true; lastUserMove = performance.now(); };
    const up = () => { if (pointerDown) { pointerDown = false; lastUserMove = performance.now(); } };
    container.addEventListener('pointerdown', down);
    pinsLayer.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);

    // Pins e rótulos ficam numa camada por cima do mapa. Ao pressionar o mouse neles,
    // o mapa recebe o mesmo "mousedown": se você arrastar, o mapa move; se só clicar,
    // o pin abre normalmente.
    let pressAt = null;
    pinsLayer.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !e.target.closest('.pin, .cluster')) return;
      pressAt = { x: e.clientX, y: e.clientY };
      e.preventDefault(); // sem seleção de texto nem foco no botão durante o arrasto
      map.getCanvasContainer().dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY,
        screenX: e.screenX, screenY: e.screenY, button: 0, buttons: 1,
        ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
      }));
    });
    // se foi um arrasto, o clique que o navegador dispara no fim não abre o pin
    pinsLayer.addEventListener('click', (e) => {
      if (pressAt && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 5) {
        e.preventDefault();
        e.stopPropagation();
      }
      pressAt = null;
    }, true);

    map.on('click', (e) => {
      if (!pickHandler) return;
      const ll = { lat: e.lngLat.lat, lon: e.lngLat.wrap().lng };
      setPickMarker(ll.lat, ll.lon);
      pickHandler(ll);
    });
    window.addEventListener('resize', () => starfield(container));
  }).catch((err) => {
    console.error('Falha ao carregar o mapa', err);
    opts.onError?.(err);
  });

  return {
    setPins,
    setActive,
    flyTo,
    goHome,
    zoomBy,
    setSpinning,
    isSpinning: () => spinning,
    setPickMode,
    setPickMarker,
    setMode,
    getMode: () => mode,
    // pré-carrega um destino provável (ex.: próximo ponto da lista) sem pressa
    prefetch: (lat, lon) => prefetchArea(lat, lon, Math.max(map?.getZoom() || 0, FOCUS_ZOOM), container.clientWidth, container.clientHeight),
  };
}
