import { Share } from './platformUI';
import { webInviteUrl } from './invite';
export async function shareInvite(code:string) {
  const url=webInviteUrl(code,process.env.EXPO_PUBLIC_WEB_APP_URL??window.location.origin,__DEV__);
  await Share.share({message:`Friends Table에서 같이 놀아요!\n${url}\n초대 코드: ${code}`});
}
