import fs from 'node:fs';

export async function loadDependency(name) {
  if (name !== 'playwright-core') throw new Error('Unexpected growth-worker dependency');
  return import('playwright-core');
}

export function browserPath(chromium) {
  const executable = process.env.AKALMESIN_CHROME_PATH || chromium.executablePath();
  if (!fs.existsSync(executable)) throw new Error('Chromium is missing. Run npx playwright-core install chromium, or set AKALMESIN_CHROME_PATH.');
  return executable;
}
