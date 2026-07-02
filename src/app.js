import { defaultPreferenceProfile, ratingCategories, scorePhoto } from './aiScoring.js';

const preferenceStorageKey = 'photo-rater-ai.preference-profile';
const state = { photos: [], activeId: null, profile: loadPreferenceProfile(), isScoring: false };

const elements = {
  input: document.querySelector('#photoInput'),
  scoreButton: document.querySelector('#scoreButton'),
  gallery: document.querySelector('#gallery'),
  detailPanel: document.querySelector('#detailPanel'),
  uploadedCount: document.querySelector('#uploadedCount'),
  scoredCount: document.querySelector('#scoredCount'),
  averageScore: document.querySelector('#averageScore'),
  likedCount: document.querySelector('#likedCount'),
};

elements.input.addEventListener('change', (event) => importPhotos(event.target.files ?? []));
elements.scoreButton.addEventListener('click', () => scoreAllPhotos());
window.addEventListener('beforeunload', () => state.photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)));

function importPhotos(files) {
  const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
  const mapped = incoming.map((file) => ({
    id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl: URL.createObjectURL(file),
    uploadedAt: Date.now(),
    preference: 'neutral',
  }));
  state.photos = [...mapped, ...state.photos];
  state.activeId = state.activeId ?? mapped[0]?.id ?? null;
  render();
}

async function scoreAllPhotos() {
  state.isScoring = true;
  render();
  for (const photo of state.photos) {
    if (photo.scores) continue;
    Object.assign(photo, await scorePhoto(photo, state.profile));
    render();
  }
  state.isScoring = false;
  render();
}

function updatePreference(photoId, preference) {
  const photo = state.photos.find((item) => item.id === photoId);
  if (!photo) return;
  photo.preference = preference;
  state.profile.likedPhotoIds = state.profile.likedPhotoIds.filter((id) => id !== photoId);
  state.profile.dislikedPhotoIds = state.profile.dislikedPhotoIds.filter((id) => id !== photoId);
  if (preference === 'liked') state.profile.likedPhotoIds.push(photoId);
  if (preference === 'disliked') state.profile.dislikedPhotoIds.push(photoId);
  state.profile.categoryWeights = tuneWeights(state.profile.categoryWeights, photo, preference);
  state.profile.lastUpdated = Date.now();
  localStorage.setItem(preferenceStorageKey, JSON.stringify(state.profile));
  render();
}

function render() {
  const scored = state.photos.filter((photo) => photo.overall);
  elements.uploadedCount.textContent = state.photos.length;
  elements.scoredCount.textContent = scored.length;
  elements.averageScore.textContent = scored.length ? `${Math.round(scored.reduce((sum, photo) => sum + photo.overall, 0) / scored.length)}/10` : '—';
  elements.likedCount.textContent = state.profile.likedPhotoIds.length;
  elements.scoreButton.disabled = !state.photos.length || state.isScoring;
  elements.scoreButton.textContent = state.isScoring ? 'Scoring…' : 'Score unscored';
  renderGallery();
  renderDetail();
}

function renderGallery() {
  if (!state.photos.length) {
    elements.gallery.className = 'photo-grid empty-state';
    elements.gallery.textContent = 'Drop in a full shoot or camera roll export to begin comparing candidates.';
    return;
  }
  elements.gallery.className = 'photo-grid';
  elements.gallery.innerHTML = state.photos.map((photo) => `<button class="photo-tile ${photo.id === state.activeId ? 'active' : ''}" data-photo-id="${photo.id}"><img src="${photo.previewUrl}" alt="${escapeHtml(photo.name)}" loading="lazy"><span>${photo.overall ? `${photo.overall}/10` : 'Queued'}</span></button>`).join('');
  elements.gallery.querySelectorAll('[data-photo-id]').forEach((button) => button.addEventListener('click', () => { state.activeId = button.dataset.photoId; render(); }));
}

function renderDetail() {
  const photo = state.photos.find((item) => item.id === state.activeId) ?? state.photos[0];
  if (!photo) {
    elements.detailPanel.innerHTML = '<div class="empty-state">Select a photo to inspect scores and preference signals.</div>';
    return;
  }
  elements.detailPanel.innerHTML = `<img class="detail-image" src="${photo.previewUrl}" alt="${escapeHtml(photo.name)}"><div class="detail-header"><div><h2>${escapeHtml(photo.name)}</h2><p>${formatBytes(photo.size)}</p></div><strong>${photo.overall ? `${photo.overall}/10` : 'Not scored'}</strong></div><div class="score-list">${ratingCategories.map((category) => `<div class="score-row"><span>${category.label}</span><meter min="1" max="10" value="${photo.scores?.[category.key] ?? 1}"></meter><b>${photo.scores?.[category.key] ?? '—'}</b></div>`).join('')}</div><div class="preference-actions"><button class="${photo.preference === 'liked' ? 'selected' : ''}" data-pref="liked">Like</button><button class="${photo.preference === 'disliked' ? 'selected' : ''}" data-pref="disliked">Dislike</button><button data-pref="neutral">Neutral</button></div><ul class="notes">${(photo.aiNotes ?? ['Run AI scoring to generate strict rubric feedback.']).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
  elements.detailPanel.querySelectorAll('[data-pref]').forEach((button) => button.addEventListener('click', () => updatePreference(photo.id, button.dataset.pref)));
}

function tuneWeights(weights, photo, preference) {
  if (!photo?.scores || preference === 'neutral') return weights;
  const direction = preference === 'liked' ? 0.04 : -0.03;
  return Object.fromEntries(ratingCategories.map(({ key }) => [key, Math.max(0.6, Math.min(1.6, weights[key] + (photo.scores[key] - 5) * direction))]));
}

function loadPreferenceProfile() {
  const stored = localStorage.getItem(preferenceStorageKey);
  return stored ? { ...defaultPreferenceProfile, ...JSON.parse(stored) } : structuredClone(defaultPreferenceProfile);
}

function formatBytes(bytes) { return `${(bytes / 1_000_000).toFixed(1)} MB`; }
function escapeHtml(value) { return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

render();
