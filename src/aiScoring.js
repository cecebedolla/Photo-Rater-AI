export const ratingCategories = [
  { key: 'sharpness', label: 'Sharpness', prompt: 'Is the subject crisp without blur or compression artifacts?' },
  { key: 'lighting', label: 'Lighting', prompt: 'Is the exposure flattering, balanced, and free of harsh shadows?' },
  { key: 'composition', label: 'Composition', prompt: 'Is the framing intentional with a clean background and strong crop?' },
  { key: 'facialExpression', label: 'Expression', prompt: 'Does the face communicate approachable, authentic emotion?' },
  { key: 'eyeContact', label: 'Eye contact', prompt: 'Are the eyes visible, engaged, and directed effectively?' },
  { key: 'socialAppeal', label: 'Social appeal', prompt: 'Would this photo perform well on dating or social media profiles?' },
];

export const redFlagChecks = [
  { key: 'lowLight', label: 'Low light', trigger: ({ lighting }) => lighting <= 5, advice: 'Brighten the face or choose a cleaner natural-light frame.' },
  { key: 'softFocus', label: 'Soft focus', trigger: ({ sharpness }) => sharpness <= 5, advice: 'Avoid motion blur, heavy crop, or compressed screenshots.' },
  { key: 'messyCrop', label: 'Messy crop', trigger: ({ composition }) => composition <= 5, advice: 'Use a simpler background and keep the subject intentionally framed.' },
  { key: 'lowWarmth', label: 'Low warmth', trigger: ({ facialExpression, eyeContact }) => facialExpression <= 5 || eyeContact <= 5, advice: 'Pick a shot with clearer eyes and a more natural expression.' },
  { key: 'datingRisk', label: 'Weak profile lead', trigger: ({ socialAppeal }) => socialAppeal <= 5, advice: 'This is better as a backup than the first photo in a profile.' },
];

export const defaultPreferenceProfile = {
  version: 2,
  likedPhotoIds: [],
  dislikedPhotoIds: [],
  categoryWeights: Object.fromEntries(ratingCategories.map(({ key }) => [key, 1])),
  lastUpdated: Date.now(),
};

const clampScore = (score) => Math.max(1, Math.min(10, Math.round(score)));

const stableNoise = (seed, offset) => {
  let hash = 0;
  for (const char of `${seed}-${offset}`) {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  }
  return Math.abs(hash % 100) / 100;
};

export async function scorePhoto(photo, profile) {
  // Adapter seam: replace this deterministic mock with a backend call to a vision model.
  // The preference profile is already part of the contract for future personalized ranking.
  await new Promise((resolve) => window.setTimeout(resolve, 180 + stableNoise(photo.id, 99) * 260));

  const scores = Object.fromEntries(ratingCategories.map((category, index) => {
    const fileSizeSignal = Math.min(2.2, photo.size / 3_000_000);
    const recencySignal = stableNoise(photo.id, index + 20) > 0.78 ? 0.6 : 0;
    const preferenceWeight = (profile.categoryWeights[category.key] ?? 1) - 1;
    return [category.key, clampScore(4.7 + stableNoise(photo.name, index) * 4.2 + fileSizeSignal + recencySignal + preferenceWeight)];
  }));

  const weightedTotal = ratingCategories.reduce((total, category) => total + scores[category.key] * (profile.categoryWeights[category.key] ?? 1), 0);
  const weightTotal = ratingCategories.reduce((total, category) => total + (profile.categoryWeights[category.key] ?? 1), 0);
  const overall = clampScore(weightedTotal / weightTotal);
  const redFlags = buildRedFlags(scores);
  const ceceScore = buildCeceScore(overall, scores, redFlags.length);

  return { scores, overall, ceceScore, redFlags, aiNotes: buildNotes(scores, overall, ceceScore, redFlags) };
}

function buildCeceScore(overall, scores, redFlagCount) {
  const confidenceBoost = (scores.eyeContact + scores.facialExpression + scores.socialAppeal) / 3 - 6;
  const penalty = redFlagCount * 0.45;
  return clampScore(overall + confidenceBoost * 0.6 - penalty);
}

function buildRedFlags(scores) {
  return redFlagChecks
    .filter((check) => check.trigger(scores))
    .map(({ key, label, advice }) => ({ key, label, advice }));
}

function buildNotes(scores, overall, ceceScore, redFlags) {
  const strongest = ratingCategories.reduce((best, category) => (scores[category.key] > scores[best.key] ? category : best));
  const weakest = ratingCategories.reduce((worst, category) => (scores[category.key] < scores[worst.key] ? category : worst));
  const redFlagSummary = redFlags.length ? `${redFlags.length} red flag${redFlags.length === 1 ? '' : 's'} to review before publishing.` : 'No major red flags detected for this mock rubric.';
  return [
    `Cece Score ${ceceScore}/10 with an overall rubric score of ${overall}/10.`,
    `${strongest.label} is the strongest signal at ${scores[strongest.key]}/10.`,
    `Improve ${weakest.label.toLowerCase()} first; it scored ${scores[weakest.key]}/10.`,
    redFlagSummary,
  ];
}
