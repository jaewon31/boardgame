// Original, deterministically synthesized game cues. No third-party samples.
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'../apps/mobile/assets/audio');
fs.mkdirSync(dir,{recursive:true});
const rate=44100;
let seed=811;
const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
function render(name,duration,build){
 const samples=new Float64Array(Math.ceil(rate*duration));
 function tone(at,hz,length,gain){for(let i=0;i<length*rate;i++){const t=i/rate,j=Math.floor(at*rate)+i;if(j>=samples.length)break;const env=Math.min(1,t/.006)*Math.exp(-t*6/length)*Math.min(1,(length-t)/.015);samples[j]+=gain*env*(Math.sin(2*Math.PI*hz*t)+.18*Math.sin(2*Math.PI*hz*2*t));}}
 function swipe(at,length,gain){let smooth=0;for(let i=0;i<length*rate;i++){const t=i/rate,j=Math.floor(at*rate)+i;if(j>=samples.length)break;smooth=.64*smooth+.36*noise();samples[j]+=smooth*gain*Math.pow(Math.sin(Math.PI*t/length),2);}}
 function chip(at,gain){tone(at,1800,.075,gain);tone(at+.005,2650,.055,gain*.24);swipe(at,.025,gain*.4);}
 build({tone,swipe,chip});
 const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
 let peak=0;
 for(let i=0;i<samples.length;i++){const value=.72*Math.tanh(samples[i]);peak=Math.max(peak,Math.abs(value));wav.writeInt16LE(Math.round(value*32767),44+i*2);}
 fs.writeFileSync(path.join(dir,name+'.wav'),wav);console.log(name, duration+'s','peak='+peak.toFixed(3));
}
render('deal',.55,({swipe,tone})=>{[0,.12,.24,.36].forEach(t=>{swipe(t,.11,.62);tone(t+.07,240,.05,.18);});});
render('card',.24,({swipe,tone})=>{swipe(0,.16,.7);tone(.12,280,.08,.2);});
render('chips',.32,({chip})=>[0,.05,.11,.17].forEach((t,i)=>chip(t,.3-i*.035)));
render('turn',.48,({tone})=>{tone(0,660,.25,.35);tone(.13,880,.3,.3);});
render('warning',.45,({tone})=>{tone(0,740,.15,.32);tone(.22,740,.15,.27);});
render('collect',.6,({chip,swipe})=>{swipe(0,.38,.32);[.04,.09,.15,.23,.31,.4].forEach(t=>chip(t,.23));});
render('win',.95,({tone,chip})=>{[523.25,659.25,783.99,1046.5].forEach((hz,i)=>tone(i*.11,hz,.5,.27));[.44,.5,.57].forEach(t=>chip(t,.16));});
