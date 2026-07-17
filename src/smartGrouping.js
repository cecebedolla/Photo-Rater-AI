const input = document.querySelector('#photoInput');
const gallery = document.querySelector('#gallery');
const galleryHint = document.querySelector('#galleryHint');

const records = [];
let groups = [];
let applying = false;
let applyTimer;

input?.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;

  galleryHint.textContent = `Grouping 0/${files.length}`;
  const imported = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const [hash, fingerprint] = await Promise.all([hashFile(file), fingerprintImage(file)]);
    imported.push({
      key: `${file.name}|${file.size}|${file.lastModified}|${crypto.randomUUID()}`,
      name: file.name,
      size: file.size,
      capturedAt: file.lastModified || Date.now(),
      hash,
      fingerprint,
    });
    galleryHint.textContent = `Grouping ${index + 1}/${files.length}`;
    await yieldToBrowser();
  }

  records.unshift(...imported);
  groups = buildGroups(records);
  scheduleApply();
}, { capture: true });

const observer = new MutationObserver(() => {
  if (!applying && records.length) scheduleApply();
});

if (gallery) observer.observe(gallery, { childList: true, subtree: true });

function scheduleApply() {
  window.clearTimeout(applyTimer);
  applyTimer = window.setTimeout(applyGroupingToGallery, 20);
}

function applyGroupingToGallery() {
  if (!gallery || !records.length || applying) return;
  const tiles = Array.from(gallery.querySelectorAll('[data-photo-id]'));
  if (!tiles.length) return;

  const tileQueues = new Map();
  tiles.forEach((tile) => {
    const name = tile.querySelector('img')?.alt ?? '';
    if (!tileQueues.has(name)) tileQueues.set(name, []);
    tileQueues.get(name).push(tile);
  });

  const matched = new Map();
  records.forEach((record) => {
    const tile = tileQueues.get(record.name)?.shift();
    if (tile) matched.set(record.key, tile);
  });

  if (!matched.size) return;
  applying = true;
  const fragment = document.createDocumentFragment();

  groups.forEach((group) => {
    const memberTiles = group.members.map((record) => matched.get(record.key)).filter(Boolean);
    if (!memberTiles.length) return;

    const bestTile = [...memberTiles].sort((left, right) => tileScore(right) - tileScore(left))[0];
    const details = document.createElement('details');
    details.className = 'photo-group';
    if (memberTiles.some((tile) => tile.classList.contains('active'))) details.open = true;

    const summary = document.createElement('summary');
    const preview = bestTile.querySelector('img')?.cloneNode();
    if (preview) { preview.alt = ''; summary.appendChild(preview); }

    const label = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = group.type === 'Single' ? group.members[0].name : `${group.type} group`;
    const count = document.createElement('small');
    count.textContent = `${memberTiles.length} photo${memberTiles.length === 1 ? '' : 's'}`;
    label.append(title, count);
    summary.appendChild(label);

    if (memberTiles.length > 1) {
      const badge = document.createElement('b');
      badge.textContent = 'Best pick';
      summary.appendChild(badge);
      bestTile.classList.add('group-best');
      if (!bestTile.querySelector('.best-pick-badge')) {
        const best = document.createElement('strong');
        best.className = 'best-pick-badge';
        best.textContent = 'Best';
        bestTile.appendChild(best);
      }
    }

    const grid = document.createElement('div');
    grid.className = 'photo-grid';
    memberTiles.sort((left, right) => tileScore(right) - tileScore(left)).forEach((tile) => grid.appendChild(tile));
    details.append(summary, grid);
    fragment.appendChild(details);
  });

  gallery.className = 'grouped-gallery';
  gallery.replaceChildren(fragment);
  gallery.dataset.smartGrouped = 'true';
  galleryHint.textContent = `${groups.length} group${groups.length === 1 ? '' : 's'} · ${records.length} photos`;
  applying = false;
}

function buildGroups(items) {
  const parents = items.map((_, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const join = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };

  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      const a = items[left];
      const b = items[right];
      const distance = fingerprintDistance(a.fingerprint, b.fingerprint);
      const exact = Boolean(a.hash && a.hash === b.hash);
      const burst = Math.abs(a.capturedAt - b.capturedAt) <= 4000 && distance <= 54;
      const similar = distance <= 28;
      if (exact || burst || similar) join(left, right);
    }
  }

  const buckets = new Map();
  items.forEach((item, index) => {
    const root = find(index);
    if (!buckets.has(root)) buckets.set(root, []);
    buckets.get(root).push(item);
  });

  return [...buckets.values()].map((members) => {
    const exact = members.length > 1 && members.every((item) => item.hash === members[0].hash);
    const times = members.map((item) => item.capturedAt);
    const timeRange = Math.max(...times) - Math.min(...times);
    const type = exact ? 'Duplicate' : members.length > 1 && timeRange <= 4000 ? 'Burst' : members.length > 1 ? 'Similar' : 'Single';
    return { members, type };
  });
}

async function hashFile(file) {
  if (!crypto.subtle) return `${file.name}:${file.size}:${file.lastModified}`;
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fingerprintImage(file) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  let source;
  let objectUrl;

  try {
    if ('createImageBitmap' in window) source = await createImageBitmap(file);
    else {
      objectUrl = URL.createObjectURL(file);
      source = await loadImage(objectUrl);
    }
    context.drawImage(source, 0, 0, 16, 16);
    const pixels = context.getImageData(0, 0, 16, 16).data;
    const brightness = [];
    for (let index = 0; index < pixels.length; index += 4) {
      brightness.push(Math.round((pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114)));
    }
    const average = brightness.reduce((sum, value) => sum + value, 0) / brightness.length;
    return brightness.map((value) => value >= average ? '1' : '0').join('');
  } catch {
    return '';
  } finally {
    source?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function fingerprintDistance(left, right) {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) distance += 1;
  return distance;
}

function tileScore(tile) {
  const text = tile.querySelector('span')?.textContent ?? '';
  const match = text.match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function yieldToBrowser() {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
