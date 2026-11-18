import { test,expect } from '@playwright/test';
import { browserToken } from './fixture.js';
async function connect(page){
 await page.goto('/');await page.locator('#token').fill(browserToken);await page.locator('#refresh').click();
 await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
}
async function register(page,name){
 await page.locator('#register input').fill(name);await page.locator('#register button').click();
 await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
 const row=page.locator('#players tbody tr').filter({hasText:name});await expect(row).toHaveCount(1);
 return Number(await row.locator('td').nth(1).textContent());
}
async function queue(page,id){
 await page.locator('#queue-form input').fill(String(id));await page.locator('#queue-form button[value=join]').click();
 await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
}
async function availability(page,id,action,expected='Saved / refreshed.'){
 await page.locator('#player-status input').fill(String(id));await page.locator(`#player-status button[value=${action}]`).click();
 await expect(page.locator('#status')).toHaveText(expected);
}

test('operator previews a pair, creates a match and records its rating result',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await connect(page);
 const name='<img src=x onerror=alert(1)>',a=await register(page,name),b=await register(page,'Browser Beta');
 await expect(page.locator('#players img')).toHaveCount(0);
 await queue(page,a);await queue(page,b);await page.locator('#preview-matches').click();
 await expect(page.locator('#status')).toHaveText('Preview: 1 compatible pair(s). No matches created.');
 await expect(page.locator('#preview tbody tr')).toHaveCount(1);await expect(page.locator('#queue tbody tr')).toHaveCount(2);
 await expect(page.locator('#matches tbody tr')).toHaveCount(0);
 await page.locator('#make').click();await expect(page.locator('#status')).toHaveText('Created 1 match(es).');
 await expect(page.locator('#preview tbody tr')).toHaveCount(0);await expect(page.locator('#queue tbody tr')).toHaveCount(0);
 const row=page.locator('#matches tbody tr').first(),id=await row.locator('td').first().textContent();
 await page.locator('#result input[name=matchId]').fill(id);await page.locator('#result input[name=winnerId]').fill(String(a));
 await page.locator('#result button[value=result]').click();await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
 await expect(page.locator('#players tbody tr').filter({hasText:name}).locator('td').nth(3)).toHaveText('1016');
 await expect(page.locator('#matches tbody tr').first()).toContainText('completed');expect(errors).toEqual([]);
});

test('availability preserves history and refuses deactivation during a pending match',async({page})=>{
 await connect(page);const a=await register(page,'Availability Alpha'),b=await register(page,'Availability Beta');
 await queue(page,a);await queue(page,b);await page.locator('#make').click();await expect(page.locator('#status')).toHaveText('Created 1 match(es).');
 await availability(page,a,'deactivate','Finish or cancel the active match before deactivating this player.');
 const match=page.locator('#matches tbody tr').filter({hasText:'Availability Alpha'});
 await page.locator('#result input[name=matchId]').fill(await match.locator('td').first().textContent());
 await page.locator('#result button[value=cancel]').click();await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
 await queue(page,a);await availability(page,a,'deactivate');
 await expect(page.locator('#inactive tbody tr').filter({hasText:'Availability Alpha'})).toHaveCount(1);
 await expect(page.locator('#queue tbody tr')).toHaveCount(0);
 await availability(page,a,'restore');await expect(page.locator('#players tbody tr').filter({hasText:'Availability Alpha'})).toHaveCount(1);
 await page.locator('#history input').fill(String(a));await page.locator('#history button').click();
 await expect(page.locator('#status')).toHaveText('Saved / refreshed.');await expect(page.locator('#history-output')).toContainText('cancelled');
});

test('authentication feedback and mobile layout remain usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#token').fill('wrong');await page.locator('#refresh').click();
 await expect(page.locator('#status')).toHaveText('A valid bearer token is required.');
 await page.locator('#token').fill(browserToken);await page.locator('#refresh').click();await expect(page.locator('#status')).toHaveText('Saved / refreshed.');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
