// GitHubを模擬し、ソースと配信用APIの複数画像・公開情報の境界を検証する。
const assert=require('node:assert/strict');
const jpeg='data:image/jpeg;base64,/9j/2Q==';
(async()=>{
 const originalFetch=global.fetch,originalToken=process.env.GITHUB_TOKEN,originalCommit=process.env.VERCEL_GIT_COMMIT_SHA;
 process.env.GITHUB_TOKEN='test-only';process.env.VERCEL_GIT_COMMIT_SHA='a'.repeat(40);
 try{
  for(const file of ['../api/feedback.cjs','../.vercel/output/functions/api/feedback.func/index.cjs']){
   const handler=require(file);
   async function submit(body,failAt=0){
    const calls=[];let uploads=0,result;
    global.fetch=async(url,options)=>{
     calls.push({url,method:options.method,body:JSON.parse(options.body)});
     if(options.method==='PUT'){uploads++;return {ok:uploads!==failAt,status:403};}
     return {ok:true,json:async()=>({html_url:'https://github.com/test/repo/issues/1'})};
    };
    const response={setHeader(){},end(body){result=JSON.parse(body);}};
    await handler({method:'POST',headers:{'user-agent':'raw-private-UA','x-forwarded-for':'private-IP'},body},response);
    return {status:response.statusCode,result,calls};
   }
   for(const count of [0,1,3,5]){
    const r=await submit({message:'画像添付検証',images:Array(count).fill(jpeg),diagnostics:{schema:1,appVersion:'1.9.2',browser:'Safari',browserMajor:26,os:'iOS',viewportWidth:393,viewportHeight:793,cssLandscape:true,
     url:'https://private.invalid/?room=secret',roomId:'private-room',userAgent:'raw-private-UA',logs:['private-log'],localStorage:{key:'private-storage'},filename:'private-file.jpg',extra:{token:'private-token'}}});
    assert.equal(r.status,200);assert.equal(r.result.imagesReceived,count);assert.equal(r.result.imagesAttached,count);assert.equal(r.calls.length,count+1);
    const issue=r.calls.at(-1).body.body;
    assert.equal((issue.match(/!\[添付画像/g)||[]).length,count);
    assert.match(issue,/"viewportWidth": 393/);assert.match(issue,/"serverCommit": "a{40}"/);
    for(const secret of ['private.invalid','private-room','raw-private-UA','private-log','private-storage','private-file.jpg','private-token','private-IP'])assert.ok(!issue.includes(secret),secret);
    for(const upload of r.calls.slice(0,-1)){assert.equal(upload.body.content,'/9j/2Q==');assert.match(upload.url,/feedback-assets\/.+\.jpg$/);}
   }
   const legacy=await submit({message:'旧フォーム互換',image:jpeg});assert.equal(legacy.result.imageAttached,true);assert.equal(legacy.result.imagesAttached,1);
   const string=await submit(JSON.stringify({message:'Vercel文字列body',images:[jpeg,jpeg]}));assert.equal(string.result.imagesAttached,2);
   const buffer=await submit(Buffer.from(JSON.stringify({message:'VercelBuffer body',images:[jpeg]})));assert.equal(buffer.result.imagesAttached,1);
   const failure=await submit({message:'途中失敗',images:[jpeg,jpeg,jpeg]},2);assert.equal(failure.status,502);assert.equal(failure.calls.length,2);assert.ok(failure.calls.every(c=>c.method==='PUT'));
   for(const body of [{message:'上限超過',images:Array(6).fill(jpeg)},{message:'不正',images:'private'},{message:'不正',images:[null]},{message:'不正',images:['data:image/png;base64,/9j/2Q==']},{message:'不正',images:['data:image/jpeg;base64,AAAA']},{message:'大きすぎる',images:['data:image/jpeg;base64,'+'A'.repeat(240001)]},[],42]){
    const r=await submit(body);assert.equal(r.status,400);assert.equal(r.calls.length,0,'不正入力ではGitHubへ送信しない');
   }
  }
  console.log('PASS: ソース/配信APIの0〜5枚・旧フォーム互換・受信形式・途中失敗・公開情報許可リスト・不正入力拒否');
 }finally{
  global.fetch=originalFetch;
  if(originalToken===undefined)delete process.env.GITHUB_TOKEN;else process.env.GITHUB_TOKEN=originalToken;
  if(originalCommit===undefined)delete process.env.VERCEL_GIT_COMMIT_SHA;else process.env.VERCEL_GIT_COMMIT_SHA=originalCommit;
 }
})().catch(e=>{console.error(e);process.exit(1)});
