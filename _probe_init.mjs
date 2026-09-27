export default async function run(page) {
  await page.addInitScript('window.__initRan = true;');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  return {
    hasInitScript: await page.evaluate(() => Boolean(window.__initRan)),
    initScriptType: await page.evaluate(() => typeof window.__initRan),
    rootHtml: await page.evaluate(() => document.getElementById('root')?.innerHTML?.slice(0, 120) ?? 'NO ROOT'),
    hasReact: await page.evaluate(() => typeof window.React),
  };
}
