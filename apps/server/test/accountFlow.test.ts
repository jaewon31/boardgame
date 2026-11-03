import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsNickname,showAccountEntry} from '../../mobile/src/services/accountFlow.ts';
const state={hasRoom:false,configured:true,loading:false,user:false,profile:false,setup:false,blocked:false,opened:false};
test('first launch and configuration failures cannot bypass account setup; active rooms are not interrupted by entry screen',()=>{
 assert.equal(showAccountEntry(state),true);
 assert.equal(showAccountEntry({...state,hasRoom:true,opened:true,loading:true}),false);
 assert.equal(showAccountEntry({...state,configured:false}),true);
});
test('restored accounts enter home only after profile and session validation; nickname completion is explicit',()=>{
 assert.equal(showAccountEntry({...state,user:true}),true);
 assert.equal(showAccountEntry({...state,user:true,profile:true}),false);
 assert.equal(showAccountEntry({...state,user:true,profile:true,setup:true}),true);
 assert.equal(showAccountEntry({...state,user:true,profile:true,blocked:true}),true);
 assert.equal(needsNickname({nickname_setup_complete:false}),true);
 assert.equal(needsNickname({nickname_setup_complete:true}),false);
 assert.equal(needsNickname(null),false);
});
