export const ratingCategories = [
  { key: 'sharpness', label: 'Sharpness', prompt: 'Is the subject crisp without blur or compression artifacts?' },
  { key: 'lighting', label: 'Lighting', prompt: 'Is the exposure flattering, balanced, and free of harsh shadows?' },
  { key: 'composition', label: 'Composition', prompt: 'Is the framing intentional with a clean background and strong crop?' },
  { key: 'facialExpression', label: 'Expression', prompt: 'Does the face communicate approachable, authentic emotion?' },
  { key: 'eyeContact', label: 'Eye contact', prompt: 'Are the eyes visible, engaged, and directed effectively?' },
  { key: 'socialAppeal', label: 'Social appeal', prompt: 'Would this photo perform well on dating or social media profiles?' },
];

export const defaultPreferenceProfile = {
  version: 1,
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
    const preferenceWeight = profile.categoryWeights[category.key] - 1;
    return [category.key, clampScore(5 + stableNoise(photo.name, index) * 4 + fileSizeSignal + preferenceWeight)];
  }));

  const weightedTotal = ratingCategories.reduce((total, category) => total + scores[category.key] * profile.categoryWeights[category.key], 0);
  const weightTotal = ratingCategories.reduce((total, category) => total + profile.categoryWeights[category.key], 0);
  const overall = clampScore(weightedTotal / weightTotal);

  return { scores, overall, aiNotes: buildNotes(scores, overall) };
}

function buildNotes(scores, overall) {
  const strongest = ratingCategories.reduce((best, category) => (scores[category.key] > scores[best.key] ? category : best));
  const weakest = ratingCategories.reduce((worst, category) => (scores[category.key] < scores[worst.key] ? category : worst));
  return [
    `Overall ${overall}/10 on a strict social-media-ready scale.`,
    `${strongest.label} is the strongest signal at ${scores[strongest.key]}/10.`,
    `Improve ${weakest.label.toLowerCase()} first; it scored ${scores[weakest.key]}/10.`,
  ];
}
