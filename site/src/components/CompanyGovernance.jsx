import { useState } from "react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import {
  getCompanyGovernance, getCandidates, getMyShareCount, getMyVoteWeight, getElectionRules, hasVotedThisRound,
  declareCandidacyReal, openGovernanceVoteReal, voteReal, tallyRoundReal, setOperatingKeyReal, startNewTermReal,
  getEthBalance, normalizeAddress,
} from "../web3.js";
import { ZERO, same, int, pct, useChain, useCountdown, useTx } from "./liveUtils.js";
import { Act, Address, Button, ConnectToAct, ErrorLine, Field, Input, Loading, Muted, Notice, Textarea } from "./ui.jsx";

const LOW_GAS_WEI = 200000000000000n; // 0.0002 ETH: about enough for a few transactions
const MAX_PROGRAM_BYTES = 4500;
const PREVIEW = 360;
const eth = (wei) => (Number(wei) / 1e18).toFixed(4);

async function loadGovernance(companyId, me, provider) {
  const [g, candidates, myShares, rules] = await Promise.all([
    getCompanyGovernance(companyId, provider),
    getCandidates(companyId, provider),
    getMyShareCount(companyId, me, provider),
    getElectionRules(provider),
  ]);
  const [myWeight, myVoted, keyBalance] = await Promise.all([
    getMyVoteWeight(companyId, me, g, provider),
    g.round > 0n ? hasVotedThisRound(companyId, g.round, me, provider) : false,
    g.operatingKey !== ZERO ? getEthBalance(g.operatingKey, provider) : null,
  ]);
  return { g, candidates, myShares, rules, myWeight, myVoted, keyBalance };
}

// The governor registers a second MetaMask account as this term's
// operating key. Only its address is entered; no key is ever handled here.
function OperatingKeyForm({ governor, companyName, busy, onSubmit, submitLabel }) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const [problem, setProblem] = useState("");
  const submit = async () => {
    setProblem("");
    const addr = await normalizeAddress(input);
    if (!addr || addr === ZERO) return setProblem(t("That isn't a wallet address. Copy it again from MetaMask."));
    if (same(addr, governor)) return setProblem(t("That's your governor account. Add a separate account in MetaMask and use its address."));
    onSubmit(addr);
  };
  return (
    <div className="stack-sm">
      <ol className="small">
        <li>{t("In MetaMask, choose “Add account” and name it, for example, “{name} operating key”.", { name: companyName })}</li>
        <li>{t("Copy the new account's address and paste it below.")}</li>
        <li>{t("Send that account a little ETH on Arbitrum One for gas. 0.001 ETH is plenty for a term.")}</li>
        <li>{t("Switch MetaMask back to this governor account and register.")}</li>
      </ol>
      <Field label={t("Operating key address")}>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} />
      </Field>
      {problem && <p className="error-line">{problem}</p>}
      <Button busy={busy} disabled={!input.trim()} onClick={submit}>{submitLabel}</Button>
    </div>
  );
}

