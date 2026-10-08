// Runs a browser QA script against a running dev server (npm run dev).
//   node tests/run.mjs tests/touch-qa.mjs
// Env: QA_URL (default http://127.0.0.1:47321/), CHROME (path to Chrome/Chromium).
import { chromium } from 'playwright-core';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const script = process.argv[2];
if (!script) {
  console.error('usage: node tests/run.mjs <qa-script.mjs>');
  process.exit(2);
}
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/local/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const results = [];
const origLog = console.log;
console.log = (...a) => {
  const line = a.join(' ');
  if (/^(PASS|FAIL) /.test(line)) results.push(line.startsWith('PASS'));
  origLog(...a);
};
try {
  await (await import(pathToFileURL(resolve(script)).href)).default(browser);
} finally {
  await browser.close();
}
process.exit(results.length && results.every(Boolean) ? 0 : 1);
