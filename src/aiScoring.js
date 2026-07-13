export const ratingCategories = [
  { key: 'sharpness', label: 'Sharpness' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'composition', label: 'Composition' },
  { key: 'facialExpression', label: 'Expression' },
  { key: 'eyeContact', label: 'Eye contact' },
  { key: 'socialAppeal', label: 'Social appeal' },
];

export const defaultPreferenceProfile = {
  version: 3,
  likedPhotoIds: [],
  dislikedPhotoIds: [],
  categoryWeights: Object.fromEntries(ratingCategories.map(({ key }) => [key, 1])),
  lastUpdated: Date.now(),
};

const clamp = (value, min = 1, max = 10) => Math.max(min, Math.min(max, value));
const score = (value) => Math.round(clamp(value));

export async function scorePhoto(photo) {
  const metrics = await analyzeImage(photo.previewUrl);

  const sharpness = score(scale(metrics.edgeStrength, 5, 34, 1, 8));
  const exposureBase = 10 - Math.abs(metrics.meanLuma - 145) / 17;
  const contrastAdjustment = scale(metrics.lumaStdDev, 18, 58, -2, 1.5);
  const clippingPenalty = metrics.highlightClip * 24 + metrics.shadowClip * 15;
  const lighting = score(exposureBase + contrastAdjustment - clippingPenalty);

  // These are intentionally conservative until a real vision model can identify
  // the subject, face, expression, eye contact, posing, and background clutter.
  const composition = score(3.5 + Math.min(2, metrics.megapixels / 3) + Math.min(1, metrics.lumaStdDev / 55));
  const facialExpression = 4;
  const eyeContact = 4;

  const criticalFlags = [];
  if (sharpness <= 3) criticalFlags.push(flag('softFocus', 'Blur or soft focus', 'The image lacks enough crisp detail for a strong social post.'));
  if (lighting <= 3) criticalFlags.push(flag('poorLighting', 'Poor or uneven lighting', 'Exposure, shadows, or blown highlights substantially reduce the photo quality.'));
  if (metrics.highlightClip >= 0.08) criticalFlags.push(flag('blownHighlights', 'Distracting blown highlights', 'A large bright area or flare is pulling attention away from the people.'));
  if (metrics.shadowClip >= 0.22) criticalFlags.push(flag('deepShadows', 'Heavy shadow detail loss', 'Important parts of the image are too dark to read cleanly.'));
  if (metrics.megapixels < 0.7) criticalFlags.push(flag('lowResolution', 'Low resolution', 'The image may appear soft or compressed when posted.'));

  let socialAppeal = score((sharpness * 0.4) + (lighting * 0.4) + (composition * 0.2) - criticalFlags.length * 0.8);
  let overall = score((sharpness * 0.28) + (lighting * 0.28) + (composition * 0.20) + (facialExpression * 0.08) + (eyeContact * 0.06) + (socialAppeal * 0.10));

  // Hard gates prevent technically poor photos from receiving flattering 8–10 scores.
  if (criticalFlags.length >= 2) overall = Math.min(overall, 4);
  if (sharpness <= 2 || lighting <= 2) overall = Math.min(overall, 3);
  socialAppeal = Math.min(socialAppeal, overall + 1);

  // Until real face/pose analysis is connected, reserve the top tier.
  overall = Math.min(overall, 7);
  const ceceScore = Math.min(overall, 7);

  const scores = { sharpness, lighting, composition, facialExpression, eyeContact, socialAppeal };
  const limitations = flag('visionPending', 'Personal appearance review still needed', 'This version measures image quality locally but cannot yet judge facial expression, posing, body position, or whether Cece looks flattering.');
  const redFlags = [...criticalFlags, limitations];

  return {
    scores,
    overall,
    ceceScore,
    redFlags,
    aiNotes: buildNotes(scores, overall, criticalFlags, metrics),
  };
}

function flag(key, label, advice) { return { key, label, advice }; }

function buildNotes(scores, overall, criticalFlags, metrics) {
  return [
    `Conservative quality score: ${overall}/10. Scores of 8–10 are disabled until real vision analysis is connected.`,
    `Measured locally: sharpness ${scores.sharpness}/10, lighting ${scores.lighting}/10, and technical composition ${scores.composition}/10.`,
    criticalFlags.length ? `${criticalFlags.length} technical deal breaker${criticalFlags.length === 1 ? '' : 's'} capped this result.` : 'No major technical deal breaker was detected.',
    `Image sample: ${metrics.width}×${metrics.height}; expression, eye contact, posing, and flattering appearance were not automatically judged.`,
  ];
}

async function analyzeImage(url) {
  const image = await loadImage(url);
  const maxSide = 256;
  const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * ratio));
  const height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, width, height);
  const data = context.getImageData(0, 0, width, height).data;
  const luma = new Float32Array(width * height);
  let sum = 0;
  let sumSquares = 0;
  let highlights = 0;
  let shadows = 0;

  for (let pixel = 0, index = 0; pixel < luma.length; pixel += 1, index += 4) {
    const value = data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
    luma[pixel] = value;
    sum += value;
    sumSquares += value * value;
    if (value >= 245) highlights += 1;
    if (value <= 18) shadows += 1;
  }

  let edgeTotal = 0;
  let edgeCount = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const current = luma[y * width + x];
      edgeTotal += Math.abs(current - luma[y * width + x - 1]);
      edgeTotal += Math.abs(current - luma[(y - 1) * width + x]);
      edgeCount += 2;
    }
  }

  const meanLuma = sum / luma.length;
  return {
    width: image.naturalWidth,
    height: image.naturalHeight,
    megapixels: image.naturalWidth * image.naturalHeight / 1_000_000,
    meanLuma,
    lumaStdDev: Math.sqrt(Math.max(0, sumSquares / luma.length - meanLuma * meanLuma)),
    highlightClip: highlights / luma.length,
    shadowClip: shadows / luma.length,
    edgeStrength: edgeCount ? edgeTotal / edgeCount : 0,
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = url;
  });
}

function scale(value, inMin, inMax, outMin, outMax) {
  const normalized = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + normalized * (outMax - outMin);
}
