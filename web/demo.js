// A labelled replay of actual local-chain receipts. Playback never submits transactions.
(() => {
  const $ = (id) => document.getElementById(id);
  const play = $("btnWatchDemo"), next = $("btnDemoNext"), restart = $("btnDemoRestart");
  if (!play) return;
  let recording, steps = [], cursor = -1, timer;
  const amount = (value) => (Number(BigInt(value)) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
  const memberIndex = (address) => recording.members.findIndex((a) => a.toLowerCase() === address.toLowerCase());
  const memberName = (address) => `Member ${memberIndex(address) + 1}`;
  function pause() { clearInterval(timer); timer = null; play.textContent = cursor === steps.length - 1 ? "Watch again" : cursor < 0 ? "Watch demo · about 45 seconds" : "Continue watching"; }
  function render() {
    const received = recording.members.map(() => 0n);
    let paid = 0n, rounds = 0;
    for (const step of steps.slice(0, cursor + 1)) {
      if (step.kind === "agent-payment") paid += BigInt(step.amount);
      if (step.kind === "round-settled") rounds++;
      if (step.kind === "wallet-received") received[memberIndex(step.member)] += BigInt(step.amount);
    }
    [...$("demoMembers").children].forEach((card, i) => {
      card.querySelector("strong").textContent = `${amount(received[i])} mUSD received`;
      card.classList.toggle("demo-current", cursor >= 0 && memberIndex(steps[cursor].member) === i);
    });
    $("demoPaid").textContent = `${amount(paid)} mUSD`;
    $("demoRounds").textContent = `${rounds} / 3`;
    $("demoProgress").value = cursor + 1;
    $("demoStep").textContent = cursor < 0 ? `Ready · ${steps.length} recorded steps` : `Step ${cursor + 1} of ${steps.length} · local blockchain`;
    next.disabled = cursor === steps.length - 1;
    if (cursor < 0) {
      $("demoEvent").textContent = "A full cycle, from contributions to payouts.";
      $("demoDetail").textContent = "Press Watch demo to replay the real local contract run. Member 1 uses the restricted agent; the other two demo wallets pay their own contributions.";
      $("demoReceipt").textContent = "Press Watch demo to begin.";
      return;
    }
    const step = steps[cursor], who = memberName(step.member);
    if (step.kind === "agent-payment") {
      $("demoEvent").textContent = `The agent pays ${amount(step.amount)} mUSD for ${who}.`;
      $("demoDetail").textContent = `Round ${step.round}: payment comes from the owner’s vault. The contract enforces the approved circle and spending limits.`;
    } else if (step.kind === "member-payment") {
      $("demoEvent").textContent = `${who} contributes ${amount(step.amount)} mUSD.`;
      $("demoDetail").textContent = `Round ${step.round}: this demo member’s wallet pays its own share into the common pot.`;
    } else if (step.kind === "round-settled") {
      $("demoEvent").textContent = `The agent settles round ${step.round}. ${who} takes the turn.`;
      $("demoDetail").textContent = `All three paid. The ${amount(step.amount)} mUSD pot becomes a ${amount(step.payout)} mUSD claimable payout plus a ${amount(step.protocolFee)} mUSD protocol fee.`;
    } else {
      $("demoEvent").textContent = `${amount(step.amount)} mUSD arrives in ${who}’s wallet.`;
      $("demoDetail").textContent = "The demo wallet claims its available credit. That can include a payout, returned collateral, or protocol fees for Member 1, who also owns the treasury.";
    }
    $("demoReceipt").textContent = `Confirmed on local chain 31337\nBlock ${step.blockNumber}\nTransaction ${step.hash}\nFrom ${step.from}\nTo ${step.to}`;
    if (cursor === steps.length - 1) {
      pause();
      $("demoStep").textContent = "Complete · all 3 rounds settled";
      $("demoDetail").textContent = "All nine contributions succeeded. The agent paid 30 mUSD across three rounds. Every payout and remaining collateral was claimed; the circle’s final balance is 0 mUSD.";
    }
  }
  function advance() { if (cursor < steps.length - 1) { cursor++; render(); } }
  play.onclick = () => {
    if (timer) { pause(); return; }
    if (cursor === steps.length - 1) cursor = -1;
    advance();
    if (cursor < steps.length - 1) { play.textContent = "Pause playback"; timer = setInterval(advance, 2500); }
  };
  next.onclick = () => { pause(); advance(); };
  restart.onclick = () => { pause(); cursor = -1; render(); play.textContent = "Watch demo · about 45 seconds"; };
  document.addEventListener("visibilitychange", () => { if (document.hidden && timer) pause(); });
  async function load() {
    try {
      const response = await fetch("demo-recording.json", { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Recording unavailable");
      recording = await response.json();
      if (recording.environment !== "local" || recording.chainId !== 31337 || recording.status !== "completed" || recording.members?.length !== 3) throw new Error("Unrecognized recording");
      steps = recording.transactions.filter((r) => ["member-payment", "agent-payment", "round-settled", "wallet-received"].includes(r.kind));
      if (steps.filter((r) => r.kind === "agent-payment").length !== 3 || steps.filter((r) => r.kind === "round-settled").length !== 3 ||
          steps.some((r) => r.status !== "confirmed" || r.receipt?.status !== 1 || r.receipt.transactionHash !== r.hash || memberIndex(r.member) < 0)) throw new Error("Incomplete recording");
      $("demoProgress").max = steps.length;
      $("demoRecordedAt").textContent = `Recorded ${new Date(recording.completedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}.`;
      play.disabled = false; next.disabled = false; restart.disabled = false; render();
    } catch {
      $("demoStep").textContent = "Recording could not be loaded";
      $("demoDetail").textContent = "Reload this page to retry, or run npm run demo:record locally. The testnet workspace below is separate from this recording.";
    }
  }
  load();
})();
