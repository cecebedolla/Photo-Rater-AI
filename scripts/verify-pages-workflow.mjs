import { existsSync, readFileSync } from 'node:fs';

const workflowPath = '.github/workflows/pages.yml';
if (!existsSync(workflowPath)) {
  throw new Error(`${workflowPath} is missing. Merge a PR containing this file into the default branch before looking for it in GitHub Actions.`);
}

const workflow = readFileSync(workflowPath, 'utf8');
for (const required of ['actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4', 'pull_request:', 'branches: [main]']) {
  if (!workflow.includes(required)) {
    throw new Error(`${workflowPath} is missing required deployment configuration: ${required}`);
  }
}

console.log(`${workflowPath} is present and configured for PR validation plus main-branch Pages deployment.`);