function Candidate({ c, sharesIssued, showVotes, totalVotes, children }) {
  const { t, tn } = useT();
  const [open, setOpen] = useState(false);
  const program = c.program || "";
  const long = program.length > PREVIEW;
  const shown = open || !long ? program : program.slice(0, PREVIEW).trimEnd() + "…";
  return (
    <li className={`candidate${c.eliminated ? " out" : ""}`}>
      <div className="spread">
        <div>
          <Address value={c.address} />
          <span className="small muted"> {t("holds {n} ({p})", { n: tn("{n} share", "{n} shares", c.stake), p: pct(c.stake, sharesIssued) })}</span>
          {c.eliminated && <span className="small muted"> {t("Out of the running")}</span>}
        </div>
        {showVotes && !c.eliminated && (
          <span className="small num strong">{tn("{n} vote", "{n} votes", c.votes)}{totalVotes > 0n ? ` (${pct(c.votes, totalVotes)})` : ""}</span>
        )}
      </div>
      <p className={`candidate-program${program ? "" : " muted"}`}>{program ? shown : t("No program written.")}</p>
      {long && <button type="button" className="btn btn-plain btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t("Show less") : t("Read the whole program")}</button>}
      {children && <div style={{ marginTop: 8 }}>{children}</div>}
    </li>
  );
}

function CandidacyForm({ company, data }) {
  const { t, tn } = useT();
  const { signer } = useSession();
  const [program, setProgram] = useState("");
  const { busy, error, run } = useTx();
  const bytes = new TextEncoder().encode(program).length;
  const minStake = (company.sharesIssued * data.rules.minStakeBps + 9999n) / 10000n;
  if (BigInt(data.candidates.length) >= data.rules.maxCandidates) {
    return <Muted small>{t("All {n} candidate places are taken.", { n: int(data.rules.maxCandidates) })}</Muted>;
  }
  if (data.myShares < minStake) {
    return (
      <Muted small>
        {t("To stand for governor you need {need}, which is 0.1% of the shares issued so far. You hold {have}.", { need: tn("{n} share", "{n} shares", minStake), have: int(data.myShares) })}
      </Muted>
    );
  }
  return (
    <Act title={t("Stand for governor")}>
      <Field label={t("Your program")} hint={t("{used} of {max} bytes, about 700 words. It can't be changed after you declare.", { used: int(bytes), max: int(MAX_PROGRAM_BYTES) })}>
        <Textarea value={program} onChange={(e) => setProgram(e.target.value)} placeholder={t("What you'll do with the company: priorities, how you'd use the treasury, dividends or reinvestment.")} />
      </Field>
      <Button busy={busy} disabled={!program.trim() || bytes > MAX_PROGRAM_BYTES} onClick={() => run(() => declareCandidacyReal(signer, company.id, program))}>
        {t("Declare candidacy")}
      </Button>
      <ErrorLine error={error} />
    </Act>
  );
}

export default function CompanyGovernance({ company }) {
  const { t, tn } = useT();
  const { signer, address, me } = useSession();
  const eligible = company.sharesIssued * 2n >= company.totalShares;
  const [data, loadError] = useChain((p) => (eligible ? loadGovernance(company.id, me, p) : Promise.resolve(null)), [company.id, me, eligible]);
  const { busy, error, run } = useTx();
  const [replacing, setReplacing] = useState(false);
  const voting = useCountdown(data?.g.voteEnd ?? 0n);
  const term = useCountdown(data?.g.termEnd ?? 0n);

  if (!eligible) {
    return (
      <Muted>
        {t("Elections open once half of the shares are sold: {n} more to go.", { n: int((company.totalShares + 1n) / 2n - company.sharesIssued) })}
      </Muted>
    );
  }
  if (!data) return loadError ? <ErrorLine error={loadError} /> : <Loading />;

  const { g, candidates, myShares, myWeight, myVoted, keyBalance } = data;
  const hasGovernor = g.governor !== ZERO;
  const hasKey = g.operatingKey !== ZERO;
  const iAmGovernor = same(g.governor, address);
  const iAmKey = hasKey && same(g.operatingKey, address);
  const iAmCandidate = candidates.some((c) => same(c.address, address));
  const lowGas = keyBalance !== null && keyBalance < LOW_GAS_WEI;
  const registerKey = (addr) => run(() => setOperatingKeyReal(signer, company.id, addr), () => setReplacing(false));
  const byVotes = [...candidates].sort((a, b) => (b.votes > a.votes ? 1 : b.votes < a.votes ? -1 : 0));
  const standing = candidates.filter((c) => !c.eliminated);

  // ------------------------------------------------ governed
  if (hasGovernor) {
    return (
      <div className="stack">
        <dl className="facts">
          <div><dt>{t("Governor")}</dt><dd><Address value={g.governor} /></dd></div>
          <div><dt>{t("Operating key")}</dt><dd>{hasKey ? <Address value={g.operatingKey} /> : t("Not registered yet")}</dd></div>
          <div><dt>{t("Term")}</dt><dd>{term.passed ? t("Term {n} is over", { n: g.termNum.toString() }) : t("Term {n}, ends in {time}", { n: g.termNum.toString(), time: term.label })}</dd></div>
        </dl>
        <Muted small>{t("The governor acts for the company through the operating key, a separate wallet registered for this term only. Governor tools are in the treasury section.")}</Muted>

        {iAmKey && !term.passed && (
          <Notice tone="ok" title={t("This wallet is the operating key of {name}", { name: company.name })}>
            {t("Gas balance: {n} ETH.", { n: eth(keyBalance ?? 0n) })} {lowGas && t("That's low. Send this account some ETH on Arbitrum One before acting.")}
          </Notice>
        )}

        {iAmGovernor && !term.passed && !hasKey && (
          <Act title={t("You're elected. Register an operating key to act this term.")}>
            <OperatingKeyForm governor={g.governor} companyName={company.name} busy={busy} onSubmit={registerKey} submitLabel={t("Register operating key")} />
            <ErrorLine error={error} />
          </Act>
        )}
        {iAmGovernor && !term.passed && hasKey && (
          <Act title={t("You're the governor")}>
            <p className="small">{t("Switch MetaMask to your operating key ({addr}) to use the governor tools. Its gas balance is {n} ETH.", { addr: `${g.operatingKey.slice(0, 6)}…${g.operatingKey.slice(-4)}`, n: eth(keyBalance ?? 0n) })}</p>
            {lowGas && <p className="small error-line">{t("That's low. Send it some ETH before acting.")}</p>}
            {!replacing ? (
              <Button kind="secondary" small onClick={() => setReplacing(true)}>{t("Replace the operating key")}</Button>
            ) : (
              <>
                <p className="small">{t("Use this if the key is lost or may be compromised. The old key stops working the moment the new one is registered.")}</p>
                <OperatingKeyForm governor={g.governor} companyName={company.name} busy={busy} onSubmit={registerKey} submitLabel={t("Register the new key")} />
              </>
            )}
            <ErrorLine error={error} />
          </Act>
        )}

        {term.passed && (signer ? (
          <Act title={t("Start the next election")}>
            <p className="small">{t("The term is over. Anyone can reset the company for a new election; candidates then declare again.")}</p>
            <Button busy={busy} onClick={() => run(() => startNewTermReal(signer, company.id))}>{t("Start the next election")}</Button>
            <ErrorLine error={error} />
          </Act>
        ) : <ConnectToAct what={t("The term is over. Connect a wallet to start the next election.")} />)}
      </div>
    );
  }

  // ------------------------------------------------ candidacy
  if (g.round === 0n) {
    return (
      <div className="stack">
        <p>
          {g.termNum === 0n ? t("First election.") : t("Election for term {n}.", { n: (g.termNum + 1n).toString() })}{" "}
          {t("Shareholders with at least 0.1% of the shares issued can stand, with a written program. Voting opens when anyone opens it; after that nobody new can stand.")}
        </p>
        {candidates.length === 0 ? <Muted>{t("No candidates yet.")}</Muted> : (
          <ul className="list" aria-label={t("Candidates")}>
            {candidates.map((c) => <Candidate key={c.address} c={c} sharesIssued={company.sharesIssued} />)}
          </ul>
        )}
        {!signer ? <ConnectToAct what={t("Connect a wallet to stand as a candidate or open voting.")} /> : (
          <>
            {myShares > 0n && !iAmCandidate && <CandidacyForm company={company} data={data} />}
            {myShares === 0n && <Muted small>{t("You hold no shares in this company, so you can't stand. You can still open voting.")}</Muted>}
            {candidates.length > 0 && (
              <Act title={t("Open voting")}>
                <p className="small">{t("Voting runs for 3 days. Wait until everyone who wants to stand has declared: once it opens, the list is closed.")}</p>
                <Button busy={busy} onClick={() => run(() => openGovernanceVoteReal(signer, company.id))}>{t("Open voting")}</Button>
                <ErrorLine error={error} />
              </Act>
            )}
          </>
        )}
      </div>
    );
  }

  // ------------------------------------------------ voting / counting
  const runoff = standing.length === 2 && candidates.length > 2;
  return (
    <div className="stack">
      <p>
        {!voting.passed
          ? t(runoff ? "Runoff: voting closes in {time}." : "Voting closes in {time}.", { time: voting.label })
          : g.totalVotesCast === 0n ? t("Voting closed with no votes. Counting reopens it for another 3 days.") : t("Voting has closed. Anyone can count the votes.")}{" "}
        {t("A candidate with 51% of the votes cast wins; with only two left, the one ahead wins. Otherwise the top two go to a runoff. Each wallet votes with the shares it held when the round opened.")}
      </p>
      <p className="small muted num">{tn("{n} share has voted so far.", "{n} shares have voted so far.", g.totalVotesCast)}</p>
      {!signer ? (
        <ConnectToAct what={voting.passed ? t("Connect a wallet to count the votes.") : t("Connect a wallet to vote.")} />
      ) : !voting.passed ? (
        myVoted ? <Notice tone="ok">{tn("You voted in this round with {n} share.", "You voted in this round with {n} shares.", myWeight)}</Notice>
          : myWeight > 0n ? <Notice>{tn("You can vote with {n} share. Read the programs, then choose one candidate.", "You can vote with {n} shares. Read the programs, then choose one candidate.", myWeight)}</Notice>
            : myShares > 0n ? <Muted small>{t("Your shares arrived after this round opened, so they count from the next round.")}</Muted>
              : <Muted small>{t("You hold no shares in this company, so you can't vote.")}</Muted>
      ) : (
        <Act title={g.totalVotesCast === 0n ? t("Reopen voting") : t("Count the votes")}>
          <p className="small">{g.totalVotesCast === 0n ? t("Nobody voted, so counting reopens voting for 3 more days.") : t("This elects a governor or starts a runoff between the top two.")}</p>
          <Button busy={busy} onClick={() => run(() => tallyRoundReal(signer, company.id))}>{g.totalVotesCast === 0n ? t("Reopen voting") : t("Count the votes")}</Button>
          <ErrorLine error={error} />
        </Act>
      )}
      <ul className="list" aria-label={t("Candidates")}>
        {byVotes.map((c) => (
          <Candidate key={c.address} c={c} sharesIssued={company.sharesIssued} showVotes totalVotes={g.totalVotesCast}>
            {signer && !voting.passed && !c.eliminated && myWeight > 0n && !myVoted && (
              <Button small busy={busy} onClick={() => run(() => voteReal(signer, company.id, c.address))}>{t("Vote for this candidate")}</Button>
            )}
          </Candidate>
        ))}
      </ul>
      <ErrorLine error={!voting.passed ? error : null} />
    </div>
  );
}
