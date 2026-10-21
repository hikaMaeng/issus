import {createContext, useCallback, useContext, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction} from 'react';
import {SessionDraftMemory} from './draft-memory.js';

export {SessionDraftMemory, sessionDraftScope} from './draft-memory.js';
interface DraftContext {memory: SessionDraftMemory; scope: string|null}
const Context = createContext<DraftContext|null>(null);

/** Lives above the authentication branch; a restore remounts the view as one transaction. */
export function SessionDraftProvider({memory, scope, children}: DraftContext & {children: ReactNode}) {
  return <Context.Provider value={{memory, scope}}>{children}</Context.Provider>;
}

/** useState-compatible storage for explicitly approved non-credential draft fields. */
export function useSessionDraft<T>(slot: string, initial: T|(() => T)): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(Context);
  const lease = useRef(context?.scope ? context.memory.lease(context.scope) : undefined);
  const [value, setValue] = useState<T>(() => {
    const fallback = () => typeof initial === 'function' ? (initial as () => T)() : initial;
    return context?.scope ? context.memory.initial(context.scope, slot, fallback) : fallback();
  });
  const current = useRef(value);
  useLayoutEffect(() => {
    current.current = value;
    if (context?.scope && lease.current) context.memory.write(context.scope, slot, value, lease.current);
  }, [context?.memory, context?.scope, slot, value]);
  const update: Dispatch<SetStateAction<T>> = useCallback(next => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current.current) : next;
    current.current = resolved;
    if (context?.scope && lease.current) context.memory.write(context.scope, slot, resolved, lease.current);
    setValue(resolved);
  }, [context?.memory, context?.scope, slot]);
  return [value, update];
}
