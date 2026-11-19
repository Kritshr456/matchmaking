import { test, expect } from './browser.js';
import { browserToken } from './fixture.js';

async function connect(page) {
  await page.goto('/'); await page.getByLabel('Operator API token').fill(browserToken);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Connected to your league.');
}
async function nav(page, view) { await page.locator(`[data-view=${view}]`).click(); }
async function register(page, name) {
  await nav(page, 'players'); await page.locator('#register input').fill(name);
  await page.getByRole('button', { name: 'Register player', exact: true }).click();
  await expect(page.locator('#status')).toContainText(`Registered ${name} as player #`);
  const row = page.locator('#players tbody tr').filter({ hasText: name }); await expect(row).toHaveCount(1);
  return Number(await row.locator('td').nth(1).textContent());
}
async function queue(page, id) {
  await nav(page, 'queue'); await page.locator('#queue-form input').fill(String(id));
  await page.locator('#queue-form button[value=join]').click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
}
async function make(page) {
  await page.locator('#make').click(); await expect(page.locator('#status')).toHaveText('Created 1 match(es).');
  await expect(page.locator('#view-matches')).toBeVisible();
}
async function saveResult(page, winner) {
  await page.locator('#result-winner').selectOption(winner === null ? 'draw' : String(winner));
  await page.getByRole('button', { name: 'Save result', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Result recorded. Ratings and standings updated.');
}

// Fixtures are generated in isolated temporary databases; no production credentials are used.
test('league console supports preview, result entry, metrics and real player profiles', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await connect(page);
  const name = '<img src=x onerror=alert(1)>', a = await register(page, name), b = await register(page, 'Harbor');
  await expect(page.locator('#players img')).toHaveCount(0);
  await queue(page, a); await queue(page, b); await page.locator('#preview-matches').click();
  await expect(page.locator('#status')).toHaveText('Preview: 1 compatible pair(s). No matches created.');
  await expect(page.locator('#preview tbody tr')).toHaveCount(1); await expect(page.locator('#queue tbody tr')).toHaveCount(2);
  await make(page); await saveResult(page, a);
  await nav(page, 'overview');
  await expect(page.locator('#metrics .metric').nth(2).locator('strong')).toHaveText('0');
  await expect(page.locator('#metrics .metric').nth(3).locator('strong')).toHaveText('1');
  await nav(page, 'players'); await page.locator('#clear-player-filters').click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  const winner = page.locator('#players tbody tr').filter({ hasText: name }); await expect(winner.locator('td').nth(3)).toHaveText('1016');
  await page.getByRole('button', { name: `View ${name}`, exact: true }).click(); await expect(page.locator('#profile-dialog')).toBeVisible();
  await expect(page.locator('#profile-content')).toContainText('Lifetime: 1 W / 0 L / 0 D');
  await expect(page.locator('#profile-content svg')).toHaveCount(1); await expect(page.locator('#profile-content img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close profile' }).click();
  await nav(page, 'matches'); await page.locator('#match-status').selectOption('completed');
  await page.getByRole('button', { name: 'Apply match filters' }).click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  await page.locator('#matches').getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('#match-content')).toContainText('+16 / -16');
  expect(errors).toEqual([]);
});

test('closing a season preserves archived rankings, inactive flags and lifetime history', async ({ page }) => {
  await connect(page); const a = await register(page, 'Cedar'), b = await register(page, 'Northstar');
  await queue(page, a); await queue(page, b); await make(page); await saveResult(page, a);
  await nav(page, 'players'); await page.locator('#player-status input').fill(String(b));
  await page.locator('#player-status button[value=deactivate]').click(); await expect(page.locator('#status')).toContainText('Northstar is inactive');
  await nav(page, 'seasons'); await page.locator('#new-season input').fill('Winter ladder');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Archive and start season' }).click();
  await expect(page.locator('#status')).toHaveText('Started Winter ladder. Previous standings archived.');
  await nav(page, 'players'); await page.locator('#player-season').selectOption('1'); await page.locator('#include-inactive').check();
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  await expect(page.locator('#players tbody tr').filter({ hasText: 'Cedar' }).locator('td').nth(3)).toHaveText('1016');
  await expect(page.getByRole('button', { name: 'Register player', exact: true })).toBeDisabled();
  await page.locator('#player-season').selectOption('current'); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  const inactive = page.locator('#players tbody tr').filter({ hasText: 'Northstar' }); await expect(inactive).toContainText('inactive');
  await expect(inactive.locator('td').nth(3)).toHaveText('1000');
  await page.getByRole('button', { name: 'View Northstar', exact: true }).click();
  await expect(page.locator('#profile-content')).toContainText('Season: 0 W / 0 L / 0 D. Lifetime: 0 W / 1 L / 0 D.');
  await expect(page.locator('#profile-content')).toContainText('Season 1'); await page.getByRole('button', { name: 'Close profile' }).click();
  await nav(page, 'matches'); await page.locator('#match-season').selectOption('all');
  await page.getByRole('button', { name: 'Apply match filters' }).click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  await expect(page.locator('#matches tbody tr')).toHaveCount(1); await expect(page.locator('#matches')).toContainText('Season 1');
  await expect(page.locator('#result-section')).toBeHidden();
});

