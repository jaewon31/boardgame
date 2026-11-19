import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {LobbyScreen} from '../../src/screens/LobbyScreen';
import {GameScreen} from '../../src/screens/GameScreen';
import HomeScreen from '../../src/screens/HomeScreen';
import {FriendsScreen} from '../../src/screens/FriendsScreen';
import {AccountScreen} from '../../src/screens/AccountScreen';
import {RoomSettingsEditor} from '../../src/components/RoomSettingsEditor';
import {useWebLayout} from '../../src/services/useWebLayout.web';
const noop=()=>{};
const player=(id)=>({id,nickname:id,stack:990,roundBet:10,totalBet:10,folded:false,allIn:false,cards:id==='me'?['14s','13h']:null,revealed:false});
const params=new URLSearchParams(location.search);
const count=Number(params.get('count')||6),showdown=params.has('showdown');
const players=Array.from({length:count},(_,i)=>({...player(i===0?'me':'친구'+i),cards:i===0?['14s','13h']:showdown?['10d','12c']:null,revealed:showdown}));
const hand={id:'one',number:2,revision:1,street:showdown?'complete':'flop',board:['14h','10s','8d','12c','2h'],players,pot:20,smallBlind:10,bigBlind:20,dealerId:'me',smallBlindId:'me',bigBlindId:'other',actorId:'me',deadline:Date.now()+600000,legal:showdown?null:{canCheck:false,callAmount:10,canRaise:true,minRaiseTo:40,maxRaiseTo:1000,canAllIn:true},payouts:[],refunds:[],pots:[],lastEvent:'',canReveal:false};
const review={hand:{...hand,id:'previous',number:1,street:'complete',legal:null,payouts:[{playerId:'me',amount:20,handName:'폴드 승리'}],pots:[{amount:20,winnerIds:['me']}]},events:[{street:'preflop',text:'other: 폴드',board:[],pot:20}],netChips:{me:10,other:-10}};
window.actions=[];
function Fixture(){
 useWebLayout();const [mode,setMode]=useState(new URLSearchParams(location.search).get('screen')??'game'),[tick,setTick]=useState(0),[loading,setLoading]=useState(false);
 useEffect(()=>{const socket=new WebSocket('ws://'+location.host+'/snapshots');socket.onmessage=event=>setTick(JSON.parse(event.data).revision);return()=>socket.close();},[]);
 window.fixture={setMode,setLoading};
 const settings={startingChips:1000,smallBlind:10,bigBlind:20,turnSeconds:30};
 return <SafeAreaProvider style={{height:"100%"}} initialMetrics={{frame:{x:0,y:0,width:innerWidth,height:innerHeight},insets:{top:0,bottom:0,left:0,right:0}}}>
 {mode==='lobby'?<LobbyScreen room={{code:'ABCD2345',game:'holdem',maxPlayers:6,hostId:params.has('guest')?'other':'me',players:players.map(p=>({...p,connected:true})),settings}} playerId="me" connected={!params.has('offline')} onSettings={async value=>window.actions.push(value)} onHome={noop} onRetry={noop} onLeave={noop} onStart={noop}/>:mode==='game'?<GameScreen room={{code:'ABCD2345',hostId:'me',players:players.map(p=>({...p,connected:true})),holdem:{...hand,revision:tick+1},handReviews:[review],settings}} playerId="me" connected audio={{loaded:true,level:.5,muted:false,gains:{},setPreviewMode:noop}} onAct={(...args)=>window.actions.push(args)} onLeave={noop} onReveal={noop} onRevealRiver={noop} onReset={noop}/>:
 mode==='friends'?<FriendsScreen profile={{id:'me',display_name:'테스터',friend_code:'ABCDEF123456'}} onClose={noop}/>:mode==='settings'?<RoomSettingsEditor initial={settings} onClose={noop} onSave={value=>window.actions.push(value)}/>:
 mode==='account'?<AccountScreen account={{profile:{id:'me',display_name:'기존',friend_code:'ABCDEF123456'},profileLoading:loading,loading:false,sessionBlocked:false,busy:false,configured:true,user:{id:'me'},saveName:async value=>(window.actions.push(value),false)}} onClose={noop}/>:
 <HomeScreen phase="NO_ROOM" busy={false} error={null} onEnter={value=>window.actions.push(value)}/>}
 </SafeAreaProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
