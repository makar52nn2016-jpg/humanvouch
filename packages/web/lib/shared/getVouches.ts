/**
 * Shared getVouches helper — single implementation of the get_vouches contract call.
 * Used by both the browser (stellar.js) and the server (chain.ts) to avoid drift.
 */
export interface GetVouchesParams {
  server: any;          // SorobanRpc.Server instance
  account: any;          // Source account object
  contractId: string;
  contentHashBytes: Uint8Array;
  networkPassphrase: string;
  StellarSdk: any;
}

export async function simulateGetVouches(params: GetVouchesParams): Promise<any> {
  const { server, account, contractId, contentHashBytes, networkPassphrase, StellarSdk } = params;
  const contract = new StellarSdk.Contract(contractId);
  const op = contract.call("get_vouches", StellarSdk.xdr.ScVal.scvBytes(contentHashBytes));
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  const ns = StellarSdk.SorobanRpc || StellarSdk.rpc;
  if (ns.Api?.isSimulationError?.(sim) || sim.error) {
    throw new Error(typeof sim.error === "string" ? sim.error : "simulation error");
  }
  return StellarSdk.scValToNative(sim.result.retval);
}
