import { useState } from "react";
import { useT } from "../i18n.jsx";
import { useSession } from "../session.jsx";
import { getEthBalance, normalizeAddress } from "../web3.js";
import {
  ZERO, governancePhase, getElection, getRecall,
  openCandidacy, declareCandidacy, nominate, withdrawCandidacy, openVoting, vote, tallyRound,
  setOperatingKey, acceptOperatingKey, openRecall, voteRecall, resolveRecall,
} from "./chain.js";
import { int, pct, same, useChain, useCountdown, useTx } from "../components/liveUtils.js";
import { Act, Address, Button, ConnectToAct, ErrorLine, Field, Input, Loading, Muted, Notice, Textarea } from "../components/ui.jsx";

const MAX_PROGRAM_BYTES = 4500;
const PREVIEW = 360;
const LOW_GAS_WEI = 200000000000000n;
const eth = (wei) => (Number(wei) / 1e18).toFixed(4);

function Program({ text }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  if (!text) return <p className="candidate-program muted">{t("No program written.")}</p>;
  const long = text.length > PREVIEW;
  return (
    <>
      <p className="candidate-program">{open || !long ? text : text.slice(0, PREVIEW).trimEnd() + "…"}</p>
      {long && <button type="button" className="btn btn-plain btn-small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t("Show less") : t("Read the whole program")}</button>}
    </>
  );
}

// ------------------------------------------------------------ candidacy

function Candidacy({ company, e }) {
  const { t, tn } = useT();
  const { signer, address } = useSession();
  const tx = useTx();
  const [program, setProgram] = useState("");
  const closes = useCountdown(e.candidacyEnd);
  const bytes = new TextEncoder().encode(program).length;
  const mine = e.candidates.find((c) => same(c.address, address));
  const minStake = (e.electorate * 10n + 9999n) / 10000n;

  return (
    <div className="stack">
      <p>
        {t("Candidates are declaring. This stage closes in {time}; then anyone can open voting.", { time: closes.label })}{" "}
        {t("Holders of at least 0.1% of the shares can stand with a written program. Every holder can back one candidate with their shares: the 20 with the most backing make the ballot.")}
      </p>
      {e.candidates.length === 0 ? <Muted>{t("No candidates yet.")}</Muted> : (
        <ul className="list" aria-label={t("Candidates")}>
          {e.candidates.map((c) => (
            <li key={c.address} className="candidate">
              <div className="spread">
                <span><Address value={c.address} /> {c.onBallot ? <span className="stamp" style={{ marginLeft: 8 }}>{t("On the ballot")}</span> : <span className="small muted"> {t("Not on the ballot yet")}</span>}</span>
                <span className="small num">{tn("backed by {n} share", "backed by {n} shares", c.support)} ({pct(c.support, e.electorate)})</span>
              </div>
              <Program text={c.program} />
              {signer && !e.nominated && !same(c.address, address) && e.myWeight > 0n && (
                <div style={{ marginTop: 8 }}>
                  <Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => nominate(signer, company.id, c.address))}>
                    {tn("Back this candidate with {n} share", "Back this candidate with {n} shares", e.myWeight)}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!signer ? <ConnectToAct what={t("Connect a wallet to stand or to back a candidate.")} /> : (
        <>
          {e.nominated && !mine && <Notice tone="ok">{t("You've backed a candidate in this election.")}</Notice>}
          {mine && (
            <Notice tone="ok" title={t("You're a candidate")}>
              {mine.support === mine.stake ? (
                <Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => withdrawCandidacy(signer, company.id))}>{t("Withdraw my candidacy")}</Button>
              ) : t("Others have backed you, so you can't withdraw.")}
            </Notice>
          )}
          {!mine && !e.nominated && (e.myWeight >= minStake && e.myWeight > 0n ? (
            <Act title={t("Stand for CEO")}>
              <Field label={t("Your program")} hint={t("{used} of {max} bytes, about 700 words. It can't be changed after you declare. Declaring backs yourself with your shares.", { used: int(bytes), max: int(MAX_PROGRAM_BYTES) })}>
                <Textarea value={program} onChange={(ev) => setProgram(ev.target.value)} placeholder={t("What you'll do with the company: priorities, how you'd use the treasury, dividends or reinvestment.")} />
              </Field>
              <Button busy={tx.busy} disabled={!program.trim() || bytes > MAX_PROGRAM_BYTES} onClick={() => tx.run(() => declareCandidacy(signer, company.id, program))}>{t("Declare candidacy")}</Button>
            </Act>
          ) : e.myWeight === 0n ? (
            <Muted small>{t("You held no shares in this company a day before the election opened, so you can't stand or back a candidate in it.")}</Muted>
          ) : (
            <Muted small>{t("To stand you need {need}; you have {have}. You can still back a candidate.", { need: tn("{n} share", "{n} shares", minStake), have: int(e.myWeight) })}</Muted>
          ))}
        </>
      )}
      <ErrorLine error={tx.error} />
    </div>
  );
}

// ------------------------------------------------------------ voting

function Voting({ company, e, phase }) {
  const { t, tn } = useT();
  const { signer } = useSession();
  const tx = useTx();
  const closes = useCountdown(e.voteEnd);
  const ballot = e.candidates.filter((c) => c.onBallot);
  const standing = ballot.filter((c) => !c.eliminated).sort((a, b) => (b.votes > a.votes ? 1 : b.votes < a.votes ? -1 : 0));
  const out = ballot.filter((c) => c.eliminated);
  const quorum = (e.electorate * 2000n + 9999n) / 10000n;
  const canVote = signer && phase === "voting" && e.myWeight > 0n && !e.voted;

  return (
    <div className="stack">
      <p>
        {phase === "voting" ? t("Voting closes in {time}.", { time: closes.label }) : t("Voting has closed. Anyone can count the votes.")}{" "}
        {t("To win, a candidate needs the votes of at least 20% of the shares ({q}) and 51% of the votes cast; with only two candidates left, more votes than the other and than “against all” is enough. Otherwise the top two go to a runoff, or the round fails; two failed rounds end the election.", { q: int(quorum) })}
      </p>
      {e.failedRounds > 0n && <p className="small muted">{tn("{n} round has failed so far.", "{n} rounds have failed so far.", e.failedRounds)}</p>}
      <p className="small muted num">{t("{cast} of {total} shares have voted.", { cast: int(e.cast), total: int(e.electorate) })}</p>

      {!signer ? <ConnectToAct what={phase === "voting" ? t("Connect a wallet to vote.") : t("Connect a wallet to count the votes.")} />
        : phase === "voting" ? (
          e.voted ? <Notice tone="ok">{t("You've voted in this round.")}</Notice>
            : e.myWeight > 0n ? <Notice>{tn("You can vote with {n} share. Read the programs, then choose one candidate, or vote against all.", "You can vote with {n} shares. Read the programs, then choose one candidate, or vote against all.", e.myWeight)}</Notice>
              : <Muted small>{t("You held no shares a day before this election opened, so you can't vote in it.")}</Muted>
        ) : (
          <Act title={t("Count the votes")}>
            <p className="small">{t("This elects a CEO, starts a runoff between the top two, or records a failed round.")}</p>
            <Button busy={tx.busy} onClick={() => tx.run(() => tallyRound(signer, company.id))}>{t("Count the votes")}</Button>
          </Act>
        )}

      <ul className="list" aria-label={t("Ballot")}>
        {standing.map((c) => (
          <li key={c.address} className="candidate">
            <div className="spread">
              <Address value={c.address} />
              <span className="small num strong">{tn("{n} vote", "{n} votes", c.votes)}{e.cast > 0n ? ` (${pct(c.votes, e.cast)})` : ""}</span>
            </div>
            <Program text={c.program} />
            {canVote && <div style={{ marginTop: 8 }}><Button small busy={tx.busy} onClick={() => tx.run(() => vote(signer, company.id, c.address))}>{t("Vote for this candidate")}</Button></div>}
          </li>
        ))}
        <li className="candidate">
          <div className="spread">
            <span className="strong">{t("Against all")}</span>
            <span className="small num strong">{tn("{n} vote", "{n} votes", e.against)}{e.cast > 0n ? ` (${pct(e.against, e.cast)})` : ""}</span>
          </div>
          <p className="small muted">{t("A vote that none of these candidates should govern.")}</p>
          {canVote && <div style={{ marginTop: 8 }}><Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => vote(signer, company.id, ZERO))}>{t("Vote against all")}</Button></div>}
        </li>
        {out.map((c) => (
          <li key={c.address} className="candidate out"><Address value={c.address} /> <span className="small muted">{t("Out of the running")}</span></li>
        ))}
      </ul>
      <ErrorLine error={tx.error} />
    </div>
  );
}

// ------------------------------------------------------------ governor and recall

function KeyForm({ governor, companyName, busy, onSubmit }) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const [problem, setProblem] = useState("");
  const submit = async () => {
    setProblem("");
    const addr = await normalizeAddress(input);
    if (!addr || addr === ZERO) return setProblem(t("That isn't a wallet address. Copy it again from MetaMask."));
    if (same(addr, governor)) return setProblem(t("That's your CEO account. Add a separate account in MetaMask and use its address."));
    onSubmit(addr);
  };
  return (
    <div className="stack-sm">
      <ol className="small">
        <li>{t("In MetaMask, choose “Add account” and name it, for example, “{name} operating key”.", { name: companyName })}</li>
        <li>{t("Copy the new account's address and paste it below, then name it here.")}</li>
        <li>{t("Send that account a little ETH on Arbitrum One for gas. 0.001 ETH is plenty for a term.")}</li>
        <li>{t("Switch MetaMask to the new account, open this page, and accept.")}</li>
      </ol>
      <Field label={t("Operating key address")}>
        <Input value={input} onChange={(ev) => setInput(ev.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} />
      </Field>
      {problem && <p className="error-line">{problem}</p>}
      <Button busy={busy} disabled={!input.trim()} onClick={submit}>{t("Name this operating key")}</Button>
    </div>
  );
}

function Recall({ company }) {
  const { t, tn } = useT();
  const { signer, me } = useSession();
  const [r, err] = useChain((p) => getRecall(company.id, me, p), [company.id, me]);
  const tx = useTx();
  const closes = useCountdown(r?.voteEnd ?? 0);
  if (!r) return err ? <ErrorLine error={err} /> : null;
  const open = r.id && !r.resolved && !closes.passed;
  const toResolve = r.id && !r.resolved && closes.passed;
  const canOpen = r.canOpenWeight > 0n && r.canOpenWeight * 10000n >= r.electorateNow * 100n;
  const turnout = r.id ? (r.electorate * 3300n + 9999n) / 10000n : 0n;

  return (
    <div className="stack-sm" style={{ marginTop: 24 }}>
      <h3 className="h3">{t("Recall")}</h3>
      {open ? (
        <>
          <p>{t("A vote to remove the CEO is open and closes in {time}. It passes if a third of the shares vote ({q}) and 51% of the votes say remove.", { time: closes.label, q: int(turnout) })}</p>
          <p className="small muted num">{t("Remove {y}, keep {n}.", { y: int(r.yes), n: int(r.no) })}</p>
          {signer && !r.voted && r.myWeight > 0n && (
            <div className="row-tight">
              <Button small busy={tx.busy} onClick={() => tx.run(() => voteRecall(signer, company.id, true))}>{tn("Remove the CEO ({n} share)", "Remove the CEO ({n} shares)", r.myWeight)}</Button>
              <Button small kind="secondary" busy={tx.busy} onClick={() => tx.run(() => voteRecall(signer, company.id, false))}>{t("Keep the CEO")}</Button>
            </div>
          )}
          {signer && r.voted && <Muted small>{t("You've voted on this recall.")}</Muted>}
        </>
      ) : toResolve ? (
        <>
          <p>{r.passes ? t("The recall vote has closed and passed. Anyone can carry it out, which ends the term now.") : t("The recall vote has closed without passing. Anyone can close it.")}</p>
          {signer && <div><Button busy={tx.busy} onClick={() => tx.run(() => resolveRecall(signer, company.id))}>{r.passes ? t("Remove the CEO") : t("Close the recall")}</Button></div>}
        </>
      ) : (
        <>
          <Muted small>{t("Shareholders can remove a CEO before the term ends. A holder of at least 1% of the shares opens a 3-day vote. While a recall is open, payments that fall due wait for it.")}</Muted>
          {signer && canOpen && <div><Button kind="secondary" busy={tx.busy} onClick={() => tx.run(() => openRecall(signer, company.id))}>{t("Open a recall vote")}</Button></div>}
        </>
      )}
      <ErrorLine error={tx.error} />
    </div>
  );
}

function Governed({ company, g }) {
  const { t } = useT();
  const { signer, address } = useSession();
  const tx = useTx();
  const term = useCountdown(g.termEnd);
  const [keyBal] = useChain((p) => (g.opKey !== ZERO ? getEthBalance(g.opKey, p) : Promise.resolve(null)), [g.opKey]);
  const iAmGov = same(g.governor, address);
  const iAmKey = same(g.opKey, address);
  const iAmPending = same(g.pendingKey, address);
  const low = keyBal !== null && keyBal < LOW_GAS_WEI;

  return (
    <div className="stack">
      <dl className="facts">
        <div><dt>{t("CEO")}</dt><dd><Address value={g.governor} /></dd></div>
        <div><dt>{t("Operating key")}</dt><dd>{g.opKey !== ZERO ? <Address value={g.opKey} /> : g.pendingKey !== ZERO ? t("Waiting for acceptance") : t("Not registered yet")}</dd></div>
        <div><dt>{t("Term")}</dt><dd>{t("Term {n}, ends in {time}", { n: g.termNum.toString(), time: term.label })}</dd></div>
      </dl>
      <Muted small>{t("The CEO proposes; shareholders decide. Payments, sales and investments are proposals in the treasury section, each with its own vote.")}</Muted>

      {iAmKey && (
        <Notice tone="ok" title={t("This wallet is the operating key of {name}", { name: company.name })}>
          {t("Gas balance: {n} ETH.", { n: eth(keyBal ?? 0n) })} {low && t("That's low. Send this account some ETH on Arbitrum One before acting.")}
        </Notice>
      )}
      {iAmPending && (
        <Act title={t("Accept the operating key")}>
          <p className="small">{t("The CEO named this wallet as the operating key of {name}. Accepting lets it sign CEO actions until the term ends.", { name: company.name })}</p>
          <Button busy={tx.busy} onClick={() => tx.run(() => acceptOperatingKey(signer, company.id))}>{t("Accept")}</Button>
        </Act>
      )}
      {iAmGov && (
        <Act title={g.opKey === ZERO ? t("You're elected. Name an operating key to act this term.") : t("Replace the operating key")}>
          {g.pendingKey !== ZERO && <p className="small">{t("Waiting for {addr} to accept.", { addr: `${g.pendingKey.slice(0, 6)}…${g.pendingKey.slice(-4)}` })}</p>}
          {g.opKey !== ZERO && <p className="small">{t("Use this if the key is lost or may be compromised. The old key keeps working until the new one accepts.")}</p>}
          <KeyForm governor={g.governor} companyName={company.name} busy={tx.busy} onSubmit={(addr) => tx.run(() => setOperatingKey(signer, company.id, addr))} />
        </Act>
      )}
      <ErrorLine error={tx.error} />
      <Recall company={company} />
    </div>
  );
}

// ------------------------------------------------------------ section

export default function Election({ company }) {
  const { t } = useT();
  const { signer, me } = useSession();
  const phase = governancePhase(company);
  const g = company.gov;
  const needsElection = ["candidacy", "readyToVote", "voting", "count"].includes(phase);
  const [e, err] = useChain((p) => (needsElection ? getElection(company.id, me, p) : Promise.resolve(null)), [company.id, me, needsElection, g.election.round.toString()]);
  const tx = useTx();

  if (phase === "notYet") {
    return <Muted>{t("Elections open once half of the shares are sold: {n} more to go.", { n: int((company.totalShares + 1n) / 2n - company.sharesIssued) })}</Muted>;
  }
  if (phase === "governed") return <Governed company={company} g={g} />;

  if (phase === "canOpen" || phase === "termOver") {
    return (
      <div className="stack">
        <p>
          {phase === "termOver" ? t("Term {n} is over.", { n: g.termNum.toString() }) : t("Half of the shares are sold, so the company can elect a CEO.")}{" "}
          {t("Anyone can open the election: 5 days for candidates to declare and be backed, then 3 days of voting. Shares count as they were one day before it opens.")}
        </p>
        {signer ? (
          <div>
            <Button busy={tx.busy} onClick={() => tx.run(() => openCandidacy(signer, company.id))}>{t("Open the election")}</Button>
            <ErrorLine error={tx.error} />
          </div>
        ) : <ConnectToAct what={t("Connect a wallet to open the election. It costs only gas.")} />}
      </div>
    );
  }

  if (!e) return err ? <ErrorLine error={err} /> : <Loading />;
  if (phase === "candidacy") return <Candidacy company={company} e={e} />;
  if (phase === "readyToVote") {
    return (
      <div className="stack">
        <p>{e.ballotSize > 0 ? t("The candidacy stage is over. Anyone can open voting, which runs for 3 days.") : t("The candidacy stage ended with no one on the ballot. Opening voting closes this election, and a new one can be opened.")}</p>
        {signer ? (
          <div>
            <Button busy={tx.busy} onClick={() => tx.run(() => openVoting(signer, company.id))}>{e.ballotSize > 0 ? t("Open voting") : t("Close this election")}</Button>
            <ErrorLine error={tx.error} />
          </div>
        ) : <ConnectToAct what={t("Connect a wallet to open voting.")} />}
        {e.candidates.length > 0 && (
          <ul className="list">
            {e.candidates.filter((c) => c.onBallot).map((c) => <li key={c.address} className="candidate"><Address value={c.address} /><Program text={c.program} /></li>)}
          </ul>
        )}
      </div>
    );
  }
  return <Voting company={company} e={e} phase={phase} />;
}
