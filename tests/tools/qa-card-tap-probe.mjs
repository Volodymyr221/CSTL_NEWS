// Разова проба: чи тап по АВАТАРУ в картці списку питань відкриває ДВОЄ?
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';
const t0 = Date.now() - 5*864e5;
const POSTS=[{id:801,type:'chat',text:'Коли вивозять сміття?',title:null,author:'Олена',
  owner_uid:'u-olena',status:'published',location:null,tags:[],ts:t0,
  created_at:new Date(t0).toISOString(),published_at:new Date(t0).toISOString()}];
const {url,stop}=await serve(); const b=await launch(chromium);
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
const p=await ctx.newPage();
await mockSupabase(p,{posts:POSTS,comments:[],announcements:[],reactions:[],saved_posts:[]},{user:{id:'u-me',name:'Я'}});
await p.route('**://api.open-meteo.com/**',r=>r.abort());
await p.goto(url,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500);
await p.evaluate(()=>document.querySelector('.consent-accept')?.click()); await p.waitForTimeout(300);
await p.evaluate(()=>window.switchTab&&window.switchTab('discussions')); await p.waitForTimeout(1200);
await p.evaluate(()=>document.querySelector('#disc-content .qa-card-ava [data-av-uid]')?.click());
await p.waitForTimeout(1000);
const r=await p.evaluate(()=>({
  карткаПрофілю: !!document.querySelector('[class*="pcard"]'),
  екранПитання:  !!document.querySelector('.qa-screen'),
}));
console.log('тап по АВАТАРУ в картці списку →', JSON.stringify(r));
await b.close(); await stop();
