const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..');
const harness=path.join(root,'scripts/test-game-e2e.cjs');
const files=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);

// The local browser E2E replaces authentication only inside its own esbuild bundle.
test('app, Pages build and game server never reference the local E2E fixture or test identities',()=>{
  const shipped=[...files(path.join(root,'apps/mobile/src')),...['App.tsx','index.ts','app.config.ts'].map(f=>path.join(root,'apps/mobile',f)),
    path.join(root,'scripts/build-pages.cjs'),...files(path.join(root,'apps/server/src'))].filter(f=>/\.(tsx?|cjs|js)$/.test(f));
  assert.ok(shipped.length>20);
  for(const file of shipped){
    const source=fs.readFileSync(file,'utf8');
    assert.ok(!/game-e2e-fixture|__friendsTableE2E|test-game-e2e|test\/browser/.test(source),path.relative(root,file));
  }
});
test('E2E harness is loopback-only, uses per-run tokens and refuses deployed environments',()=>{
  const source=fs.readFileSync(harness,'utf8');
  assert.match(source,/const HOST = '127\.0\.0\.1';/);assert.match(source,/server\.listen\(0, HOST/);
  assert.match(source,/crypto\.randomBytes\(24\)/);assert.match(source,/byToken\.get\(token\)/);
  assert.ok(!/supabase\.co|railway\.app|pages\.dev|SUPABASE_URL|accountAuthorizer/i.test(source),'no remote service or real authorizer');
  for(const env of [{NODE_ENV:'production'},{RAILWAY_ENVIRONMENT:'production'},{CF_PAGES:'1'}]){
    const run=spawnSync(process.execPath,[harness],{env:{...process.env,NODE_ENV:'',...env},encoding:'utf8',timeout:20000});
    assert.notEqual(run.status,0);assert.match(run.stderr,/refuses to run in a deployed environment/);
  }
});
