#!/usr/bin/env node
// Keep the editorial pipeline on Node 20+; only this optional worker uses SQLite.
if (Number(process.versions.node.split('.')[0]) < 24) {
  process.stderr.write('The Instagram growth worker requires Node 24 or newer. Use nvm use 24 (or an equivalent Node 24 installation).\n');
  process.exitCode = 1;
} else {
  const {main} = await import('./instagram-growth/cli.mjs');
  await main().catch(error => {
    process.stderr.write(`${error.code || 'ERROR'}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
