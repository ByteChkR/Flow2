import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {serveDemo} from '../scripts/demo.mjs';
test('Installed packages: general documents and local Flow editor work without Adam',async()=>{
 const server=await serveDemo(0);let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  assert.deepEqual(errors,[]);await page.getByRole('textbox',{name:'Notiz',exact:true}).fill('Gespeichert aus einem unabhängigen Paket');
  assert.equal(await page.evaluate(()=>window.demoEditor.hasChanges()),true);
  await page.getByRole('button',{name:'Speichern',exact:true}).click();
  await page.waitForFunction(()=>!window.demoEditor.hasChanges());
  await page.reload();assert.equal(await page.getByRole('textbox',{name:'Notiz',exact:true}).inputValue(),'Gespeichert aus einem unabhängigen Paket');
  await page.getByRole('tab',{name:/Lokale Berechnung/}).click();
  await page.getByRole('application',{name:'Flow-Graph'}).waitFor();
  await page.getByRole('button',{name:'▷ Ausführen',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Flow ausführen'});
  await dialog.getByRole('combobox',{name:/Ausführung/}).selectOption('local');
  await dialog.getByRole('button',{name:'Ausführen',exact:true}).click();
  await page.getByText('Abgeschlossen',{exact:true}).first().waitFor();
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
