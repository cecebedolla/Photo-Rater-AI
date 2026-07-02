# Photo Rater AI

A mobile-first foundation for uploading large batches of photos, previewing them in a responsive gallery, and applying a strict AI-style 1–10 scoring rubric for social media readiness.

## Features

- Bulk image upload with `multiple` file selection for large camera-roll batches.
- Responsive gallery optimized for mobile first and expanded tablet/desktop grids.
- Strict scoring categories: sharpness, lighting, composition, facial expression, eye contact, and social media appeal.
- AI adapter boundary in `src/aiScoring.js` so mock scoring can be replaced with a server-side vision model call.
- Preference profile storage for liked/disliked photos, designed to evolve into personalized ranking or model fine-tuning.
- GitHub Pages deployment workflow that publishes the static `dist/` build from `main`.

## Getting started

```bash
npm run dev
```

The dev server binds to `0.0.0.0:5173` so hosted workspaces can expose the port for phone testing.

## Production check

```bash
npm run build
```

The build validates required app shell elements, checks JavaScript syntax, and writes a deployable static site to `dist/`.

## Public preview deployment

This repo includes `.github/workflows/pages.yml` for GitHub Pages. Merge the PR that contains this workflow into `main`; GitHub Actions will continue to show **Get started with GitHub Actions** until a workflow file exists on the default branch. After merge, enable **Settings → Pages → Source → GitHub Actions** if it is not already enabled. The workflow will publish the app to:

```text
https://<github-owner>.github.io/<repo-name>/
```

Because assets are referenced relatively, the app works both at the repository root and under a GitHub Pages project path.


### Verifying the workflow after merge

1. Merge the PR containing `.github/workflows/pages.yml` into `main`.
2. Open the repository on GitHub and confirm `.github/workflows/pages.yml` is visible on the `main` branch.
3. Open **Actions**; the workflow named **Deploy static preview to GitHub Pages** should appear instead of the starter screen.
4. Open **Settings → Pages** and confirm the source is **GitHub Actions**.
