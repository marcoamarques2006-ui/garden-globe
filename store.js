// Camada de dados: Firebase (compartilhado) ou IndexedDB (modo local), com a mesma interface.
//
// Ponto (coleção `points`):
//   owner: 'Marco' | 'Estela'
//   place: { name, city, state, country, countryCode, lat, lon, display, about, source }
//   cover: { type: 'image' | 'video' | 'youtube', url, path?, credit? } | null
//   challenge: { name, sci, description, image, imageCredit, url, source, taxonId? }
//   visited, visitedAt, challengeDone, challengeMediaId, mediaCount, createdAt, updatedAt
// Mídia (subcoleção `points/{id}/media`):
//   type: 'image' | 'video', url, path, name, by, isChallenge, createdAt

import { firebaseConfig } from './firebase-config.js';

export const OWNERS = ['Marco', 'Estela'];
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export async function createStore() {
  if (firebaseConfig?.apiKey) {
    try {
      return await firebaseStore(firebaseConfig);
    } catch (err) {
      console.error(err);
      const store = await localStore();
      store.error = err;
      return store;
    }
  }
  return localStore();
}

const safeName = (name) => name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
const mediaType = (file) => (file.type.startsWith('video/') ? 'video' : 'image');

// ---------- Firebase ----------
async function firebaseStore(config) {
  const [{ initializeApp }, au, fs, st] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
    import(`${SDK}/firebase-storage.js`),
  ]);
  const app = initializeApp(config);
  await au.signInAnonymously(au.getAuth(app));
  const db = fs.getFirestore(app);
  const storage = st.getStorage(app);
  const pointsCol = fs.collection(db, 'points');
  const pointRef = (id) => fs.doc(db, 'points', id);
  const mediaCol = (id) => fs.collection(db, 'points', id, 'media');

  function uploadFile(pointId, file, onProgress) {
    const path = `points/${pointId}/${Date.now()}-${safeName(file.name || 'arquivo')}`;
    const task = st.uploadBytesResumable(st.ref(storage, path), file, { contentType: file.type });
    return new Promise((resolve, reject) => {
      task.on('state_changed',
        (s) => onProgress?.(s.bytesTransferred / s.totalBytes),
        reject,
        async () => resolve({ type: mediaType(file), url: await st.getDownloadURL(task.snapshot.ref), path }));
    });
  }

  const removeFile = (path) => (path ? st.deleteObject(st.ref(storage, path)).catch(() => {}) : null);

  return {
    mode: 'firebase',

    // cria cada ponto inicial uma única vez (ids já criados ficam em meta/seed)
    async seedOnce(points, legacyIds = []) {
      const metaRef = fs.doc(db, 'meta', 'seed');
      const meta = await fs.getDoc(metaRef);
      const done = new Set(meta.exists() ? meta.data().ids || legacyIds : []);
      const fresh = points.filter((p) => !done.has(p.seedId));
      if (!fresh.length) return;
      await fs.setDoc(metaRef, { ids: [...done, ...fresh.map((p) => p.seedId)], at: Date.now() });
      const now = Date.now();
      await Promise.all(fresh.map(({ seedId, ...p }, i) => fs.setDoc(pointRef(seedId), {
        ...p, visited: false, challengeDone: false, mediaCount: 0, createdAt: now + i, updatedAt: now,
      })));
    },

    // perfis: foto de cada pessoa (meta/profiles)
    subscribeProfiles(cb, onError) {
      return fs.onSnapshot(fs.doc(db, 'meta', 'profiles'), (d) => cb(d.exists() ? d.data() : {}), onError);
    },
    async saveProfilePhoto(name, file) {
      const up = await uploadFile('profiles', file);
      const ref = fs.doc(db, 'meta', 'profiles');
      const old = (await fs.getDoc(ref)).data()?.[name];
      await fs.setDoc(ref, { [name]: { photo: up.url, path: up.path, updatedAt: Date.now() } }, { merge: true });
      if (old?.path) removeFile(old.path);
    },

    // carta de aniversário (um único documento: meta/letter)
    subscribeLetter(cb, onError) {
      return fs.onSnapshot(fs.doc(db, 'meta', 'letter'), (d) => cb(d.exists() ? d.data() : null), onError);
    },
    saveLetter(data) {
      return fs.setDoc(fs.doc(db, 'meta', 'letter'), { ...data, updatedAt: Date.now() });
    },

    subscribePoints(cb, onError) {
      return fs.onSnapshot(fs.query(pointsCol, fs.orderBy('createdAt')),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
    },

    async createPoint(data) {
      const now = Date.now();
      const ref = await fs.addDoc(pointsCol, { ...data, mediaCount: 0, createdAt: now, updatedAt: now });
      return ref.id;
    },

    updatePoint(id, patch) {
      return fs.updateDoc(pointRef(id), { ...patch, updatedAt: Date.now() });
    },

    async deletePoint(id) {
      const snap = await fs.getDoc(pointRef(id));
      const media = await fs.getDocs(mediaCol(id));
      await Promise.all(media.docs.map(async (d) => {
        await removeFile(d.data().path);
        await fs.deleteDoc(d.ref);
      }));
      await removeFile(snap.data()?.cover?.path);
      await fs.deleteDoc(pointRef(id));
    },

    uploadFile,
    removeFile,

    // todas as mídias de vários pontos (para as métricas)
    async listMedia(pointIds) {
      const lists = await Promise.all(pointIds.map(async (id) => {
        const snap = await fs.getDocs(mediaCol(id));
        return snap.docs.map((d) => ({ id: d.id, pointId: id, ...d.data() }));
      }));
      return lists.flat();
    },

    subscribeMedia(pointId, cb, onError) {
      return fs.onSnapshot(fs.query(mediaCol(pointId), fs.orderBy('createdAt', 'desc')),
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
    },

    async addMedia(pointId, file, meta, onProgress) {
      const up = await uploadFile(pointId, file, onProgress);
      const ref = await fs.addDoc(mediaCol(pointId), {
        ...up, name: file.name || '', isChallenge: false, ...meta, createdAt: Date.now(),
      });
      await fs.updateDoc(pointRef(pointId), { mediaCount: fs.increment(1), updatedAt: Date.now() });
      return ref.id;
    },

    updateMedia(pointId, mediaId, patch) {
      return fs.updateDoc(fs.doc(db, 'points', pointId, 'media', mediaId), patch);
    },

    async deleteMedia(pointId, media) {
      await removeFile(media.path);
      await fs.deleteDoc(fs.doc(db, 'points', pointId, 'media', media.id));
      await fs.updateDoc(pointRef(pointId), { mediaCount: fs.increment(-1), updatedAt: Date.now() });
    },
  };
}

// ---------- modo local (IndexedDB) ----------
async function localStore() {
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const db = await new Promise((res, rej) => {
    const open = indexedDB.open('garden-globe', 1);
    open.onupgradeneeded = () => {
      const d = open.result;
      d.createObjectStore('points', { keyPath: 'id' });
      d.createObjectStore('media', { keyPath: 'id' }).createIndex('pointId', 'pointId');
      d.createObjectStore('files');
    };
    open.onsuccess = () => res(open.result);
    open.onerror = () => rej(open.error);
  });
  const os = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);

  // arquivos ficam como Blob no IndexedDB; a URL é criada na leitura
  const urls = new Map();
  async function urlFor(path) {
    if (!path) return null;
    if (!urls.has(path)) {
      const blob = await req(os('files').get(path));
      urls.set(path, blob ? URL.createObjectURL(blob) : null);
    }
    return urls.get(path);
  }
  async function withUrl(obj) {
    if (obj?.path && obj.local) return { ...obj, url: await urlFor(obj.path) };
    return obj;
  }

  const pointSubs = new Set();
  const mediaSubs = new Map(); // pointId → Set(cb)
  const letterSubs = new Set();
  const profileSubs = new Set();
  async function readProfiles() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('gg-profiles')) || {}; } catch { /* vazio */ }
    const out = {};
    for (const [name, p] of Object.entries(saved)) out[name] = { ...p, photo: await urlFor(p.path) };
    return out;
  }
  const readLetter = () => { try { return JSON.parse(localStorage.getItem('gg-letter')); } catch { return null; } };

  async function readPoints() {
    const all = await req(os('points').getAll());
    all.sort((a, b) => a.createdAt - b.createdAt);
    return Promise.all(all.map(async (p) => ({ ...p, cover: await withUrl(p.cover) })));
  }
  async function readMedia(pointId) {
    const all = await req(os('media').index('pointId').getAll(pointId));
    all.sort((a, b) => b.createdAt - a.createdAt);
    return Promise.all(all.map(withUrl));
  }
  async function emitPoints() {
    const list = await readPoints();
    pointSubs.forEach((cb) => cb(list));
  }
  async function emitMedia(pointId) {
    const subs = mediaSubs.get(pointId);
    if (!subs?.size) return;
    const list = await readMedia(pointId);
    subs.forEach((cb) => cb(list));
  }

  async function getPoint(id) { return req(os('points').get(id)); }
  async function putPoint(p) { await req(os('points', 'readwrite').put(p)); }

  async function uploadFile(_pointId, file, onProgress) {
    const path = `local/${crypto.randomUUID()}-${safeName(file.name || 'arquivo')}`;
    await req(os('files', 'readwrite').put(file, path));
    onProgress?.(1);
    return { type: mediaType(file), url: await urlFor(path), path, local: true };
  }
  async function removeFile(path) {
    if (!path) return;
    await req(os('files', 'readwrite').delete(path));
    if (urls.get(path)) URL.revokeObjectURL(urls.get(path));
    urls.delete(path);
  }
  // não guarda URLs temporárias (blob:) no banco
  const strip = (obj) => (obj?.local ? { ...obj, url: null } : obj);

  return {
    mode: 'local',

    async seedOnce(points, legacyIds = []) {
      let done;
      try {
        const saved = localStorage.getItem('gg-seeded-ids');
        done = new Set(saved ? JSON.parse(saved) : localStorage.getItem('gg-seeded') ? legacyIds : []);
      } catch { return; }
      const fresh = points.filter((p) => !done.has(p.seedId));
      if (!fresh.length) return;
      try { localStorage.setItem('gg-seeded-ids', JSON.stringify([...done, ...fresh.map((p) => p.seedId)])); } catch { return; }
      const now = Date.now();
      for (const [i, { seedId, ...p }] of fresh.entries()) {
        await putPoint({ ...p, id: seedId, visited: false, challengeDone: false, mediaCount: 0, createdAt: now + i, updatedAt: now });
      }
      emitPoints();
    },

    subscribeProfiles(cb) {
      profileSubs.add(cb);
      readProfiles().then(cb);
      return () => profileSubs.delete(cb);
    },
    async saveProfilePhoto(name, file) {
      const up = await uploadFile('profiles', file);
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('gg-profiles')) || {}; } catch { /* vazio */ }
      if (saved[name]?.path) await removeFile(saved[name].path);
      saved[name] = { path: up.path, updatedAt: Date.now() };
      try { localStorage.setItem('gg-profiles', JSON.stringify(saved)); } catch { /* sem storage */ }
      const list = await readProfiles();
      profileSubs.forEach((f) => f(list));
    },

    subscribeLetter(cb) {
      letterSubs.add(cb);
      cb(readLetter());
      return () => letterSubs.delete(cb);
    },
    async saveLetter(data) {
      try { localStorage.setItem('gg-letter', JSON.stringify({ ...data, updatedAt: Date.now() })); } catch { /* sem storage */ }
      letterSubs.forEach((f) => f(readLetter()));
    },

    subscribePoints(cb) {
      pointSubs.add(cb);
      readPoints().then(cb);
      return () => pointSubs.delete(cb);
    },

    async createPoint(data) {
      const id = crypto.randomUUID();
      const now = Date.now();
      await putPoint({ ...data, cover: strip(data.cover), id, mediaCount: 0, createdAt: now, updatedAt: now });
      emitPoints();
      return id;
    },

    async updatePoint(id, patch) {
      const p = await getPoint(id);
      if (!p) return;
      const next = { ...p, ...patch, updatedAt: Date.now() };
      if ('cover' in patch) next.cover = strip(patch.cover);
      await putPoint(next);
      emitPoints();
    },

    async deletePoint(id) {
      const p = await getPoint(id);
      const media = await req(os('media').index('pointId').getAll(id));
      for (const m of media) {
        await removeFile(m.path);
        await req(os('media', 'readwrite').delete(m.id));
      }
      if (p?.cover?.local) await removeFile(p.cover.path);
      await req(os('points', 'readwrite').delete(id));
      emitPoints();
    },

    uploadFile,
    removeFile,

    async listMedia(pointIds) {
      const ids = new Set(pointIds);
      const all = await req(os('media').getAll());
      return all.filter((m) => ids.has(m.pointId));
    },

    subscribeMedia(pointId, cb) {
      if (!mediaSubs.has(pointId)) mediaSubs.set(pointId, new Set());
      mediaSubs.get(pointId).add(cb);
      readMedia(pointId).then(cb);
      return () => mediaSubs.get(pointId)?.delete(cb);
    },

    async addMedia(pointId, file, meta, onProgress) {
      const up = await uploadFile(pointId, file, onProgress);
      const id = crypto.randomUUID();
      await req(os('media', 'readwrite').put({
        ...up, url: null, id, pointId, name: file.name || '', isChallenge: false, ...meta, createdAt: Date.now(),
      }));
      const p = await getPoint(pointId);
      if (p) await putPoint({ ...p, mediaCount: (p.mediaCount || 0) + 1, updatedAt: Date.now() });
      emitMedia(pointId);
      emitPoints();
      return id;
    },

    async updateMedia(pointId, mediaId, patch) {
      const m = await req(os('media').get(mediaId));
      if (!m) return;
      await req(os('media', 'readwrite').put({ ...m, ...patch }));
      emitMedia(pointId);
    },

    async deleteMedia(pointId, media) {
      await removeFile(media.path);
      await req(os('media', 'readwrite').delete(media.id));
      const p = await getPoint(pointId);
      if (p) await putPoint({ ...p, mediaCount: Math.max(0, (p.mediaCount || 1) - 1), updatedAt: Date.now() });
      emitMedia(pointId);
      emitPoints();
    },
  };
}
