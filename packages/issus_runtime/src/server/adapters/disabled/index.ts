import type {DisabledWakeAdapter} from 'issus_domain/common';
/** Default deployment adapter has no external side effects. */
export const disabledWakeAdapter:DisabledWakeAdapter={kind:'disabled',async wake(){return {accepted:false};}};
