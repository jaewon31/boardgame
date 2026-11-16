import { Share } from 'react-native';
export { Alert, Share } from 'react-native';
export function WebDialogs() { return null; }
export async function copyText(text: string) { await Share.share({message:text}); }
