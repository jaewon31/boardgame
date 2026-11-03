import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Account } from '../hooks/useAccount';
import { ActionButton } from '../components/ActionButton';
export function AccountScreen({account,onClose,setup=false}:{account:Account;onClose:()=>void;setup?:boolean}) {
  const insets=useSafeAreaInsets();
  const [name,setName]=useState('');
  useEffect(()=>setName(setup?'':account.profile?.display_name??''),[account.profile?.id,setup]);
  const waiting=account.loading || account.profileLoading;
  const ready=!!account.profile&&!account.sessionBlocked;
  const clean=name.trim().normalize('NFC');
  const validName=[...clean].length>=1&&[...clean].length<=12&&!/[\p{Cc}\p{Cf}]/u.test(clean);
  async function save(){if(await account.saveName(name))onClose();}
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'}>
    <ScrollView contentContainerStyle={[styles.content,{paddingTop:insets.top+16,paddingBottom:insets.bottom+24}]} keyboardShouldPersistTaps="handled">
      <View style={styles.top}><Text style={styles.brand}>FRIENDS TABLE</Text>{ready&&!setup&&<Pressable accessibilityRole="button" disabled={account.busy} onPress={onClose} style={styles.close}><Text style={styles.note}>닫기</Text></Pressable>}</View>
      <View style={styles.body}>
        <Text style={styles.title}>{setup?'어떻게 불러드릴까요?':ready?'내 프로필':'친구들과 한 테이블'}</Text>
        {waiting?<><ActivityIndicator color="#DFC98D"/><Text style={styles.note}>계정을 준비하고 있어요.</Text></>:!account.configured?<Text style={styles.note}>인증 서버 설정이 필요해요. 관리자에게 문의해 주세요.</Text>:ready?<>
          <Text style={styles.note}>{setup?'이메일 인증 없이 닉네임 하나로 시작해요.':'친구들에게 보일 닉네임이에요.'}</Text>
          <TextInput accessibilityLabel="계정 닉네임" placeholder="닉네임 1~12자" placeholderTextColor="#7E9587" style={styles.input} value={name} onChangeText={setName} maxLength={24} autoCorrect={false} returnKeyType="done" onSubmitEditing={()=>{if(validName&&!account.busy)void save();}} editable={!account.busy}/>
          <ActionButton title={setup?'시작하기':'저장하고 돌아가기'} busy={account.busy} disabled={!validName} onPress={()=>void save()}/>
          {!setup&&<View style={styles.codeBox}><Text style={styles.note}>내 친구 코드</Text><Text selectable style={styles.friendCode}>{account.profile!.friend_code}</Text></View>}
        </>:<ActionButton title="다시 시도" onPress={account.reloadProfile}/>}
        {(account.user?.is_anonymous||!account.user)&&<Text style={styles.note}>이 계정은 현재 기기에 저장돼요. 앱 삭제, 앱 데이터 초기화 또는 기기 변경 시 계정과 친구 목록, 경기 기록을 복구하지 못할 수 있어요. 계정 연결 기능은 추후 제공 예정이에요.</Text>}
        {!!account.message&&<Text accessibilityRole="alert" style={styles.message}>{account.message}</Text>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#101C18'},content:{flexGrow:1,width:'100%',maxWidth:480,alignSelf:'center',paddingHorizontal:24},top:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',minHeight:44},brand:{color:'#F2E8CE',fontWeight:'800',fontSize:13,letterSpacing:2},body:{flex:1,justifyContent:'center',gap:16,paddingVertical:24},title:{color:'#FAF6E9',fontSize:26,fontWeight:'800'},note:{color:'#9EAEA1',fontSize:13,lineHeight:20},close:{minHeight:44,justifyContent:'center',paddingHorizontal:8},input:{minHeight:52,padding:14,borderRadius:12,backgroundColor:'#203329',borderWidth:1,borderColor:'#415648',color:'#FAF6E9',fontSize:16},message:{color:'#E7D4A8',fontSize:13,lineHeight:20},codeBox:{backgroundColor:'#1B2C23',padding:14,borderRadius:12,gap:5},friendCode:{color:'#E7D4A8',fontSize:18,letterSpacing:2,fontWeight:'700'}});
