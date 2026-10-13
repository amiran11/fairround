// Who is looking at the site: everyone gets a read-only connection to the
// chain; connecting MetaMask adds a signer and an address. Components read
// through `provider` either way, and only show actions when `signer` is set.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { connectWallet, getReadProvider, getInvestBalance, getClaimEligibility } from "./web3.js";

export const ZERO = "0x0000000000000000000000000000000000000000";
const WAS_CONNECTED = "sakartvelo_connected";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [readProvider, setReadProvider] = useState(null);
  const [wallet, setWallet] = useState(null); // { provider, signer, address }
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState(null); // { message, mobileNoWallet }
  const [account, setAccount] = useState(null); // { invest, isVerified, alreadyClaimed }
  const [version, setVersion] = useState(0); // bumped after every confirmed transaction

  useEffect(() => {
    getReadProvider().then(setReadProvider).catch(() => setReadProvider(null));
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const w = await connectWallet();
      setWallet(w);
      try { localStorage.setItem(WAS_CONNECTED, "1"); } catch { /* storage blocked */ }
      return w;
    } catch (err) {
      setConnectError({ message: err.message || "Couldn't connect the wallet.", mobileNoWallet: !!err.isMobileNoWallet });
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet(null);
    setAccount(null);
    try { localStorage.removeItem(WAS_CONNECTED); } catch { /* storage blocked */ }
  }, []);

  // Reconnect quietly on return visits if MetaMask already trusts the site.
  useEffect(() => {
    let wasConnected = false;
    try { wasConnected = localStorage.getItem(WAS_CONNECTED) === "1"; } catch { /* storage blocked */ }
    if (!wasConnected || !window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then((accts) => {
      if (accts && accts.length) connect();
    }).catch(() => {});
  }, [connect]);

  // Follow account switches in MetaMask (governor ↔ operating key).
  useEffect(() => {
    if (!wallet || !window.ethereum?.on) return;
    const onAccounts = (accts) => { if (!accts || !accts.length) disconnect(); else connect(); };
    const onChain = () => connect();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged", onChain);
    };
  }, [wallet, connect, disconnect]);

  const provider = wallet?.provider || readProvider;

  useEffect(() => {
    if (!wallet) return;
    let live = true;
    Promise.all([getInvestBalance(wallet.address, wallet.provider), getClaimEligibility(wallet.address, wallet.provider)])
      .then(([invest, e]) => { if (live) setAccount({ invest, isVerified: e.isVerified, alreadyClaimed: e.alreadyClaimed }); })
      .catch(() => {});
    return () => { live = false; };
  }, [wallet, version]);

  const changed = useCallback(() => setVersion((v) => v + 1), []);

  const value = useMemo(() => ({
    provider,
    signer: wallet?.signer || null,
    address: wallet?.address || null,
    me: wallet?.address || ZERO, // for "my" reads before anyone connects
    connected: !!wallet,
    connect, disconnect, connecting, connectError,
    account,
    version, changed,
  }), [provider, wallet, connect, disconnect, connecting, connectError, account, version, changed]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
