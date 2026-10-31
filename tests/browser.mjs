import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../src/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const dir = mkdtempSync(join(tmpdir(),'rg-browser-'));
const app = createApp({dataDir:dir,demo:true});
await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${app.server.address().port}`;
const out=resolve('artifacts');mkdirSync(out,{recursive:true});
let browser;
const errors=[];
try {
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const op=await browser.newContext({viewport:{width:1440,height:1000}});
  const screen=await browser.newContext({viewport:{width:1920,height:1080}});
  const page=await op.newPage(), tv=await screen.newPage();
  for(const p of [page,tv])p.on('pageerror',err=>errors.push(err.message));
  page.setDefaultTimeout(7000);
  await page.goto(base+'/admin');
  await page.locator('[name=username]').fill('operador');await page.locator('[name=password]').fill('kart-demo-2026');
  await page.locator('#login-form button').click();await page.locator('[data-action=formation]').first().waitFor();
  await page.locator('[data-action=formation]').first().click();
  const inputs=page.locator('dialog [name=pilot]');
  for(let i=3;i<await inputs.count();i++)await inputs.nth(i).uncheck();
  await page.locator('dialog button[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.locator('[data-action=prepare]').click();await page.locator('dialog button[type=submit]').click();
  await page.locator('[data-action=start]').waitFor();
  await tv.goto(base+'/tv');await tv.locator('.current-kart').waitFor();
  await page.locator('[data-action=start]').click();await page.locator('[data-action=request-current]').waitFor();
  await page.locator('[data-action=request-current]').click();
  await page.locator('.request-list li').first().waitFor();
  await page.locator('[data-action=pause]').click();await page.locator('[data-action=resume]').waitFor();
  await tv.waitForFunction(()=>document.querySelector('.stage-status')?.textContent.includes('pausado'));
  assert.equal(await page.locator('.current-kart').innerText(),await tv.locator('.current-kart').innerText());
  assert.equal(await tv.locator('.draw-queue li').count(),3);
  assert.equal(await tv.locator('[data-action=manage-swap]').count(),0);
  await page.screenshot({path:join(out,'rg-racing-gestao.png'),fullPage:true});
  await tv.screenshot({path:join(out,'rg-racing-tv.png'),fullPage:true});
  const landing=await screen.newPage();landing.on('pageerror',err=>errors.push(err.message));
  await landing.goto(base+'/');await landing.locator('.hero').waitFor();await landing.screenshot({path:join(out,'rg-racing-portal.png'),fullPage:true});
  await page.locator('[data-action=resume]').click();
  await page.locator('[data-action=start-swaps]').waitFor({timeout:22000});
  // Authorize a second swap after the initial draw has already closed its windows.
  const internal=await (await op.request.get(base+'/api/admin/state')).json();
  const h=internal.heats[0], pending=h.draw.requests[0].pilotId;
  const late=h.pilotIds.find(id=>id!==pending);
  await page.locator(`[data-action=manage-swap][data-pilot="${late}"]`).click();
  await page.locator('dialog [name=reason]').fill('Falha identificada após o prazo');
  await page.locator('dialog button[type=submit]').click();await page.locator('dialog').waitFor({state:'hidden'});
  await page.locator('[data-action=start-swaps]').click();
  await page.locator('[data-action=on-track]').waitFor({timeout:17000});
  const state=await (await op.request.get(base+'/api/admin/state')).json();
  assert.equal(state.heats[0].draw.requests.filter(r=>r.status==='fulfilled').length,2);
  assert.equal(new Set(Object.values(state.heats[0].draw.assignments)).size,3);
  await page.locator('[data-action=on-track]').click();await page.locator('dialog button[type=submit]').click();
  await page.locator('dialog').waitFor({state:'hidden'});
  await page.locator('[data-view=results]').click();await page.locator('[data-action=finish]').click();
  await page.locator('#results-form').waitFor();
  const rows=page.locator('[data-result-pilot]');
  for(let i=0;i<3;i++){await rows.nth(i).locator('[name=position]').fill(String(i+1));await rows.nth(i).locator('[name=points]').fill(String(35-i*5));}
  await page.locator('#results-form button[type=submit]').click();
  await landing.goto(base+'/ranking');await landing.locator('.ranking-table').waitFor();
  assert.equal(await landing.locator('.total').first().innerText(),'35');
  // Touch layouts must fit the viewport; wide tables scroll within their own container.
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const m=await mobile.newPage();m.on('pageerror',err=>errors.push(err.message));
  for(const path of ['/','/tv','/cronograma','/ranking','/piloto','/karts']){
    await m.goto(base+path);await m.locator('main').waitFor();
    const size=await m.evaluate(()=>({doc:document.documentElement.scrollWidth,window:innerWidth}));
    assert.ok(size.doc<=size.window+1,`${path} horizontal overflow: ${JSON.stringify(size)}`);
  }
  await m.goto(base+'/');await m.locator('.hero').waitFor();await m.screenshot({path:join(out,'rg-racing-celular.png'),fullPage:true});
  await screen.setOffline(true);await tv.locator('.connection.offline').first().waitFor({timeout:6000});
  await screen.setOffline(false);await tv.locator('.connection:not(.offline)').first().waitFor({timeout:7000});
  assert.deepEqual(errors,[]);
  console.log('Browser OK: gestão + TV sincronizadas, trocas na janela e tardias, resultados, reconexão e 6 páginas mobile.');
  console.log('Capturas em artifacts/.');
} finally {await browser?.close();app.close();rmSync(dir,{recursive:true,force:true});}
