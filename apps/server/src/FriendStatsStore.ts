import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export interface AccountResult {accountId:string;netChips:number;won:boolean}
export interface FriendStats {hands:number;mine:{wins:number;netChips:number};friend:{wins:number;netChips:number}}
export class FriendStatsStore {
  private db:DatabaseSync;
  constructor(path:string){
    mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);
    try{if(path!==':memory:')chmodSync(path,0o600);this.db.exec(`PRAGMA busy_timeout=1000; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS recorded_hands(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS account_results(hand_id TEXT NOT NULL REFERENCES recorded_hands(id),account_id TEXT NOT NULL,net_chips INTEGER NOT NULL,won INTEGER NOT NULL CHECK(won IN(0,1)),PRIMARY KEY(hand_id,account_id));
      CREATE INDEX IF NOT EXISTS result_account ON account_results(account_id,hand_id);`);
    }catch(error){this.db.close();throw error;}
  }
  record(handId:string,players:AccountResult[]){
    if(players.length<2)return;
    if(new Set(players.map(p=>p.accountId)).size!==players.length||players.some(p=>!Number.isSafeInteger(p.netChips)))throw new Error('Invalid account result');
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const inserted=this.db.prepare('INSERT INTO recorded_hands(id) VALUES(?) ON CONFLICT DO NOTHING').run(handId);
      if(inserted.changes){
        const insert=this.db.prepare('INSERT INTO account_results(hand_id,account_id,net_chips,won) VALUES(?,?,?,?)');
        for(const p of players)insert.run(handId,p.accountId,p.netChips,p.won?1:0);
      }
      this.db.exec('COMMIT');
    }catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  compare(me:string,friend:string):FriendStats{
    const r=this.db.prepare(`SELECT count(*) hands,coalesce(sum(a.won),0) my_wins,coalesce(sum(a.net_chips),0) my_chips,coalesce(sum(b.won),0) friend_wins,coalesce(sum(b.net_chips),0) friend_chips
      FROM account_results a JOIN account_results b ON a.hand_id=b.hand_id WHERE a.account_id=? AND b.account_id=?`).get(me,friend)!;
    return {hands:Number(r.hands),mine:{wins:Number(r.my_wins),netChips:Number(r.my_chips)},friend:{wins:Number(r.friend_wins),netChips:Number(r.friend_chips)}};
  }
  close(){this.db.close();}
}

