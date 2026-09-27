export default async function run(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`.slice(0, 200)));

  try {
    await page.waitForSelector('#use-current-location-btn', { timeout: 45000 });
  } catch (e) {
    return { fatal: 'button never rendered', errors: errors.slice(0, 4) };
  }

  const results = [];
  const t = (n, a, e) => results.push({ name: n, actual: a, expected: e, pass: a === e });

  t('stub installed', await page.evaluate(() => Boolean(window.google?.maps?.Geocoder)), true);

  const fireMap = (la, ln) =>
    page.evaluate(
      ([a, b]) => {
        const hs = window.__listeners.click || [];
        hs.forEach((h) => h({ latLng: { lat: () => a, lng: () => b } }));
        return hs.length;
      },
      [la, ln]
    );
  t('map click listener registered', (await fireMap(0, 0)) > 0, true);

  // Current Location, three rapid clicks.
  await page.evaluate(() => { window.__geocodeCalls = []; });
  await page.click('#use-current-location-btn');
  await page.click('#use-current-location-btn');
  await page.click('#use-current-location-btn');
  await page.waitForTimeout(1500);
  t('3 rapid clicks -> 1 geocode call', await page.evaluate(() => window.__geocodeCalls.length), 1);

  const f = await page.evaluate(() => JSON.parse(document.getElementById('out').textContent));
  t('street auto-filled', f.addressLine1, '12 Test Road');
  t('city auto-filled', f.city, 'Test City');
  t('state auto-filled', f.state, 'Test State');
  t('postal auto-filled', f.postalCode, '110001');

  // Same coordinates again: skipped.
  await page.evaluate(() => { window.__geocodeCalls = []; });
  await page.click('#use-current-location-btn');
  await page.waitForTimeout(1200);
  t('same coords -> 0 extra calls', await page.evaluate(() => window.__geocodeCalls.length), 0);

  // Map click on a new point.
  await page.evaluate(() => { window.__geocodeCalls = []; });
  await fireMap(19.076, 72.8777);
  await page.waitForTimeout(1500);
  const c = await page.evaluate(() => window.__geocodeCalls);
  t('map click -> 1 geocode call', c.length, 1);
  t('map click used clicked coords', c[0]?.lat, 19.076);

  return { results, errors: errors.slice(0, 4) };
}
