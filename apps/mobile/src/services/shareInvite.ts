import { Share } from './platformUI';
import Constants from 'expo-constants';
import { inviteUrl, webInviteUrl } from './invite';
export async function shareInvite(code: string) {
  const host = Constants.appOwnership === 'expo' ? Constants.expoConfig?.hostUri : undefined;
  const web=process.env.EXPO_PUBLIC_WEB_APP_URL;
  const url=web ? webInviteUrl(code,web,__DEV__) : inviteUrl(code,host);
  await Share.share({ message: 'Friends Table에서 같이 놀아요!\n' + url + '\n초대 코드: ' + code + '\n링크가 열리지 않으면 코드로 입장해 주세요.' });
}