test('standings support older pages, literal wildcard searches and safe empty states', async ({ page, league }) => {
  for (let n = 0; n < 25; n++) league.store.register(n === 23 ? 'Literal_% player' : `Roster ${String(n).padStart(2, '0')}`);
  await connect(page); await nav(page, 'players'); await expect(page.locator('#players tbody tr')).toHaveCount(20);
  await page.getByRole('button', { name: 'Next players' }).click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  await expect(page.locator('#players tbody tr')).toHaveCount(5); await expect(page.locator('#players tbody tr').first().locator('td').first()).toHaveText('21');
  await page.locator('#player-search').fill('_%'); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Saved / refreshed.'); await expect(page.locator('#players tbody tr')).toHaveCount(1);
  await expect(page.locator('#players tbody tr').first().locator('td').first()).toHaveText('24');
  await page.locator('#player-search').fill("' OR 1=1 --"); await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Saved / refreshed.'); await expect(page.locator('#players')).toHaveText('No players match these filters.');
});

test('match history combines player, outcome and season filters across multiple pages', async ({ page, league }) => {
  const s = league.store, a = s.register('History A'), b = s.register('History B');
  for (let n = 0; n < 22; n++) { s.join(a.id); s.join(b.id); s.result(s.make()[0].id, null); }
  s.startSeason('Second season', 1); s.join(a.id); s.join(b.id); s.make();
  await connect(page); await nav(page, 'matches'); await page.locator('#match-season').selectOption('all');
  await page.getByRole('button', { name: 'Apply match filters' }).click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  await expect(page.locator('#matches tbody tr')).toHaveCount(20); await page.getByRole('button', { name: 'Next matches' }).click();
  await expect(page.locator('#status')).toHaveText('Saved / refreshed.'); await expect(page.locator('#matches tbody tr')).toHaveCount(3);
  await page.locator('#match-season').selectOption('1'); await page.locator('#match-status').selectOption('completed'); await page.locator('#match-player').fill(String(a.id));
  await page.getByRole('button', { name: 'Apply match filters' }).click(); await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
  await expect(page.locator('#match-total')).toHaveText('22 matches'); await expect(page.locator('#result-section')).toBeHidden();
});

test('rollover controls block queued players and stale rollover forms cannot reset a newer season', async ({ page, league }) => {
  const p = league.store.register('Waiting player'); league.store.join(p.id);
  await connect(page); await nav(page, 'seasons'); await expect(page.getByRole('button', { name: 'Archive and start season' })).toBeDisabled();
  await nav(page, 'queue'); await page.locator('#queue-form input').fill(String(p.id)); await page.locator('#queue-form button[value=leave]').click();
  await expect(page.locator('#status')).toHaveText('Saved / refreshed.'); await nav(page, 'seasons'); await page.locator('#new-season input').fill('Stale attempt');
  const response = await page.request.post('/api/seasons', { headers: { Authorization: `Bearer ${browserToken}` }, data: { name: 'Other organizer', expectedSeasonId: 1 } });
  expect(response.status()).toBe(200); page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Archive and start season' }).click();
  await expect(page.locator('#status')).toHaveText('The active season changed. Refresh before starting another season.');
  expect(league.store.seasons()).toHaveLength(2);
});

test('availability workflow protects pending matches and preserves history', async ({ page }) => {
  await connect(page); const a = await register(page, 'Available A'), b = await register(page, 'Available B');
  await queue(page, a); await queue(page, b); await make(page); await nav(page, 'players');
  await page.locator('#player-status input').fill(String(a)); await page.locator('#player-status button[value=deactivate]').click();
  await expect(page.locator('#status')).toHaveText('Finish or cancel the active match before deactivating this player.');
  await nav(page, 'matches'); page.once('dialog', dialog => dialog.accept()); await page.locator('#cancel-match').click();
  await expect(page.locator('#status')).toHaveText('Match cancelled. Ratings were not changed.');
  await nav(page, 'players'); await page.locator('#player-status input').fill(String(a)); await page.locator('#player-status button[value=deactivate]').click();
  await expect(page.locator('#status')).toContainText('Available A is inactive');
  await page.locator('#player-status button[value=restore]').click(); await expect(page.locator('#status')).toContainText('Available A is active');
  await page.locator('#profile-lookup input').fill(String(a)); await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.locator('#profile-content')).toContainText('cancelled');
});

test('mobile access, authentication feedback and disconnect clear sensitive page data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/'); await page.locator('#token').fill('wrong');
  await page.getByRole('button', { name: 'Connect', exact: true }).click(); await expect(page.locator('#status')).toHaveText('A valid bearer token is required.');
  await page.locator('#token').fill(browserToken); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Connected to your league.'); await expect(page.locator('#token')).toHaveValue('');
  await register(page, 'Private mobile player'); await page.getByRole('button', { name: 'View Private mobile player', exact: true }).click();
  await expect(page.locator('#profile-dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close profile' }).click(); await nav(page, 'overview');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#disconnect').click(); await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('body')).not.toContainText('Private mobile player'); await expect(page.locator('#token')).toHaveValue('');
});
