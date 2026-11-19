import { test as base, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createApp } from '../src/app.js';
import { browserToken } from './fixture.js';

export const test = base.extend({
  league: async ({}, use) => {
    const directory = mkdtempSync(join(tmpdir(), 'league-browser-')), store = openStore(join(directory, 'app.sqlite'));
    const server = createApp(store, browserToken);
    try {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      await use({ store, url: `http://127.0.0.1:${server.address().port}` });
    } finally {
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
  baseURL: async ({ league }, use) => use(league.url),
});
export { expect };
