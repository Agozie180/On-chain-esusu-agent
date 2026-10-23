// Agent-side client for 402 APIs: asks, gets a quote, pays from the owner's capped vault, retries with proof.
//   const report = await fetchPaid(url, { vault, maxPrice: 2_000_000n });
// `vault` is an ethers Contract for AgentAllowance connected to the AGENT signer. The chain, not this code, enforces the caps.
async function fetchPaid(url, { vault, maxPrice, fetchImpl = fetch }) {
  const first = await fetchImpl(url);
  if (first.status !== 402) return first.json();
  const q = await first.json();
  if (!q.payee || !q.amount || !q.ref) throw new Error("402 response without a payment quote: " + JSON.stringify(q));
  const amount = BigInt(q.amount);
  if (maxPrice !== undefined && amount > BigInt(maxPrice)) throw new Error(`quote ${amount} exceeds the agent's own max price ${maxPrice}; not paying`);
  const rc = await (await vault.payService(q.payee, amount, q.ref)).wait();
  const second = await fetchImpl(url, { headers: { "x-payment-tx": rc.hash, "x-payment-ref": q.ref } });
  const body = await second.json();
  if (second.status !== 200) throw new Error(`payment sent (${rc.hash}) but the server refused: ${body.error}`);
  return { ...body, _payment: { tx: rc.hash, amount: amount.toString(), payee: q.payee } };
}
module.exports = { fetchPaid };
