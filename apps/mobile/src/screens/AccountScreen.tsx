import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account } from '../hooks/useAccount';
import { ActionButton } from '../components/ActionButton';
export function AccountScreen({account,onClose}:{account:Account;onClose:()=>void}) {
 const insets=useSafeAreaInsets();
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[name,setName]=useState('');
 useEffect(()=>setName(account.profile?.display_name??''),[account.profile?.display_name]);
 return <KeyboardAvoidingView style={[styles.screen,{paddingTop:insets.top+8,paddingBottom:insets.bottom+8}]} behavior={Platform.OS==='ios'?'padding':'height'}>
   <View style={styles.row}><Text style={styles.title}>내 계정</Text><Pressable accessibilityRole="button" disabled={account.busy} onPress={onClose} style={styles.close}><Text style={styles.text}>닫기</Text></Pressable></View>
   {!account.configured?<Text style={styles.text}>계정 서비스 연결을 준비하고 있어요. 지금은 닉네임으로 게임에 참여할 수 있어요.</Text>:account.loading?<Text style={styles.text}>로그인 확인 중…</Text>:account.user?<>
     <Text style={styles.text}>{account.user.email ?? '로그인됨'}</Text>
     <Text style={styles.note}>친구 코드 · {account.profile?.friend_code ?? '불러오는 중'}</Text>
     <TextInput accessibilityLabel="계정 닉네임" placeholder="닉네임 1~12자" placeholderTextColor="#91A59B" style={styles.input} value={name} onChangeText={setName} maxLength={24}/>
     <ActionButton compact title="닉네임 저장" disabled={account.busy||!account.profile} onPress={()=>void account.saveName(name)}/>
     <ActionButton compact secondary title="로그아웃" disabled={account.busy} onPress={()=>void account.signOut()}/>
   </>:<>
     <Text style={styles.text}>이메일 인증 또는 간편 로그인</Text>
     <TextInput accessibilityLabel="이메일" placeholder="이메일 주소" placeholderTextColor="#91A59B" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} style={styles.input} editable={!account.busy}/>
     <ActionButton compact title="인증 코드 받기" disabled={account.busy||!/^\S+@\S+\.\S+$/.test(email.trim())} onPress={()=>void account.sendCode(email)}/>
     <TextInput accessibilityLabel="이메일 인증 코드" placeholder="메일로 받은 인증 코드" placeholderTextColor="#91A59B" keyboardType="number-pad" textContentType="oneTimeCode" value={code} onChangeText={setCode} maxLength={10} style={styles.input} editable={!account.busy}/>
     <ActionButton compact title="인증하고 시작" disabled={account.busy||!/^\d{6,10}$/.test(code)} onPress={()=>void account.verifyCode(email,code)}/>
     <View style={styles.row}>{(['google','apple'] as const).map(provider=><View key={provider} style={{flex:1}}><ActionButton compact secondary title={provider==='google'?'Google':'Apple'} disabled={account.busy||!account.providers[provider]} onPress={()=>void account.social(provider)}/></View>)}</View>
     <Text style={styles.note}>인증 메일이 없으면 스팸함을 확인해 주세요.</Text>
   </>}
   {!!account.message&&<Text accessibilityRole="alert" style={styles.text}>{account.message}</Text>}
 </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#101C18',paddingHorizontal:20,gap:10},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},title:{color:'#FAF6E9',fontSize:22,fontWeight:'800'},text:{color:'#E4D9B9',fontSize:13,lineHeight:20},note:{color:'#A5B8AB',fontSize:12},close:{minHeight:44,justifyContent:'center',paddingHorizontal:12},input:{minHeight:44,padding:10,borderRadius:8,backgroundColor:'#23382F',color:'#FAF6E9',fontSize:16}});
