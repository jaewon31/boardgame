import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsNickname,showAccountEntry} from '../../mobile/src/services/accountFlow.ts';
const state={hasRoom:false,configured:true,loading:false,user:false,profile:false,setup:false,guest:false,opened:false};
test('first launch offers sign in, guest can proceed, active rooms are never interrupted',()=>{
 assert.equal(showAccountEntry(state),true);
 assert.equal(showAccountEntry({...state,guest:true}),false);
 assert.equal(showAccountEntry({...state,hasRoom:true,opened:true,loading:true}),false);
 assert.equal(showAccountEntry({...state,configured:false}),false);
});
test('restored accounts wait for profile then go directly home; onboarding is only for unset nicknames',()=>{
 assert.equal(showAccountEntry({...state,user:true}),true);
 assert.equal(showAccountEntry({...state,user:true,profile:true}),false);
 assert.equal(showAccountEntry({...state,user:true,profile:true,setup:true}),true);
 assert.equal(needsNickname({display_name:'플레이어'},{}),true);
 assert.equal(needsNickname({display_name:'플레이어'},{nickname_setup_complete:true}),false);
 assert.equal(needsNickname({display_name:'친구'},{}),false);
 assert.equal(needsNickname(null,{}),false);
});
