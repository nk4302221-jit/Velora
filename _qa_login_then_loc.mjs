export default async function run(page, ui) {
  // If not logged in, login
  const loggedOut = await page.$('#nav-login-btn');
  if (loggedOut) {
    await page.goto('http://localhost:5173/login');
    await page.waitForSelector('#email-input', { timeout: 5000 });
    await page.fill('#email-input', 'customer@shopvanguard.com');
    await page.fill('#password-input', 'Customer@123');
    await page.click('#login-btn');
    try {
      await page.waitForNavigation({ timeout: 8000 });
    } catch {}
    await page.waitForTimeout(500);
  } else {
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(500);
  }

  const before = await page.evaluate(() => ({
    url: location.pathname,
    loggedIn: !document.querySelector('#nav-login-btn'),
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
