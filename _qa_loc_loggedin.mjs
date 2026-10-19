export default async function run(page, ui) {
  await page.goto('http://localhost:5173/login');
  await page.waitForSelector('#email-input');
  await page.fill('#email-input', 'customer@shopvanguard.com');
  await page.fill('#password-input', 'Customer@123');
  await page.click('#login-btn');
  await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const before = await page.evaluate(() => ({
    url: location.pathname,
    user: document.querySelector('#nav-login-btn') ? 'logged-out' : 'has-user',
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
    };
  });

  return { before, after };
}
