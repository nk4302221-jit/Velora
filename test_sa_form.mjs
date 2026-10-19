import {chromium} from 'playwright';
async function run(){
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/login');
  await page.waitForSelector('#login-identifier');
  await page.fill('#login-identifier','superadmin@velora.com');
  await page.fill('#login-password','SuperAdmin@123');
  await page.click('#login-submit-btn');
  try{ await page.waitForNavigation({timeout:10000}); }catch(e){}
  console.log(page.url());
  await ctx.close(); await b.close();
}
run();

