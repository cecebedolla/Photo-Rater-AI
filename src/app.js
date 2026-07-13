import { defaultPreferenceProfile, ratingCategories, scorePhoto } from './aiScoring.js';

const preferenceStorageKey = 'photo-rater-ai.preference-profile';
const trainingStorageKey = 'photo-rater-ai.training-examples';
const reasonOptions = ['Great expression', 'Flattering pose', 'Good lighting', 'Strong social vibe', 'Amazing setting', 'Awkward expression', 'Unflattering pose', 'Bad lighting', 'Blurry', 'Distracting background'];
const state = { photos: [], activeId: null, profile: loadPreferenceProfile(), training: loadTrainingExamples(), isScoring: false, scoringDone: 0, scoringTotal: 0 };

const elements = {
  input: document.querySelector('#photoInput'), scoreButton: document.querySelector('#scoreButton'), gallery: document.querySelector('#gallery'), detailPanel: document.querySelector('#detailPanel'), uploadedCount: document.querySelector('#uploadedCount'), scoredCount: document.querySelector('#scoredCount'), averageScore: document.querySelector('#averageScore'), likedCount: document.querySelector('#likedCount'), redFlagCount: document.querySelector('#redFlagCount'), trainingCount: document.querySelector('#trainingCount'), topCeceScore: document.querySelector('#topCeceScore'), topCeceLabel: document.querySelector('#topCeceLabel'), galleryHint: document.querySelector('#galleryHint'),
};

elements.input.addEventListener('change', (event) => { importPhotos(event.target.files ?? []); event.target.value = ''; });
elements.scoreButton.addEventListener('click', () => scoreAllPhotos());
window.addEventListener('beforeunload', () => state.photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl)));

function importPhotos(files) {
  const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
  const mapped = incoming.map((file) => {
    const stableKey = `${file.name}|${file.size}|${file.lastModified}`;
    const saved = state.training[stableKey] ?? {};
    return { id: `${stableKey}-${crypto.randomUUID()}`, stableKey, name: file.name, size: file.size, type: file.type, previewUrl: URL.createObjectURL(file), uploadedAt: Date.now(), preference: saved.preference ?? 'neutral', userRating: saved.userRating ?? null, reasons: saved.reasons ?? [], userNote: saved.userNote ?? '' };
  });
  state.photos = [...mapped, ...state.photos];
  state.activeId = state.activeId ?? mapped[0]?.id ?? null;
  render();
}

