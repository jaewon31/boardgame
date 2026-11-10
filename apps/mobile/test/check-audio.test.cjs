const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
function readCheck(){
 const b=fs.readFileSync(path.join(__dirname,'../assets/audio/check-user.wav'));
 assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');assert.equal(b.readUInt32LE(4)+8,b.length);
 let fmt,data;for(let i=12;i+8<=b.length;){const size=b.readUInt32LE(i+4),tag=b.toString('ascii',i,i+4);assert.ok(i+8+size<=b.length);if(tag==='fmt ')fmt=b.subarray(i+8,i+8+size);if(tag==='data')data=b.subarray(i+8,i+8+size);i+=8+size+(size%2);}
 assert.ok(fmt&&data);assert.equal(fmt.readUInt16LE(0),1);assert.equal(fmt.readUInt16LE(2),1);assert.equal(fmt.readUInt32LE(4),44100);assert.equal(fmt.readUInt16LE(14),16);
 return Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
}
test('CHECK retains two knock transients without limiter-induced discontinuities',()=>{
 const samples=readCheck();assert.equal(samples.length,31752); // 720ms, no re-timing or truncation.
 let peak=0,maxStep=0,square=0;
 for(let i=0;i<samples.length;i++){const x=samples[i];peak=Math.max(peak,Math.abs(x));square+=x*x;if(i)maxStep=Math.max(maxStep,Math.abs(x-samples[i-1]));}
 assert.ok(peak>.70&&peak<.71,'approximately -3 dBFS headroom');
 assert.ok(maxStep<.03,`unexpected single-sample discontinuity: ${maxStep}`);
 const rms=10*Math.log10(square/samples.length);assert.ok(rms>-21&&rms<-19.5);
 const groups=[];let active=false;
 for(let i=0;i<samples.length;i+=441){const window=samples.slice(i,i+441);const loud=Math.sqrt(window.reduce((sum,x)=>sum+x*x,0)/window.length)>.025;if(loud&&!active)groups.push(i/44.1);active=loud;}
 assert.deepEqual(groups,[40,280]);
 assert.ok(samples.slice(9702,10584).every(x=>x===0),'gap between the two knocks remains silent');
 assert.ok(samples.slice(22050).every(x=>x===0),'no amplified background noise in trailing silence');
});
