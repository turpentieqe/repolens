import { test, expect } from '@playwright/test';

test('loads a complete graph locally without browser errors', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const nonLocal: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:4180')) nonLocal.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('.graph-node')).toHaveCount(25);
  await expect(page.getByText('2 circular dependency groups', { exact: true })).toBeVisible();
  await expect(page.locator('.stat-value').first()).toHaveText('25');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('repolens-desktop.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(nonLocal).toEqual([]);
});

test('selects graph nodes and follows incoming and outgoing dependencies', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Inspect src/app/Dashboard.tsx', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Module details' })).toBeVisible();
  await expect(page.locator('.module-profile h2')).toHaveText('Dashboard.tsx');
  await expect(page.locator('.dependency-list > button')).toHaveCount(6);
  await page.locator('.detail-tabs').getByRole('button', { name: 'Imported by' }).click();
  await expect(page.locator('.dependency-list > button')).toHaveCount(1);
  await page
    .locator('.dependency-list')
    .getByRole('button', { name: /main.tsx/ })
    .click();
  await expect(page.locator('.module-profile h2')).toHaveText('main.tsx');
  await page.getByRole('button', { name: 'Close module details' }).click();
  await expect(page.getByRole('complementary', { name: 'Project insights' })).toBeVisible();
});

test('filters cycles, folders, entry candidates and handles empty search', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'In a cycle', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(4);
  await page.getByRole('button', { name: 'Entry candidates', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(2);
  await page.getByRole('button', { name: 'All modules', exact: true }).click();
  await page.getByLabel('Filter by folder').selectOption('services');
  await expect(page.locator('.graph-node')).toHaveCount(4);
  await page.getByLabel('Search modules').fill('no-such-module-zz');
  await expect(page.locator('.graph-node')).toHaveCount(0);
  await expect(page.getByText('No modules in this view')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(25);
  await page.getByLabel('Search modules').fill('UTILS');
  await expect(page.locator('.graph-node')).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.graph-node')).toHaveCount(25);
});

test('supports zoom, reset, drag and keyboard selection', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.graph-node')).toHaveCount(25);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.locator('.graph-controls')).toContainText('125%');
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect(page.locator('.graph-controls')).toContainText('100%');
  const node = page.getByRole('button', { name: 'Inspect src/lib/utils.ts', exact: true });
  const before = await node.getAttribute('transform');
  const bounds = await node.boundingBox();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 10);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2 + 35, bounds!.y + 45, { steps: 5 });
  await page.mouse.up();
  await expect(node).not.toHaveAttribute('transform', before!);
  await page.getByRole('button', { name: 'Reset graph view' }).click();
  await expect(node).toHaveAttribute('transform', before!);
  await node.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.module-profile h2')).toHaveText('utils.ts');
  await page.getByRole('button', { name: 'Focus selected module' }).click();
  await expect(page.locator('.graph-controls')).toContainText('160%');
  await page.keyboard.press('/');
  await expect(page.getByLabel('Search modules')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'Project insights' })).toBeVisible();
});

test('module table, export and rescan work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Modules', exact: true }).click();
  await expect(page.locator('.module-table tbody tr')).toHaveCount(25);
  await expect(page.locator('.module-table tbody tr').first()).toContainText('utils.ts');
  await page.locator('.module-table').getByRole('button', { name: 'Lines', exact: true }).click();
  const rows = await page
    .locator('.module-table tbody tr')
    .evaluateAll((rows) => rows.map((row) => Number(row.lastElementChild?.textContent)));
  expect(rows).toEqual([...rows].sort((a, b) => b - a));
  await page
    .locator('.module-table')
    .getByRole('button', { name: /constellations.ts/ })
    .click();
  await expect(page.getByText('No internal imports. A self-contained module.')).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('orbit-dashboard-repolens.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString()).nodes).toHaveLength(25);
  const refreshed = page.waitForResponse(
    (response) => response.url().endsWith('/api/refresh') && response.status() === 200,
  );
  await page.getByRole('button', { name: 'Rescan project' }).click();
  await refreshed;
  await expect(page.getByRole('button', { name: 'Rescan project' })).toBeEnabled();
  await expect(page.locator('.module-table tbody tr')).toHaveCount(25);
});

test('shows empty project and recovers from API failure', async ({ page }) => {
  await page.route('**/api/graph', (route) =>
    route.fulfill({ status: 500, json: { error: 'Temporary scan failure' } }),
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Temporary scan failure');
  await page.unroute('**/api/graph');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(25);
  await page.route('**/api/graph', async (route) => {
    const response = await route.fetch();
    const graph = await response.json();
    await route.fulfill({ json: { ...graph, nodes: [], edges: [], cycles: [] } });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A blank canvas' })).toBeVisible();
  await expect(page.getByText('No cycles. Nice and clear.')).toBeVisible();
});

test('about dialog is keyboard accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'About & shortcuts' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close help' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'About & shortcuts' })).toBeFocused();
});

test('remains usable at mobile width without horizontal overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.graph-node')).toHaveCount(25);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Inspect src/lib/utils.ts', exact: true }).click();
  await expect(page.locator('.module-profile h2')).toHaveText('utils.ts');
  const panel = await page.locator('.inspector').boundingBox();
  const footer = await page.locator('.explorer-footer').boundingBox();
  expect(footer!.y).toBeGreaterThanOrEqual(panel!.y + panel!.height - 1);
  await page.screenshot({ path: testInfo.outputPath('repolens-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'In a cycle', exact: true }).click();
  await expect(page.locator('.graph-node')).toHaveCount(4);
});
