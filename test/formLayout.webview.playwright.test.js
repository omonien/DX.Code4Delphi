'use strict';

/**
 * Browser-level tests for the Form Layout webview HTML/JS.
 * These exercise the real DOM (filter, overlay editor, selection chrome).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { buildWebviewPage } = require('./helpers/webviewHarness.js');

const DFM = `
object Form1: TForm1
  Left = 0
  Top = 0
  ClientWidth = 220
  ClientHeight = 80
  Caption = 'ELKE - '#220'bersicht'
  object Label1: TLabel
    Left = 8
    Top = 8
    Width = 200
    Height = 13
    Caption = 'J'#228'nner'
  end
  object Label2: TLabel
    Left = 8
    Top = 24
    Width = 200
    Height = 13
    Caption = 'l'#246'schen'
  end
  object Label3: TLabel
    Left = 8
    Top = 40
    Width = 200
    Height = 13
    Caption = 'au'#223'erhalb'
  end
  object Button1: TButton
    Left = 8
    Top = 56
    Width = 75
    Height = 25
    Caption = 'N'#228'chster >'
  end
end
`;

/** @type {import('playwright').Browser} */
let browser;

before(async () => {
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
});

async function openPage(dfm = DFM, opts = {}) {
  const { html, view } = buildWebviewPage(dfm, opts);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  // Give inline script a tick
  await page.waitForTimeout(50);
  return { page, view, html, errors };
}

describe('Form Layout webview (Playwright)', () => {
  test('filter "labe" shows Label1/2/3 and hides Button1', async () => {
    const { page, errors } = await openPage();
    assert.equal(errors.length, 0, 'page errors: ' + errors.join('; '));

    // Sanity: tree rendered
    await page.waitForSelector('.c4d-tree-label');
    const before = await page.locator('.c4d-tree-item').count();
    assert.ok(before >= 5, 'expected full tree');

    await page.fill('#tree-filter', 'labe');
    await page.waitForTimeout(30);

    // Direct child row only — nested labels under a visible parent must not count
    const rowLabel = '.c4d-tree-item:not(.c4d-tree-item-hidden) > .c4d-tree-row > .c4d-tree-label';
    const visibleLabels = await page.locator(rowLabel).allTextContents();
    assert.ok(visibleLabels.some((t) => t.includes('Label1')), 'Label1 visible for "labe", got: ' + JSON.stringify(visibleLabels));
    assert.ok(visibleLabels.some((t) => t.includes('Label2')), 'Label2 visible');
    assert.ok(visibleLabels.some((t) => t.includes('Form1')), 'Form1 ancestor visible');
    assert.ok(!visibleLabels.some((t) => t.includes('Button1')), 'Button1 hidden');

    // Class-based check on the Button1 li itself (not the Form1 ancestor)
    const buttonHidden = await page
      .locator('.c4d-tree-item[data-tree-id="Form1::Button1"]')
      .evaluate((el) => el.classList.contains('c4d-tree-item-hidden'));
    assert.equal(buttonHidden, true);

    await page.close();
  });

  test('filter "form" shows Form1', async () => {
    const { page } = await openPage();
    await page.fill('#tree-filter', 'form');
    await page.waitForTimeout(30);
    const rowLabel = '.c4d-tree-item:not(.c4d-tree-item-hidden) > .c4d-tree-row > .c4d-tree-label';
    const visibleLabels = await page.locator(rowLabel).allTextContents();
    assert.ok(visibleLabels.some((t) => t.includes('Form1')));
    await page.close();
  });

  test('ellipsis button opens extended editor overlay', async () => {
    const { page, errors } = await openPage();
    assert.equal(errors.length, 0, 'page errors: ' + errors.join('; '));

    // Select Form1 in tree
    await page.locator('.c4d-tree-item > .c4d-tree-row', { hasText: 'Form1' }).click();
    await page.waitForSelector('.c4d-prop-value');

    // Click Caption value cell
    const captionRow = page.locator('tr', { has: page.locator('.c4d-prop-name', { hasText: 'Caption' }) });
    await captionRow.locator('.c4d-prop-value').click();
    await page.waitForSelector('.c4d-prop-edit');

    // Click … — must open overlay (mousedown must not commit/destroy editor first)
    await page.locator('.c4d-prop-expand').click();
    await page.waitForSelector('.c4d-overlay', { timeout: 2000 });
    const overlayVisible = await page.locator('.c4d-overlay').isVisible();
    assert.equal(overlayVisible, true, 'extended editor overlay must be visible');
    await page.waitForSelector('.c4d-overlay-textarea');
    await page.close();
  });

  test('extended editor preserves newlines in setProp message as #13#10 intent', async () => {
    const { page, errors } = await openPage(`
object Form1: TForm1
  Caption = 'Hi'
  object Label1: TLabel
    Caption = 'Old'
  end
end
`);
    assert.equal(errors.length, 0, 'page errors: ' + errors.join('; '));

    await page.locator('.c4d-tree-item > .c4d-tree-row', { hasText: 'Label1' }).click();
    await page.waitForSelector('.c4d-prop-value');

    const captionRow = page.locator('tr', { has: page.locator('.c4d-prop-name', { hasText: 'Caption' }) });
    await captionRow.locator('.c4d-prop-value').click();
    await page.waitForSelector('.c4d-prop-edit');
    await page.locator('.c4d-prop-expand').click();
    await page.waitForSelector('.c4d-overlay-textarea');

    // Type two lines in the extended editor
    await page.fill('.c4d-overlay-textarea', 'Line1\nLine2');
    await page.locator('.c4d-overlay-buttons button', { hasText: 'OK' }).click();
    await page.waitForTimeout(50);

    const msgs = await page.evaluate(() => window.__msgs || []);
    const setProp = msgs.filter((m) => m && m.type === 'setProp').pop();
    assert.ok(setProp, 'setProp message must be posted, msgs=' + JSON.stringify(msgs));
    assert.equal(setProp.propName, 'Caption');
    assert.equal(setProp.nodeId, 'Form1::Label1');
    // Newlines must survive (not collapsed to Line1Line2)
    assert.ok(
      setProp.value === 'Line1\nLine2' || setProp.value === 'Line1\r\nLine2',
      'expected newline in value, got ' + JSON.stringify(setProp.value)
    );
    await page.close();
  });

  test('selection chrome remains when HTML is rebuilt with selectedId', async () => {
    // Simulates host refresh after setProp: new HTML carries selectedId
    const { page } = await openPage(DFM, { selectedId: 'Form1::Label1' });
    await page.waitForSelector('.c4d-tree-row.c4d-tree-selected');
    const selectedLabel = await page.locator('.c4d-tree-row.c4d-tree-selected .c4d-tree-label').textContent();
    assert.equal(selectedLabel && selectedLabel.trim(), 'Label1');

    const boxSelected = await page.locator('.c4d-box.c4d-selected').count();
    assert.ok(boxSelected >= 1, 'at least one box marked selected');

    const subtitle = await page.locator('#inspector-subtitle').textContent();
    assert.match(subtitle || '', /Label1/);
    await page.close();
  });
});
