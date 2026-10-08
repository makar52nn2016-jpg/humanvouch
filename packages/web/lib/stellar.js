// Stellar/Soroban: a built-in browser wallet + submit the attest tx + read vouches.
//
// The wallet is created and held in the browser: a fresh Stellar keypair generated
// on first connect, funded via Friendbot, and persisted in localStorage. No browser
// extension needed — the app spins up a real (testnet) wallet for each visitor and
// signs the attestation with it. (Production can also offer Freighter via the
// Stellar Wallets Kit; the built-in wallet is the zero-friction default.)
import * as StellarSdk from "@stellar/stellar-sdk";
import { hexToBytes } from "./snarkHex.js";

const LS_KEY = "hv_wallet_secret";

function rpc(cfg) {
  const ns = StellarSdk.SorobanRpc || StellarSdk.rpc;
  return new ns.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith("http://") });
}

function loadKeypair() {
  const s = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
  return s ? StellarSdk.Keypair.fromSecret(s) : null;
}

// Create (or restore) the in-browser wallet and return its public key.
// onStatus is called with human-readable progress so the UI can show the handshake.
export async function connectWallet(_cfg, onStatus) {
  const existing = loadKeypair();
  if (existing) {
    onStatus?.("Restoring your wallet…");
    await new Promise((r) => setTimeout(r, 400));
    return existing.publicKey();
  }
  onStatus?.("Generating your keys…");
  const kp = StellarSdk.Keypair.random();
  await new Promise((r) => setTimeout(r, 400));
  onStatus?.("Funding your wallet on testnet…");
  const res = await fetch(`/api/fund?addr=${kp.publicKey()}`);
  if (!res.ok) throw new Error("could not fund the wallet on testnet");
  localStorage.setItem(LS_KEY, kp.secret());
  return kp.publicKey();
}

export async function submitAttest(cfg, _address, proofHex, publicHex) {
  const kp = loadKeypair();
  if (!kp) throw new Error("connect a wallet first");
  const server = rpc(cfg);
  const account = await server.getAccount(kp.publicKey());
  const contract = new StellarSdk.Contract(cfg.attestContractId);
  const op = contract.call(
    "attest",
    StellarSdk.xdr.ScVal.scvBytes(hexToBytes(proofHex)),
    StellarSdk.xdr.ScVal.scvBytes(hexToBytes(publicHex)),
  );
  let tx = new StellarSdk.TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  tx = await server.prepareTransaction(tx);
  tx.sign(kp);
  const sent = await server.sendTransaction(tx);

  let got = await server.getTransaction(sent.hash);
  const start = Date.now();
  while (got.status === "NOT_FOUND" && Date.now() - start < 30000) {
    await new Promise((r) => setTimeout(r, 1500));
    got = await server.getTransaction(sent.hash);
  }
  if (got.status !== "SUCCESS") {
    throw new Error("attest did not succeed: " + got.status);
  }
  return { count: StellarSdk.scValToNative(got.returnValue), hash: sent.hash };
}

import { simulateGetVouches } from "./shared/getVouches";

export async function getVouches(cfg, _sourceAddress, contentHash32) {
  const server = rpc(cfg);
  const account = await server.getAccount(cfg.readSourcePublicKey);
  return simulateGetVouches({
    server,
    account,
    contractId: cfg.attestContractId,
    contentHashBytes: contentHash32,
    networkPassphrase: cfg.networkPassphrase,
    StellarSdk,
  });
}
