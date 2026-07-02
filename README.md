# Photo Rater AI

A mobile-first foundation for uploading large batches of photos, previewing them in a responsive gallery, and applying a strict AI-style 1–10 scoring rubric for social media readiness.

## Features

- Bulk image upload with `multiple` file selection for large camera-roll batches.
- Responsive gallery optimized for mobile first and expanded tablet/desktop grids.
- Strict scoring categories: sharpness, lighting, composition, facial expression, eye contact, and social media appeal.
- AI adapter boundary in `src/aiScoring.js` so mock scoring can be replaced with a server-side vision model call.
- Preference profile storage for liked/disliked photos, designed to evolve into personalized ranking or model fine-tuning.

## Getting started

```bash
npm run dev
```

## Production check

```bash
npm run build
```
