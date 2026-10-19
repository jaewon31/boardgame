import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
// Supply the two WebCrypto operations used by Supabase PKCE on Hermes.
// Never let the SDK fall back to Math.random or a plain-text challenge.
if (Platform.OS !== 'web') {
  if (!globalThis.crypto) Object.defineProperty(globalThis,'crypto',{value:{},configurable:true});
  if (!globalThis.crypto.getRandomValues) Object.defineProperty(globalThis.crypto,'getRandomValues',{value:Crypto.getRandomValues});
  if (!globalThis.crypto.subtle) Object.defineProperty(globalThis.crypto,'subtle',{value:{digest:(algorithm:string,data:BufferSource)=>{
    if(algorithm!=='SHA-256')throw new Error('Unsupported auth digest');
    return Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,data);
  }}});
}
