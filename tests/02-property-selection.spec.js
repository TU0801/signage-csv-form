// @ts-check
const { test, expect } = require('@playwright/test');
const { setupAuthMock } = require('./test-helpers');
const { expectedProperties, getUniquePropertyCodes } = require('./test-data');

test.describe('Property Selection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuthMock(page, '/', { isAuthenticated: true });
  });

  test('selecting property code 2010 shows 7 terminal options', async ({ page }) => {
    await page.selectOption('#property', '2010');
    const terminalOptions = await page.locator('#terminal option').all();
    // 7 terminals + 1 default option
    expect(terminalOptions.length).toBe(8);
  });

  test('terminal options include supplement info for property 2010', async ({ page }) => {
    await page.selectOption('#property', '2010');
    const terminalText = await page.locator('#terminal').textContent();
    expect(terminalText).toContain('センター棟');
    expect(terminalText).toContain('Ａ棟');
    expect(terminalText).toContain('Ｂ棟');
  });

  test('first terminal is auto-selected when property is selected', async ({ page }) => {
    await page.selectOption('#property', '2010');
    const selectedTerminal = await page.locator('#terminal').inputValue();
    expect(selectedTerminal).toBe('h0001A00');
  });

  test('selecting property code 120406 shows 1 terminal option', async ({ page }) => {
    await page.selectOption('#property', '120406');
    const terminalOptions = await page.locator('#terminal option').all();
    // 1 terminal + 1 default option
    expect(terminalOptions.length).toBe(2);
  });

  test('terminal select is cleared when property is unselected', async ({ page }) => {
    await page.selectOption('#property', '2010');
    await page.selectOption('#property', '');
    const terminalOptions = await page.locator('#terminal option').all();
    expect(terminalOptions.length).toBe(1);
  });

  test('all unique property codes from Excel are present', async ({ page }) => {
    const uniqueProperties = getUniquePropertyCodes();
    for (const prop of uniqueProperties) {
      const option = page.locator(`#property option[value="${prop.propertyCode}"]`);
      await expect(option).toBeAttached();
    }
  });

  test('property options contain property name', async ({ page }) => {
    const firstProperty = getUniquePropertyCodes()[0];
    const optionText = await page.locator(`#property option[value="${firstProperty.propertyCode}"]`).textContent();
    expect(optionText).toContain(firstProperty.propertyName);
  });
});
