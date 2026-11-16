import { useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { AlertButton } from 'react-native';

type Dialog = { title: string; message: string; buttons: AlertButton[]; copy?: string };
let current: Dialog | null = null;
const queue: Dialog[] = [], listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
function show(dialog: Dialog) { if(current) queue.push(dialog); else {current=dialog;emit();} }
function finish(button?: AlertButton) {
  current=queue.shift() ?? null;emit();button?.onPress?.();
}
export const Alert = {
  alert(title: string, message = '', buttons: AlertButton[] = [{text:'확인'}]) {
    show({title,message,buttons});
  },
};
async function copyFallback(text:string):Promise<void> {
  return new Promise(resolve=>show({title:'복사·공유',message:'아래 내용을 복사해서 친구에게 전달해 주세요.',copy:text,buttons:[{text:'닫기',onPress:resolve}]}));
}
async function writeClipboard(text:string) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try { await Promise.race([navigator.clipboard.writeText(text),new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Clipboard unavailable')),1500);})]); }
  finally {clearTimeout(timer);}
}
export async function copyText(text:string) {
  try { await writeClipboard(text); Alert.alert('복사 완료','클립보드에 복사했어요.'); }
  catch { await copyFallback(text); }
}
export const Share = {
  async share(content:{message?:string;url?:string;title?:string}) {
    const text=[content.message,content.url].filter(Boolean).join('\n');
    await copyFallback(text);return {action:'sharedAction'};
  },
};
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function WebDialogs() {
  const dialog=useSyncExternalStore(subscribe,()=>current,()=>null);
  const [copyStatus,setCopyStatus]=useState('');
  if(!dialog)return null;
  const close=(button?:AlertButton)=>{setCopyStatus('');finish(button);};
  const cancel=()=>{const button=dialog.buttons.find(b=>b.style==='cancel');if(button||dialog.copy||dialog.buttons.length===1)close(button??dialog.buttons[0]);};
  return <Modal visible transparent animationType="fade" onRequestClose={cancel}>
    <View testID="web-modal-overlay" style={styles.overlay}><View testID="web-modal-panel" accessibilityViewIsModal accessibilityLabel={dialog.title} style={styles.panel}>
      <Text style={styles.title}>{dialog.title}</Text><Text style={styles.text}>{dialog.message}</Text>
      {dialog.copy!==undefined&&<><TextInput accessibilityLabel="복사할 내용" multiline readOnly value={dialog.copy} style={styles.input}/>
        <Pressable accessibilityRole="button" style={styles.button} onPress={()=>{void writeClipboard(dialog.copy!).then(()=>setCopyStatus('복사했어요.')).catch(()=>setCopyStatus('내용을 선택한 뒤 직접 복사해 주세요.'));}}><Text style={styles.text}>내용 복사</Text></Pressable>
        {typeof navigator.share==='function'&&<Pressable accessibilityRole="button" style={styles.button} onPress={()=>{void navigator.share({text:dialog.copy}).catch(()=>setCopyStatus('공유를 완료하지 못했어요. 내용을 복사해 전달할 수 있어요.'));}}><Text style={styles.text}>기기 공유</Text></Pressable>}
        {!!copyStatus&&<Text accessibilityRole="status" style={styles.text}>{copyStatus}</Text>}</>}
      <View style={styles.row}>{dialog.buttons.map((button,i)=><Pressable key={i} accessibilityRole="button" style={[styles.button,button.style==='destructive'&&styles.danger]} onPress={()=>close(button)}><Text style={styles.text}>{button.text??'확인'}</Text></Pressable>)}</View>
    </View></View>
  </Modal>;
}
const styles=StyleSheet.create({overlay:{flex:1,backgroundColor:'#000B',alignItems:'center',justifyContent:'center',padding:20},panel:{width:'100%',maxWidth:480,maxHeight:'90%',backgroundColor:'#172A2D',borderRadius:16,padding:20,gap:16},title:{color:'#FAF6E9',fontSize:19,fontWeight:'700'},text:{color:'#E8DBB9',fontSize:14},input:{color:'#FAF6E9',backgroundColor:'#101C18',padding:12,minHeight:100,fontSize:16},row:{flexDirection:'row',justifyContent:'flex-end',gap:12},button:{minHeight:44,justifyContent:'center',paddingHorizontal:16,backgroundColor:'#263F3C',borderRadius:8},danger:{backgroundColor:'#492324'}});
