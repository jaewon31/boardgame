import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inviteCode, inviteUrl, webInviteUrl } from '../../mobile/src/services/invite.ts';
import { DEFAULT_SETTINGS, validRoomSettings } from '@boardgame/shared';
import { HoldemHand } from '../src/holdem/hand.ts';
test('installed and Expo invitation links roundtrip; unrelated URLs cannot redirect the game endpoint',()=>{
  for(const host of [undefined,'127.0.0.1:8082','192.168.1.3:8082']) assert.equal(inviteCode(inviteUrl('AB3D5FGH',host)),'AB3D5FGH');
  for(const url of ['https://evil.com/--/join/AB3D5FGH','friendstable://join/AB3D5FGH?server=evil','friendstable://join/AB3D5FGH/extra','friendstable://user:pass@join/AB3D5FGH','friendstable://join/SHORT','exp://localhost:8082/join/AB3D5FGH','not a url',null]) assert.equal(inviteCode(url),null);
});
test('room setting boundaries and custom blind minimum raises survive restoration',()=>{
  assert.equal(validRoomSettings(DEFAULT_SETTINGS),true);
  assert.equal(validRoomSettings({startingChips:100000,smallBlind:5000,bigBlind:10000,turnSeconds:120}),true);
  assert.equal(validRoomSettings({...DEFAULT_SETTINGS,turnSeconds:9}),false);
  assert.equal(validRoomSettings({...DEFAULT_SETTINGS,startingChips:100001}),false);
  let hand=new HoldemHand([{id:'a',nickname:'A',stack:5000},{id:'b',nickname:'B',stack:5000}],{smallBlind:50,bigBlind:100,turnMs:45000});
  assert.equal(hand.legalFor('a')?.minRaiseTo,200);
  hand.act('a','call'); hand.act('b','check');
  assert.equal(hand.legalFor('b')?.minRaiseTo,100);
  hand=HoldemHand.restore(hand.checkpoint());
  hand.recoverClock(1000);assert.equal(hand.deadline,46000);
  assert.equal(hand.viewFor('a').bigBlind,100);
});
test('web invitations contain only room codes and never accept credential/query redirects',()=>{
  assert.equal(inviteCode(webInviteUrl('AB3D5FGH','https://play.test')),'AB3D5FGH');
  assert.equal(inviteCode(webInviteUrl('AB3D5FGH','http://localhost:8087',true)),'AB3D5FGH');
  assert.throws(()=>webInviteUrl('AB3D5FGH','http://play.test'));
  assert.throws(()=>webInviteUrl('AB3D5FGH','https://play.test?token=x'));
  for(const suffix of ['?access_token=x','#token=x','/extra','/'])assert.equal(inviteCode('https://play.test/join/AB3D5FGH'+suffix),null);
  assert.equal(inviteCode('https://play.test/join/WRONG'),null);
});
