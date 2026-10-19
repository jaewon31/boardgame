import { Share } from 'react-native';
import Constants from 'expo-constants';
import { inviteUrl } from './invite';
export async function shareInvite(code: string) {
  const host = Constants.appOwnership === 'expo' ? Constants.expoConfig?.hostUri : undefined;
  await Share.share({ message: 'Friends Table에서 같이 놀아요!\n' + inviteUrl(code, host) + '\n초대 코드: ' + code + '\n링크가 열리지 않으면 앱에서 코드로 입장해 주세요.' });
}
