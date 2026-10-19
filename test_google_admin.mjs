import {chromium} from 'playwright';
async function run(){
  const r = await fetch('http://localhost:5000/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'admin@velora.com',password:'Admin@123'})});
  const j = await r.json();
  const token = j.data?.token;
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:5173/login?token='+token);
  try{ await page.waitForFunction(()=>!location.pathname.startsWith('/login'),null,{timeout:10000}); }catch(e){}
  console.log(page.url());
  await ctx.close(); await b.close();
}
run();