async function scoreAllPhotos() {
  const queue = state.photos.filter((photo) => !photo.scores);
  if (!queue.length || state.isScoring) return;
  state.isScoring = true; state.scoringDone = 0; state.scoringTotal = queue.length; render();
  const workerCount = Math.min(2, queue.length); let nextIndex = 0;
  async function worker() {
    while (nextIndex < queue.length) {
      const photo = queue[nextIndex++];
      try { Object.assign(photo, await scorePhoto(photo, state.profile)); }
      catch (error) { photo.error = error instanceof Error ? error.message : 'Scoring failed'; }
      state.scoringDone += 1; updateProgress();
      if (state.scoringDone % 5 === 0 || state.scoringDone === state.scoringTotal) render();
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  state.isScoring = false; render();
}

function updateProgress() {
  const remaining = state.scoringTotal - state.scoringDone;
  elements.scoreButton.textContent = `Scoring ${state.scoringDone}/${state.scoringTotal}`;
  elements.galleryHint.textContent = remaining ? `${remaining} remaining` : 'Finishing…';
  elements.scoredCount.textContent = state.photos.filter((photo) => photo.overall).length;
}

function updatePreference(photoId, preference) {
  const photo = state.photos.find((item) => item.id === photoId); if (!photo) return;
  photo.preference = preference;
  state.profile.likedPhotoIds = state.profile.likedPhotoIds.filter((id) => id !== photo.stableKey);
  state.profile.dislikedPhotoIds = state.profile.dislikedPhotoIds.filter((id) => id !== photo.stableKey);
  if (preference === 'liked') state.profile.likedPhotoIds.push(photo.stableKey);
  if (preference === 'disliked') state.profile.dislikedPhotoIds.push(photo.stableKey);
  state.profile.categoryWeights = tuneWeights(state.profile.categoryWeights, photo, preference);
  state.profile.lastUpdated = Date.now();
  localStorage.setItem(preferenceStorageKey, JSON.stringify(state.profile));
  saveTraining(photo); render();
}

function updateTraining(photoId, patch) {
  const photo = state.photos.find((item) => item.id === photoId); if (!photo) return;
  Object.assign(photo, patch); saveTraining(photo); render();
}

function toggleReason(photoId, reason) {
  const photo = state.photos.find((item) => item.id === photoId); if (!photo) return;
  photo.reasons = photo.reasons.includes(reason) ? photo.reasons.filter((item) => item !== reason) : [...photo.reasons, reason];
  saveTraining(photo); render();
}

function saveTraining(photo) {
  state.training[photo.stableKey] = { name: photo.name, userRating: photo.userRating, reasons: photo.reasons, userNote: photo.userNote, preference: photo.preference, updatedAt: Date.now() };
  localStorage.setItem(trainingStorageKey, JSON.stringify(state.training));
}

function render() {
  const scored = state.photos.filter((photo) => photo.overall);
  elements.uploadedCount.textContent = state.photos.length; elements.scoredCount.textContent = scored.length;
  const topPhoto = scored.toSorted((a, b) => (b.ceceScore ?? b.overall) - (a.ceceScore ?? a.overall))[0];
  const totalRedFlags = scored.reduce((sum, photo) => sum + (photo.redFlags?.filter((flag) => flag.key !== 'visionPending').length ?? 0), 0);
  elements.averageScore.textContent = scored.length ? `${Math.round(scored.reduce((sum, photo) => sum + photo.overall, 0) / scored.length)}/10` : '—';
  elements.likedCount.textContent = state.profile.likedPhotoIds.length; elements.redFlagCount.textContent = totalRedFlags;
  elements.trainingCount.textContent = Object.values(state.training).filter((item) => item.userRating || item.preference !== 'neutral').length;
  elements.topCeceScore.textContent = topPhoto ? `${topPhoto.ceceScore ?? topPhoto.overall}/10` : '—';
  elements.topCeceLabel.textContent = topPhoto ? `${topPhoto.name} currently has the strongest technical score.` : 'Upload photos to discover the strongest lead image.';
  elements.galleryHint.textContent = state.isScoring ? `${state.scoringDone}/${state.scoringTotal} scored` : state.photos.length ? `${state.photos.length} candidate${state.photos.length === 1 ? '' : 's'}` : 'Ready';
  elements.scoreButton.disabled = !state.photos.length || state.isScoring; elements.scoreButton.textContent = state.isScoring ? `Scoring ${state.scoringDone}/${state.scoringTotal}` : 'Score unscored';
  renderGallery(); renderDetail();
}

function renderGallery() {
  if (!state.photos.length) { elements.gallery.className = 'photo-grid empty-state'; elements.gallery.textContent = 'Drop in a full shoot or camera roll export to begin comparing candidates.'; return; }
  elements.gallery.className = 'photo-grid';
  elements.gallery.innerHTML = state.photos.map((photo) => `<button class="photo-tile ${photo.id === state.activeId ? 'active' : ''}" data-photo-id="${photo.id}"><img src="${photo.previewUrl}" alt="${escapeHtml(photo.name)}" loading="lazy"><span>${photo.userRating ? `You ${photo.userRating}` : photo.error ? 'Error' : photo.ceceScore ? `Cece ${photo.ceceScore}` : photo.overall ? `${photo.overall}/10` : 'Queued'}</span>${photo.redFlags?.filter((flag) => flag.key !== 'visionPending').length ? `<em>${photo.redFlags.filter((flag) => flag.key !== 'visionPending').length} flag${photo.redFlags.filter((flag) => flag.key !== 'visionPending').length === 1 ? '' : 's'}</em>` : ''}</button>`).join('');
  elements.gallery.querySelectorAll('[data-photo-id]').forEach((button) => button.addEventListener('click', () => { state.activeId = button.dataset.photoId; render(); }));
}

function renderDetail() {
  const photo = state.photos.find((item) => item.id === state.activeId) ?? state.photos[0];
  if (!photo) { elements.detailPanel.innerHTML = '<div class="empty-state">Select a photo to inspect scores and preference signals.</div>'; return; }
  if (photo.error) { elements.detailPanel.innerHTML = `<img class="detail-image" src="${photo.previewUrl}" alt="${escapeHtml(photo.name)}"><div class="empty-state">This image could not be scored: ${escapeHtml(photo.error)}</div>`; return; }
  const redFlags = photo.redFlags?.length ? photo.redFlags : [{ label: 'Pending scan', advice: 'Run scoring to surface technical publish-risk flags.' }];
  elements.detailPanel.innerHTML = `<img class="detail-image" src="${photo.previewUrl}" alt="${escapeHtml(photo.name)}"><div class="detail-header"><div><h2>${escapeHtml(photo.name)}</h2><p>${formatBytes(photo.size)}</p></div><strong>${photo.userRating ? `You ${photo.userRating}/10` : photo.ceceScore ? `Cece ${photo.ceceScore}/10` : photo.overall ? `${photo.overall}/10` : 'Not scored'}</strong></div>
  <section class="training-card"><h3>Teach the Cece Score</h3><p>Rate this photo the way you would personally judge it for posting.</p><div class="rating-buttons">${Array.from({ length: 10 }, (_, i) => i + 1).map((value) => `<button data-user-rating="${value}" class="${photo.userRating === value ? 'selected' : ''}">${value}</button>`).join('')}</div><div class="reason-chips">${reasonOptions.map((reason) => `<button data-reason="${escapeHtml(reason)}" class="${photo.reasons.includes(reason) ? 'selected' : ''}">${escapeHtml(reason)}</button>`).join('')}</div><label class="training-note">Why?<textarea id="trainingNote" placeholder="Example: I love the pose and social vibe, even though the lighting is dark.">${escapeHtml(photo.userNote)}</textarea></label></section>
  <div class="cece-card"><span>Current automated score</span><b>${photo.ceceScore ? `${photo.ceceScore}/10` : 'Pending'}</b><p>Technical screening only. Your rating above is the training truth for future vision calibration.</p></div><div class="score-list">${ratingCategories.map((category) => `<div class="score-row"><span>${category.label}</span><meter min="1" max="10" value="${photo.scores?.[category.key] ?? 1}"></meter><b>${photo.scores?.[category.key] ?? '—'}</b></div>`).join('')}</div><div class="red-flag-list"><h3>Red flags</h3>${redFlags.map((flag) => `<article><strong>${escapeHtml(flag.label)}</strong><p>${escapeHtml(flag.advice)}</p></article>`).join('')}</div><div class="preference-actions"><button class="${photo.preference === 'liked' ? 'selected' : ''}" data-pref="liked">Like</button><button class="${photo.preference === 'disliked' ? 'selected' : ''}" data-pref="disliked">Dislike</button><button class="${photo.preference === 'neutral' ? 'selected-muted' : ''}" data-pref="neutral">Neutral</button></div><ul class="notes">${(photo.aiNotes ?? ['Run scoring to generate conservative quality feedback.']).map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`;
  elements.detailPanel.querySelectorAll('[data-pref]').forEach((button) => button.addEventListener('click', () => updatePreference(photo.id, button.dataset.pref)));
  elements.detailPanel.querySelectorAll('[data-user-rating]').forEach((button) => button.addEventListener('click', () => updateTraining(photo.id, { userRating: Number(button.dataset.userRating) })));
  elements.detailPanel.querySelectorAll('[data-reason]').forEach((button) => button.addEventListener('click', () => toggleReason(photo.id, button.dataset.reason)));
  document.querySelector('#trainingNote')?.addEventListener('change', (event) => updateTraining(photo.id, { userNote: event.target.value.trim() }));
}

function tuneWeights(weights, photo, preference) { if (!photo?.scores || preference === 'neutral') return weights; const direction = preference === 'liked' ? 0.04 : -0.03; return Object.fromEntries(ratingCategories.map(({ key }) => [key, Math.max(0.6, Math.min(1.6, weights[key] + (photo.scores[key] - 5) * direction))])); }
function loadPreferenceProfile() { const stored = localStorage.getItem(preferenceStorageKey); if (!stored) return structuredClone(defaultPreferenceProfile); try { return { ...defaultPreferenceProfile, ...JSON.parse(stored) }; } catch { return structuredClone(defaultPreferenceProfile); } }
function loadTrainingExamples() { const stored = localStorage.getItem(trainingStorageKey); if (!stored) return {}; try { return JSON.parse(stored); } catch { return {}; } }
function formatBytes(bytes) { return `${(bytes / 1_000_000).toFixed(1)} MB`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }

render();