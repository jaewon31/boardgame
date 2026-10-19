import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HoldemHand} from '../src/holdem/hand.ts';
import {saveReview,reviewFor} from '../src/holdem/review.ts';
const seeds=[{id:'a',nickname:'A',stack:100},{id:'b',nickname:'B',stack:100}];
test('review records final fold, separates own cards, and survives checkpoint restore',()=>{
 const h=new HoldemHand(seeds);
 assert.throws(()=>saveReview(h));
 h.act('a','fold');
 const saved=saveReview(h);
 const outsider=reviewFor(saved,'observer');
 assert.ok(outsider.hand.players.every(p=>p.cards===null));
 assert.ok(!JSON.stringify(outsider).includes('ownCards'));
 assert.equal(reviewFor(saved,'a').hand.players[0].cards?.length,2);
 assert.equal(reviewFor(saved,'a').hand.players[1].cards,null);
 assert.ok(outsider.events.some(e=>e.text==='A: 폴드'));
 assert.equal(outsider.events.at(-1)?.street,'complete');
 assert.deepEqual(outsider.netChips,{a:-10,b:10});
 assert.deepEqual(saveReview(HoldemHand.restore(h.checkpoint())),saved);
});
test('all-in review contains only public board progression and all chip outcomes sum to zero',()=>{
 const h=new HoldemHand(seeds);
 h.act('a','allIn');h.act('b','call');
 while(!h.complete) h.timeout();
 const saved=saveReview(h), review=reviewFor(saved,'observer');
 assert.deepEqual([...new Set(review.events.map(e=>e.board.length))],[0,3,4,5]);
 assert.equal(Object.values(review.netChips!).reduce((a,b)=>a+b,0),0);
 const hidden=review.hand.players.find(p=>!p.revealed);
 if(hidden) {assert.equal(hidden.cards,null);h.revealCards(hidden.id);assert.equal(reviewFor(saveReview(h),'observer').hand.players.find(p=>p.id===hidden.id)?.cards?.length,2);}
});
