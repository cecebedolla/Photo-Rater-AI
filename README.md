# Photo Rater AI

A polished, mobile-first photo-rating app for uploading batches of profile photos, previewing them in a responsive gallery, and applying a strict AI-style 1–10 scoring rubric.

## Features

- Bulk image upload with `multiple` file selection for large camera-roll batches.
- Responsive gallery optimized for mobile first and expanded tablet/desktop grids.
- Strict scoring categories: sharpness, lighting, composition, facial expression, eye contact, and social media appeal.
- Cece Score UI that highlights the best lead-photo candidate with a profile-first weighted score.
- Red flag review for low light, soft focus, messy crop, low warmth, and weak profile-lead risk.
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
