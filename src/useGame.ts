import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientState } from '../server/types';

const TOKEN_KEY = 'little-battle.session';
// Each tab keeps its own seat, so two tabs in one browser can sit across from each other.
function savedToken() { try { return sessionStorage.getItem(TOKEN_KEY) || undefined; } catch { return undefined; } }

export function useGame() {
  const socketRef = useRef<Socket | null>(null);
  const [state, setState] = useState<ClientState>({ me: null, rooms: [], room: null });
  const [connected, setConnected] = useState(false);
  const [restoring, setRestoring] = useState(Boolean(savedToken()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const locked = useRef(false);

  useEffect(() => {
    const socket = io({ auth: { token: savedToken() }, autoConnect: false });
    socketRef.current = socket;
    socket.on('connect', () => { setConnected(true); setError(''); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => { setConnected(false); setRestoring(false); });
    socket.on('state', (next: ClientState) => { setState(next); setRestoring(false); });
    socket.on('session:replaced', () => setReplaced(true));
    socket.connect();
    return () => { socket.removeAllListeners(); socket.disconnect(); socketRef.current = null; };
  }, []);

  const send = useCallback(async (event: string, payload: object = {}) => {
    if (locked.current) return false;
    const socket = socketRef.current;
    if (!socket?.connected) { setError('연결을 확인하고 다시 눌러 주세요.'); return false; }
    locked.current = true;
    setBusy(true);
    try {
      const result = await socket.timeout(7000).emitWithAck(event, payload);
      if (!result?.ok) { setError(result?.error || '잠시 후 다시 시도해 주세요.'); return false; }
      if (result.token) {
        try { sessionStorage.setItem(TOKEN_KEY, result.token); } catch { /* Private mode can disable storage. */ }
        socket.auth = { token: result.token };
      }
      return true;
    } catch { setError('응답이 늦어지고 있어요. 연결 상태를 확인해 주세요.'); return false; }
    finally { locked.current = false; setBusy(false); }
  }, []);

  const logout = useCallback(() => {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* no storage */ }
    const socket = socketRef.current;
    if (socket) { socket.disconnect(); socket.auth = {}; socket.connect(); }
    setState({ me: null, rooms: [], room: null });
  }, []);
  // The server hangs up on a tab whose seat moved elsewhere; reconnecting takes it back.
  const reconnect = useCallback(() => {
    setReplaced(false);
    socketRef.current?.connect();
  }, []);
  return { ...state, connected, restoring, busy, error, replaced, setError, send, logout, reconnect };
}
