import test from 'node:test';
import assert from 'node:assert/strict';
import {errorPage} from '../src/dashboard/error-page.ts';
import {DiscordUserRequestError} from '../src/dashboard/discord.ts';
test('standalone error pages escape messages and provide safe recovery navigation',()=>{
 const page=errorPage(404,'<script>alert(1)</script>');
 assert.match(page,/Sayfa bulunamadı/);assert.match(page,/&lt;script&gt;/);assert.doesNotMatch(page,/<script>alert/);assert.match(page,/href="\/dashboard"/);assert.match(page,/noindex/);
 assert.match(errorPage(401,'expired'),/href="\/auth\/login"/);
 assert.match(errorPage(502,'temporary','abcd12345678'),/abcd12345678/);
});
test('Discord failures expose typed recovery status without token contents',()=>{
 const error=new DiscordUserRequestError(429,'Bekle');assert.equal(error.status,429);assert.equal(error.name,'DiscordUserRequestError');assert.equal(error.message,'Bekle');
});

test('Discord user API authentication and rate limits retain distinct recovery statuses',async t=>{
 const {createDiscordService}=await import('../src/dashboard/discord.ts');
 const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 for(const [status,expected] of [[401,401],[403,401],[429,429],[503,502]]){
  globalThis.fetch=async()=>new Response('{}',{status});
  const discord=createDiscordService({},'test-only');
  await assert.rejects(()=>discord.getGuilds('test-only'),error=>error instanceof DiscordUserRequestError&&error.status===expected);
 }
});
