// Server-side chain helpers for the x402 agent endpoint.
// stellar-sdk is imported lazily (only when actually reading the chain) so the
// x402 payment-challenge path works even where the SDK is heavy to bundle.
import { createHash } from "node:crypto";

const FR = BigInt(
  "52435875175126190479447740508185965837690552500527637822603658699938581184513",
);

export function contentToField(text: string): bigint {
  const hex = createHash("sha256").update(text, "utf8").digest("hex");
  return BigInt("0x" + hex) % FR;
}

export function fieldToBytes32(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

export interface ChainCfg {
  attestContractId: string;
  rpcUrl: string;
  networkPassphrase: string;
  readSourcePublicKey: string;
}

import { simulateGetVouches } from "../../lib/shared/getVouches";

// Read-only on-chain query: how many unique humans vouch for this content field element.
export async function getVouchesOnChain(cfg: ChainCfg, contentField: bigint): Promise<number> {
  const StellarSdk: any = await import("@stellar/stellar-sdk");
  const ns: any = StellarSdk.rpc || StellarSdk.SorobanRpc;
  const server = new ns.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith("http://") });
  const account = await server.getAccount(cfg.readSourcePublicKey);
  const result = await simulateGetVouches({
    server,
    account,
    contractId: cfg.attestContractId,
    contentHashBytes: fieldToBytes32(contentField),
    networkPassphrase: cfg.networkPassphrase,
    StellarSdk,
  });
  return Number(result);
}
