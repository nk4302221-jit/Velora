export default async function run(page, ui) {
  const before = await page.evaluate(() => ({
    url: location.pathname,
    userArea: document.querySelector('#nav-login-btn') ? 'logged-out' : 'logged-in',
  }));

  await page.click('#header-location');
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const toastRoot = document.querySelector('#toast-notification-root');
    const toasts = toastRoot ? Array.from(toastRoot.querySelectorAll('.toast')) : [];
    return {
      url: location.pathname,
      toastCount: toasts.length,
      toastText: toasts.map((t) => t.innerText.trim()),
      toastType: toasts.map((t) => t.className),
    };
  });

  return { before, after };
}
