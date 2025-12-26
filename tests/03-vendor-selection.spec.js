// @ts-check
const { test, expect } = require('@playwright/test');
const { expectedVendors } = require('./test-data');

test.describe('Vendor Selection Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('all vendors from Excel are present', async ({ page }) => {
    const options = await page.locator('#vendor option').all();
    // Skip first empty option
    for (let i = 1; i < options.length; i++) {
      const text = await options[i].textContent();
      const matchingVendor = expectedVendors.find(v => text.includes(v.vendorName.replace(/\s+/g, ' ').trim()));
      expect(matchingVendor).toBeDefined();
    }
  });

  test('selecting first vendor sets emergency contact correctly', async ({ page }) => {
    await page.selectOption('#vendor', '0');
    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBe(expectedVendors[0].emergencyContact);
  });

  test('selecting second vendor sets emergency contact correctly', async ({ page }) => {
    await page.selectOption('#vendor', '1');
    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBe(expectedVendors[1].emergencyContact);
  });

  test('selecting third vendor sets emergency contact correctly', async ({ page }) => {
    await page.selectOption('#vendor', '2');
    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBe(expectedVendors[2].emergencyContact);
  });

  test('selecting fourth vendor sets emergency contact correctly', async ({ page }) => {
    await page.selectOption('#vendor', '3');
    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBe(expectedVendors[3].emergencyContact);
  });

  test('emergency contact is cleared when vendor is unselected', async ({ page }) => {
    await page.selectOption('#vendor', '0');
    await page.selectOption('#vendor', '');
    const emergencyContact = await page.locator('#emergencyContact').inputValue();
    expect(emergencyContact).toBe('');
  });

  test('emergency contact field is readonly', async ({ page }) => {
    const emergencyContactField = page.locator('#emergencyContact');
    await expect(emergencyContactField).toHaveAttribute('readonly');
  });
});
