import {readFile} from 'node:fs/promises';

// Deliberately supported SemVer channels; alpha and arbitrary prerelease names are not release stages.
const VERSION=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(dev|beta|rc)\.(0|[1-9]\d*))?$/;
export function parseVersion(version){
 if(typeof version!=='string'||!VERSION.test(version)||version.length>80)throw new Error('invalid_version');
 const match=VERSION.exec(version);
 return {version,tag:'v'+version,candidate:match[4]??'stable'};
}
export function parseTag(tag){
 if(typeof tag!=='string'||!tag.startsWith('v'))throw new Error('invalid_tag');
 return parseVersion(tag.slice(1));
}
export function checkMetadata(pkg,lock){
 const result=parseVersion(pkg.version);
 if(lock.version!==pkg.version||lock.packages?.['']?.version!==pkg.version)throw new Error('version_metadata_mismatch');
 return {...result,stage:'development'};
}
export async function readMetadata(root=new URL('../../',import.meta.url)){
 return checkMetadata(JSON.parse(await readFile(new URL('package.json',root),'utf8')),JSON.parse(await readFile(new URL('package-lock.json',root),'utf8')));
}
/** A version string alone is never evidence of a published release. */
export function releaseStage(version,release){
 const parsed=parseVersion(version);
 if(!release)return 'development';
 if(release.draft!==false||!release.published_at||!Number.isSafeInteger(release.id)||release.id<=0)throw new Error('release_not_published');
 if(release.tag_name!==parsed.tag||parsed.candidate==='dev')throw new Error('release_version_mismatch');
 if(release.prerelease!==(parsed.candidate!=='stable'))throw new Error('release_prerelease_mismatch');
 return parsed.candidate;
}
export function ciState(runs,sha){
 const matching=runs.filter(r=>r.head_sha===sha&&r.event==='push');
 if(!matching.length)return 'missing';
 // The newest attempt is authoritative; an older success must not hide a pending/failing run.
 const latest=[...matching].sort((a,b)=>b.id-a.id||b.run_attempt-a.run_attempt)[0];
 if(latest.status!=='completed')return 'pending';
 return latest.conclusion==='success'?'success':'failure';
}
export const REQUIRED_JOBS=['verify (windows-latest)','verify (ubuntu-latest)'];
export function verifiedJobs(jobs){return REQUIRED_JOBS.every(name=>jobs.some(j=>j.name===name&&j.status==='completed'&&j.conclusion==='success'));}
