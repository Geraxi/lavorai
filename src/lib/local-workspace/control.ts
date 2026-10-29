/** Shared local command fence. No production lease/quota is replaced by this. */
export type ControlState = {owner:string;revision:number;busy:boolean;expiresAt:number;status:string};
export function checkControl(s:ControlState,owner:string,revision:number,now=Date.now()) {
 if(s.owner!==owner)throw Error('Session unavailable');
 if(s.busy||revision!==s.revision)throw Error('Control changed. Refresh before acting.');
 if(now>=s.expiresAt||['closed','expired','unknown','accepted','rejected','disconnected'].includes(s.status))throw Error('Session is terminal. No retry permitted.');
}
