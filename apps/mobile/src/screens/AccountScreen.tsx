import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account } from '../hooks/useAccount';
import { ActionButton } from '../components/ActionButton';
export function AccountScreen({account,onClose,setup=false}:{account:Account;onClose:()=>void;setup?:boolean}) {
  const insets=useSafeAreaInsets();
  const compact=useWindowDimensions().height<740;
  const [step,setStep]=useState<'choose'|'email'|'code'>('choose');
  const [email,setEmail]=useState(''),[code,setCode]=useState(''),[name,setName]=useState('');
  const [remaining,setRemaining]=useState(0),[resendAt,setResendAt]=useState(0);
  useEffect(()=>setName(setup?'':account.profile?.display_name??''),[account.profile?.id,setup]);
  useEffect(()=>{const tick=()=>setRemaining(Math.max(0,Math.ceil((resendAt-Date.now())/1000)));tick();const timer=setInterval(tick,1000);return()=>clearInterval(timer);},[resendAt]);
  function navigate(next:typeof step){account.clearMessage();setStep(next);setCode('');}
  async function send(){if(await account.sendCode(email)){setStep('code');setCode('');setResendAt(Date.now()+60000);}}
  async function save(){if(await account.saveName(name))onClose();}
  const waiting=account.loading || (!!account.user&&!account.profile&&!account.profileError);
  const validName=[...name.trim()].length>=1&&[...name.trim()].length<=12&&!/[\p{Cc}\p{Cf}]/u.test(name);
  const title=account.user?(setup?'어떻게 불러드릴까요?':'내 프로필'):step==='email'?'이메일로 시작':step==='code'?'인증 코드를 입력해 주세요':'친구들과 한 테이블';
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'}>
    <View style={[styles.content,{paddingTop:insets.top+8,paddingBottom:insets.bottom+8}]}>
      <View style={styles.top}><Text style={styles.brand}>FRIENDS TABLE</Text>{!waiting&&!setup&&<Pressable accessibilityRole="button" disabled={account.busy} onPress={()=>step!=='choose'&&!account.user?navigate('choose'):onClose()} style={styles.close}><Text style={styles.note}>{account.user?'닫기':step==='choose'?'둘러보기':'뒤로'}</Text></Pressable>}</View>
      {waiting?<View style={styles.loading}><ActivityIndicator color="#DFC98D"/><Text style={styles.note}>{account.message || '잠시만 기다려 주세요'}</Text></View>:<View style={[styles.body,compact&&{gap:10,paddingVertical:6}]}>
        {!compact&&!account.user&&step==='choose'&&<Text accessible={false} style={styles.mark}>♠</Text>}
        <Text style={[styles.title,compact&&{fontSize:22}]}>{title}</Text>
        {!account.configured?<><Text style={styles.text}>로그인 서비스를 준비 중이에요.</Text><ActionButton title="둘러보기" onPress={onClose}/></>:account.user?account.profile?<>
          <Text style={styles.note}>{setup?'친구들에게 보일 닉네임 하나면 준비 끝이에요.':account.user.email ?? '로그인됨'}</Text>
          <TextInput accessibilityLabel="계정 닉네임" placeholder="닉네임 1~12자" placeholderTextColor="#7E9587" style={styles.input} value={name} onChangeText={setName} maxLength={24} autoCorrect={false} returnKeyType="done" onSubmitEditing={()=>{if(validName&&!account.busy)void save();}} editable={!account.busy}/>
          <ActionButton title={setup?'시작하기':'저장하고 돌아가기'} busy={account.busy} disabled={!validName} onPress={()=>void save()}/>
          {!setup&&<><View style={styles.codeBox}><Text style={styles.note}>내 친구 코드</Text><Text selectable style={styles.friendCode}>{account.profile.friend_code}</Text></View><ActionButton compact secondary title="로그아웃" disabled={account.busy} onPress={()=>void account.signOut()}/></>}
        </>:<><Text style={styles.text}>프로필을 불러오지 못했어요.</Text><ActionButton title="다시 불러오기" busy={account.profileLoading} onPress={account.reloadProfile}/><ActionButton compact secondary title="로그아웃" disabled={account.busy} onPress={()=>void account.signOut()}/></>:step==='choose'?<>
          <Text style={styles.subtitle}>방을 만들고, 친구를 초대하고, 함께 즐겨요.</Text>
          {account.providers.google&&<Pressable accessibilityRole="button" disabled={account.busy} onPress={()=>void account.social('google')} style={[styles.provider,styles.google,account.busy&&styles.disabled]}><Text style={styles.googleG}>G</Text><Text style={styles.googleText}>Google로 시작</Text><View style={styles.balance}/></Pressable>}
          {account.providers.apple&&<Pressable accessibilityRole="button" disabled={account.busy} onPress={()=>void account.social('apple')} style={[styles.provider,styles.apple,account.busy&&styles.disabled]}><Text style={styles.appleText}>Apple로 시작</Text></Pressable>}
          <ActionButton secondary title="이메일로 시작" disabled={account.busy} onPress={()=>navigate('email')}/>
          {account.busy&&<ActivityIndicator color="#DFC98D"/>}
          <Text style={styles.note}>한 번 로그인하면 다음부터 바로 입장해요.</Text>
        </>:step==='email'?<>
          <Text style={styles.note}>이메일로 받은 코드로 로그인해요.</Text>
          <TextInput accessibilityLabel="이메일" placeholder="이메일 주소" placeholderTextColor="#7E9587" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} style={styles.input} editable={!account.busy}/>
          <ActionButton title="인증 코드 받기" busy={account.busy} disabled={!/^\S+@\S+\.\S+$/.test(email.trim())||remaining>0} onPress={()=>void send()}/>
          {remaining>0&&<Text style={styles.note}>{remaining}초 후 다시 요청할 수 있어요.</Text>}
        </>:<>
          <Text style={styles.note}>{email.trim()}로 보냈어요.</Text>
          <TextInput accessibilityLabel="이메일 인증 코드" placeholder="인증 코드" placeholderTextColor="#7E9587" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="sms-otp" value={code} onChangeText={text=>setCode(text.replace(/\D/g,''))} maxLength={10} style={[styles.input,styles.otp]} editable={!account.busy}/>
          <ActionButton title="확인" busy={account.busy} disabled={!/^\d{6,10}$/.test(code)} onPress={()=>void account.verifyCode(email,code)}/>
          <ActionButton compact secondary title={remaining>0?`${remaining}초 후 다시 받기`:'코드 다시 받기'} disabled={account.busy||remaining>0} onPress={()=>void send()}/>
          <Pressable accessibilityRole="button" disabled={account.busy} onPress={()=>navigate('email')} style={styles.close}><Text style={styles.note}>이메일 주소 변경</Text></Pressable>
        </>}
        {!!account.message&&<Text accessibilityRole="alert" style={styles.message}>{account.message}</Text>}
      </View>}
    </View>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#101C18'},content:{flex:1,width:'100%',maxWidth:480,alignSelf:'center',paddingHorizontal:24},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44},brand:{color:'#F2E8CE',fontWeight:'800',fontSize:13,letterSpacing:2},body:{flex:1,justifyContent:'center',gap:14,paddingVertical:12},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:14},title:{color:'#FAF6E9',fontSize:26,fontWeight:'800',letterSpacing:-.7},text:{color:'#D6DFD6',fontSize:14},note:{color:'#9EAEA1',fontSize:12,lineHeight:18},subtitle:{color:'#AABAAE',fontSize:13,marginBottom:16},mark:{color:'#DDC88F',fontSize:72,marginBottom:12},close:{minHeight:44,justifyContent:'center',alignItems:'center',paddingHorizontal:8},input:{minHeight:52,padding:14,borderRadius:12,backgroundColor:'#203329',borderWidth:1,borderColor:'#415648',color:'#FAF6E9',fontSize:16},otp:{fontSize:22,letterSpacing:6,textAlign:'center'},provider:{minHeight:54,borderRadius:12,flexDirection:'row',alignItems:'center',justifyContent:'center',paddingHorizontal:18},google:{backgroundColor:'#FFFFFF'},googleG:{width:24,color:'#4285F4',fontSize:20,fontWeight:'800'},balance:{width:24},googleText:{flex:1,textAlign:'center',fontSize:15,fontWeight:'700',color:'#242B28'},apple:{backgroundColor:'#000000',borderWidth:1,borderColor:'#526057'},appleText:{color:'#FFFFFF',fontWeight:'700',fontSize:15},disabled:{opacity:.5},message:{color:'#E7D4A8',fontSize:12,lineHeight:18},codeBox:{backgroundColor:'#1B2C23',padding:14,borderRadius:12,gap:5},friendCode:{color:'#E7D4A8',fontSize:18,letterSpacing:2,fontWeight:'700'}});
