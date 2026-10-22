// Serviços externos: OpenStreetMap (localidades), Wikipédia (foto/descrição do lugar)
// e iNaturalist (espécies realmente registradas perto do ponto).

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const INAT = 'https://api.inaturalist.org/v1';

async function getJson(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const qs = (params) => new URLSearchParams(params).toString();

// ---------- localidades ----------
function toPlace(r, exact) {
  const a = r.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb || a.county || '';
  const state = a.state || a.region || a.province || a.state_district || a.archipelago || '';
  return {
    name: r.name || city || state || a.country || 'Local sem nome',
    city,
    state,
    country: a.country || '',
    countryCode: (a.country_code || '').toUpperCase(),
    lat: exact?.lat ?? Number(r.lat),
    lon: exact?.lon ?? Number(r.lon),
    display: r.display_name || '',
    wikipedia: r.extratags?.wikipedia || '',
    kind: r.addresstype || r.type || '',
  };
}

export async function searchPlaces(q, signal) {
  const list = await getJson(`${NOMINATIM}/search?${qs({
    q, format: 'jsonv2', addressdetails: 1, extratags: 1, limit: 8, 'accept-language': 'pt-BR',
  })}`, signal);
  return list.map((r) => toPlace(r));
}

// lat/lon exatos do clique são mantidos; o nome vem da localidade mais próxima
export async function reversePlace(lat, lon, signal) {
  const r = await getJson(`${NOMINATIM}/reverse?${qs({
    lat, lon, format: 'jsonv2', addressdetails: 1, extratags: 1, zoom: 10, 'accept-language': 'pt-BR',
  })}`, signal);
  if (r.error) return { name: 'Ponto no mapa', city: '', state: '', country: '', countryCode: '', lat, lon, display: '', wikipedia: '' };
  return toPlace(r, { lat, lon });
}

// "Cidade · Estado · País", sem repetir o nome do ponto
export function placeLine(p) {
  const parts = [p.city, p.state, p.country].filter((x, i, arr) => x && x !== p.name && arr.indexOf(x) === i);
  return parts.join(' · ');
}

export function formatCoords(lat, lon) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(4).replace('.', ',')}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 'N', 'S')} · ${f(lon, 'L', 'O')}`;
}

// ---------- foto e descrição do lugar (Wikipédia) ----------
async function wiki(lang, params, signal) {
  return getJson(`https://${lang}.wikipedia.org/w/api.php?${qs({ action: 'query', format: 'json', origin: '*', ...params })}`, signal);
}

export async function placeInfo(place, signal) {
  let lang = 'pt';
  let title = '';
  if (place.wikipedia) {
    const [l, ...t] = place.wikipedia.split(':');
    lang = l;
    title = t.join(':');
  }
  if (!title) {
    const gs = await wiki('pt', { list: 'geosearch', gscoord: `${place.lat}|${place.lon}`, gsradius: 10000, gslimit: 1 }, signal);
    title = gs.query?.geosearch?.[0]?.title || '';
  }
  if (!title) return null;
  const d = await wiki(lang, {
    titles: title, prop: 'pageimages|extracts|info', inprop: 'url', exintro: 1, explaintext: 1,
    exsentences: 3, pithumbsize: 1280, redirects: 1,
  }, signal);
  const page = Object.values(d.query?.pages || {})[0];
  if (!page || page.missing !== undefined) return null;
  return { image: page.thumbnail?.source || null, about: page.extract || '', source: page.fullurl || '' };
}

// ---------- desafios (iNaturalist) ----------
function toItem(t, nearby) {
  return {
    source: 'inat',
    taxonId: t.id,
    name: t.preferred_common_name || t.name,
    sci: t.name,
    image: t.default_photo?.medium_url || null,
    imageCredit: t.default_photo?.attribution || '',
    url: `https://www.inaturalist.org/taxa/${t.id}`,
    nearby: nearby ?? null,
  };
}

const ICONIC = { plantas: 'Plantae', fungos: 'Fungi' };

// espécies mais registradas num raio de 30 km
export async function nearbySpecies(lat, lon, kind = 'plantas', signal) {
  const d = await getJson(`${INAT}/observations/species_counts?${qs({
    lat, lng: lon, radius: 30, iconic_taxa: ICONIC[kind] || 'Plantae', quality_grade: 'research', locale: 'pt-BR', per_page: 24,
  })}`, signal);
  return d.results.map((r) => toItem(r.taxon, r.count));
}

// espécies endêmicas registradas no estado/região que contém o ponto
export async function endemicSpecies(lat, lon, signal) {
  const e = 0.01;
  const pl = await getJson(`${INAT}/places/nearby?${qs({ nelat: lat + e, nelng: lon + e, swlat: lat - e, swlng: lon - e })}`, signal);
  const std = pl.results?.standard || [];
  const region = std.find((p) => p.admin_level === 10) || std.find((p) => p.admin_level === 0);
  if (!region) return { region: null, items: [] };
  const d = await getJson(`${INAT}/observations/species_counts?${qs({
    place_id: region.id, endemic: 'true', iconic_taxa: 'Plantae', quality_grade: 'research', locale: 'pt-BR', per_page: 24,
  })}`, signal);
  return { region: region.display_name || region.name, items: d.results.map((r) => toItem(r.taxon, r.count)) };
}

export async function searchSpecies(q, signal) {
  const d = await getJson(`${INAT}/taxa/autocomplete?${qs({ q, locale: 'pt-BR', per_page: 12 })}`, signal);
  return d.results.map((t) => toItem(t));
}

// resumo da Wikipédia que o iNaturalist guarda para o táxon
export async function speciesSummary(taxonId, signal) {
  const d = await getJson(`${INAT}/taxa/${taxonId}?${qs({ locale: 'pt-BR' })}`, signal);
  const t = d.results?.[0];
  if (!t) return '';
  // DOMParser gera um documento inerte: nada do HTML é carregado ou executado
  const doc = new DOMParser().parseFromString(t.wikipedia_summary || '', 'text/html');
  return doc.body.textContent.trim();
}

// ---------- links de mídia ----------
export function parseMediaLink(url) {
  const s = url.trim();
  if (!s) return null;
  const yt = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/))([\w-]{11})/);
  if (yt) return { type: 'youtube', url: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&playsinline=1` };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(s)) return { type: 'video', url: s };
  if (/^https?:\/\//i.test(s)) return { type: 'image', url: s };
  return null;
}
