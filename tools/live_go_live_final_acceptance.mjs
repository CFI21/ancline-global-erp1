import {existsSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const WEB_URL=(process.env.WEB_URL||'https://ancline-web-live.onrender.com').replace(/\/$/,'');
const API_URL=(process.env.API_URL||'https://ancline-api-staging.onrender.com').replace(/\/$/,'');
const EXPECTED_WEB_COMMIT=(process.env.EXPECTED_WEB_COMMIT||'').trim();
const EXPECTED_API_COMMIT=(process.env.EXPECTED_API_COMMIT||'').trim();
const EXPECTED_WEB_DIGEST=(process.env.EXPECTED_WEB_DIGEST||'').trim();
const EXPECTED_API_DIGEST=(process.env.EXPECTED_API_DIGEST||'').trim();

const report={
  schema:'ANCLINE_ECOM_GO_LIVE_FINAL_ACCEPTANCE_V1',
  startedAt:new Date().toISOString(),
  candidate:{webCommit:EXPECTED_WEB_COMMIT,apiCommit:EXPECTED_API_COMMIT,webDigest:EXPECTED_WEB_DIGEST,apiDigest:EXPECTED_API_DIGEST},
  checks:{},
  blockers:[],
  status:'RUNNING'
};
const blockers=report.blockers;
const block=(code,detail)=>{if(!blockers.some(x=>x.code===code&&x.detail===detail))blockers.push({code,detail});};
const pass=(name,data={})=>report.checks[name]={status:'PASS',...data};
const fail=(name,data={})=>report.checks[name]={status:'FAIL',...data};
async function getJson(url,opt={}){
  const r=await fetch(url,opt);
  const raw=await r.text();
  let body=null;try{body=raw?JSON.parse(raw):null}catch{body=raw}
  return {ok:r.ok,status:r.status,body,headers:r.headers};
}
async function api(path,opt={}){
  const headers={Accept:'application/json',...(opt.headers||{})};
  if(opt.token)headers.Authorization='Bearer '+opt.token;
  if(opt.body!==undefined)headers['Content-Type']='application/json';
  return getJson(API_URL+'/api'+path,{method:opt.method||'GET',headers,body:opt.body===undefined?undefined:JSON.stringify(opt.body)});
}
async function web(path,opt={}){return getJson(WEB_URL+path,opt);}

try{
  if(!EXPECTED_WEB_COMMIT||!EXPECTED_API_COMMIT||!EXPECTED_WEB_DIGEST||!EXPECTED_API_DIGEST){
    block('DIGEST_FREEZE_INCOMPLETE','Approved Web/API commit and digest values were not fully resolved.');
  } else pass('digestFreeze',{immutable:true});

  const [wh,ah,proxy]=await Promise.all([web('/release-info'),api('/health'),web('/api-proxy/health')]);
  if(!wh.ok||!ah.ok||!proxy.ok){
    fail('runtimeIdentity',{webStatus:wh.status,apiStatus:ah.status,proxyStatus:proxy.status});
    block('RUNTIME_UNAVAILABLE','Web/API identity endpoints are not all reachable.');
  }else{
    const webCommit=String(wh.body?.buildCommit||'');
    const apiCommit=String(ah.body?.buildCommit||'');
    const proxyCommit=String(proxy.body?.buildCommit||'');
    const identityOk=webCommit===EXPECTED_WEB_COMMIT&&apiCommit===EXPECTED_API_COMMIT&&proxyCommit===EXPECTED_API_COMMIT;
    report.checks.runtimeIdentity={status:identityOk?'PASS':'FAIL',webCommit,apiCommit,proxyCommit,runtimeRole:ah.body?.runtimeRole||null,deploymentTier:ah.body?.deploymentTier||null};
    if(!identityOk)block('RUNTIME_DIGEST_DRIFT','Live runtime commit identity does not match the frozen approved candidate.');
    const productionTier=String(ah.body?.deploymentTier||'').toLowerCase()==='production';
    const productionRole=!String(ah.body?.runtimeRole||'').toLowerCase().includes('staging');
    report.checks.productionRuntime={status:productionTier&&productionRole?'PASS':'FAIL',deploymentTier:ah.body?.deploymentTier||null,runtimeRole:ah.body?.runtimeRole||null};
    if(!productionTier||!productionRole)block('PRODUCTION_RUNTIME_NOT_SEPARATED','Current API identifies itself as staging/non-production rather than a dedicated production runtime.');
  }

  const diag=await api('/diagnostics/staging-readiness');
  if(diag.ok){
    report.checks.runtimeConfiguration={status:diag.body?.pass===true?'PASS':'FAIL',environment:diag.body?.environment||null,checks:diag.body?.checks||[]};
    for(const c of diag.body?.checks||[])if(!c.pass)block('MISSING_RUNTIME_CONFIG',String(c.name));
  }else{
    fail('runtimeConfiguration',{httpStatus:diag.status});
    block('RUNTIME_CONFIG_UNVERIFIED','Runtime diagnostic configuration endpoint could not be verified.');
  }

  const [oidcConfig,oidcValidate]=await Promise.all([api('/auth/oidc/configuration'),api('/auth/oidc/validate')]);
  if(oidcConfig.ok&&oidcValidate.ok){
    const secure=oidcConfig.body?.configured===true&&oidcConfig.body?.devLoginAllowed===false&&Boolean(oidcConfig.body?.authorizationEndpoint)&&oidcValidate.body?.ok===true;
    report.checks.identityProvider={status:secure?'PASS':'FAIL',configured:Boolean(oidcConfig.body?.configured),devLoginAllowed:Boolean(oidcConfig.body?.devLoginAllowed),discoveryReady:Boolean(oidcConfig.body?.authorizationEndpoint),missing:oidcValidate.body?.missing||[]};
    if(!secure)block('PRODUCTION_IDENTITY_NOT_READY','OIDC discovery/configuration is incomplete or transitional email-only login remains enabled.');
  }else{
    fail('identityProvider',{configurationHttp:oidcConfig.status,validationHttp:oidcValidate.status});
    block('PRODUCTION_IDENTITY_UNVERIFIED','OIDC production identity configuration could not be verified.');
  }

  let token=(process.env.GO_LIVE_TEST_BEARER||'').trim();
  let authSource=token?'PROVIDED_BEARER':null;
  if(!token){
    const login=await api('/auth/login',{method:'POST',body:{email:'test.admin@ancline.invalid',role:'GLOBAL_ADMIN'}});
    if(login.ok&&login.body?.accessToken){token=login.body.accessToken;authSource=login.body?.authSource||'TRANSITIONAL';}
  }
  report.checks.smokeAuthentication={status:token?'PASS':'FAIL',source:authSource};
  if(!token)block('SMOKE_AUTH_UNAVAILABLE','No controlled admin/service bearer was available for authenticated go-live smoke.');

  if(token){
    const readiness=await api('/global-commerce/readiness',{token});
    if(readiness.ok){
      report.checks.globalCommerceReadiness={status:readiness.body?.ready===true?'PASS':'FAIL',summary:readiness.body?.summary||{},infrastructure:readiness.body?.infrastructure||{},blockers:readiness.body?.blockers||[]};
      for(const item of readiness.body?.blockers||[])block('GLOBAL_COMMERCE_BLOCKER',String(item));
    }else{
      fail('globalCommerceReadiness',{httpStatus:readiness.status});
      block('GLOBAL_COMMERCE_UNVERIFIED','Global commerce production readiness could not be verified.');
    }

    const uat=await api('/uat/run',{token,method:'POST',body:{cleanup:true}});
    const uatPass=uat.ok&&uat.body?.status==='PASS';
    report.checks.businessCriticalSmoke={status:uatPass?'PASS':'FAIL',httpStatus:uat.status,runId:uat.body?.runId||null,summary:uat.body?.summary||null,cleanup:uat.body?.cleanup!==false};
    if(!uatPass)block('BUSINESS_CRITICAL_SMOKE_FAILED','Synthetic cleanup-enabled end-to-end UAT did not pass during the go-live gate.');
  }

  const evidence=await api('/release/evidence');
  if(evidence.ok){
    const evPass=evidence.body?.ready===true&&evidence.body?.uat?.status==='PASS'&&evidence.body?.backup?.status==='PASS';
    report.checks.releaseEvidence={status:evPass?'PASS':'FAIL',deploymentTier:evidence.body?.deploymentTier||null,releaseCommit:evidence.body?.releaseCommit||null,uat:evidence.body?.uat||null,backup:evidence.body?.backup||null};
    if(!evPass)block('RELEASE_EVIDENCE_INCOMPLETE','Current runtime does not have both PASS UAT and PASS backup evidence.');
  }else{
    fail('releaseEvidence',{httpStatus:evidence.status});
    block('RELEASE_EVIDENCE_UNAVAILABLE','Release evidence endpoint could not be read.');
  }

  const migrationsDir=resolve('packages/db/prisma/migrations');
  const migrationDirs=existsSync(migrationsDir)?readdirSync(migrationsDir,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name):[];
  const migrationSql=migrationDirs.filter(d=>existsSync(resolve(migrationsDir,d,'migration.sql')));
  const deployRunner=existsSync(resolve('infra/scripts/production_migrate.sh'));
  const migrationVersioned=migrationSql.length>0&&deployRunner;
  report.checks.migrationControl={status:migrationVersioned?'PASS':'FAIL',migrationDirectories:migrationDirs,migrationsWithSql:migrationSql,productionDeployRunner:deployRunner};
  if(!migrationVersioned)block('DB_MIGRATION_BASELINE_MISSING','Versioned Prisma migration SQL and production migrate-deploy control are required.');

  const migrationDrillPath=resolve('infra/go-live/migration-drill.json');
  let migrationDrill=null;
  if(existsSync(migrationDrillPath)){try{migrationDrill=JSON.parse(readFileSync(migrationDrillPath,'utf8'));}catch{}}
  const migrationDrillReady=migrationDrill?.status==='PASS'&&Boolean(migrationDrill?.testedAt)&&Boolean(migrationDrill?.databaseTarget);
  report.checks.migrationDeployDrill={status:migrationDrillReady?'PASS':'FAIL',evidence:migrationDrillReady?migrationDrill:null};
  if(!migrationDrillReady)block('DB_MIGRATION_DEPLOY_NOT_PROVEN','Committed migrations have not yet been proven with migrate deploy on a controlled disposable/production-like database.');

  const restoreEvidencePath=resolve('infra/go-live/restore-drill.json');
  let restore=null;
  if(existsSync(restoreEvidencePath)){try{restore=JSON.parse(readFileSync(restoreEvidencePath,'utf8'));}catch{}}
  const restoreReady=restore?.status==='PASS'&&Boolean(restore?.testedAt)&&Boolean(restore?.backupSha256);
  report.checks.databaseRestoreDrill={status:restoreReady?'PASS':'FAIL',evidence:restoreReady?{testedAt:restore.testedAt,backupSha256:restore.backupSha256,target:restore.target||null}:null};
  if(!restoreReady)block('DATABASE_RESTORE_NOT_PROVEN','No signed/versioned database restore-drill evidence is present for this go-live candidate.');

  for(const [name,file,code,detail] of [
    ['securitySignoff','infra/go-live/security-signoff.json','SECURITY_SIGNOFF_MISSING','Penetration/vulnerability security sign-off is not present.'],
    ['operationsSignoff','infra/go-live/operations-signoff.json','OPERATIONS_SIGNOFF_MISSING','Production monitoring/on-call/support ownership sign-off is not present.'],
    ['changeApproval','infra/go-live/change-approval.json','CHANGE_APPROVAL_MISSING','Formal production change/release approval is not present.']
  ]){
    let obj=null;const p=resolve(file);if(existsSync(p)){try{obj=JSON.parse(readFileSync(p,'utf8'));}catch{}}
    const ok=obj?.status==='PASS'&&Boolean(obj?.approvedAt||obj?.completedAt);
    report.checks[name]={status:ok?'PASS':'FAIL',evidence:ok?obj:null};
    if(!ok)block(code,detail);
  }

  report.status=blockers.length===0?'PASS':'BLOCKED';
}catch(e){
  report.status='BLOCKED';
  block('GO_LIVE_GATE_ERROR',String(e?.message||e));
  report.error=String(e?.stack||e);
}finally{
  report.finishedAt=new Date().toISOString();
  report.signoff=report.status==='PASS'?{decision:'GO_LIVE_APPROVED',candidateFrozen:true}:{decision:'GO_LIVE_BLOCKED',candidateFrozen:true,blockerCount:blockers.length};
  writeFileSync('ANCLINE_GO_LIVE_FINAL_ACCEPTANCE.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
