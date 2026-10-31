// What an address can do next, worded once and used in two places: the
// portfolio's "Waiting for you" list and the guide bar under the header.
import { useT } from "../i18n.jsx";
import { fmt } from "../components/liveUtils.js";

// `to` deep-links into the company page: a section, and a treasury tab.
export const WHERE = {
  acceptKey: "#s-election",
  reveal: "?tab=proposals#s-treasury",
  recall: "#s-election",
  elect: "#s-election",
  nominate: "#s-election",
  startElection: "#s-election",
  openVoting: "#s-election",
  countVotes: "#s-election",
  proposal: "?tab=proposals#s-treasury",
  carryOut: "?tab=proposals#s-treasury",
  dividendVote: "?tab=dividends#s-treasury",
  dividend: "?tab=dividends#s-treasury",
  auctionClaim: "?tab=proposals#s-treasury",
};

// Lower comes first: things only you can do (and that expire) before things
// anyone can do to move a listing along.
export const ORDER = {
  acceptKey: 0, reveal: 1, recall: 2, elect: 3, nominate: 4, proposal: 5, dividendVote: 6,
  dividend: 7, auctionClaim: 8, countVotes: 9, openVoting: 10, carryOut: 11, startElection: 12,
};

export function useTodoText() {
  const { t, tn } = useT();
  return (item) => {
    const n = item.weight ?? 0n;
    return {
      acceptKey: t("The project lead named this wallet as the operating key. Accept it to act for the project."),
      reveal: t("Reveal your sealed bid on proposal {id}. An unrevealed bid loses its deposit.", { id: item.proposal?.toString() }),
      recall: tn("Vote on recalling the project lead with {n} unit.", "Vote on recalling the project lead with {n} units.", n),
      elect: tn("Vote in the election with {n} unit.", "Vote in the election with {n} units.", n),
      nominate: tn("Back a candidate in the election with {n} unit.", "Back a candidate in the election with {n} units.", n),
      startElection: t("Half the units are sold, so holders can now elect a project lead. Open the election: anyone can, and it costs only gas."),
      openVoting: t("Candidates have declared. Open the vote: anyone can, and it costs only gas."),
      countVotes: t("The vote has ended. Count the votes to name the project lead: anyone can."),
      proposal: tn("Vote on proposal {id} with {n} unit.", "Vote on proposal {id} with {n} units.", n, { id: item.proposal?.toString() }),
      carryOut: t("Holders approved proposal {id} and its waiting period is over. Carry it out: anyone can.", { id: item.proposal?.toString() }),
      dividendVote: tn("Vote on the dividend for term {term} with {n} unit.", "Vote on the dividend for term {term} with {n} units.", n, { term: item.term }),
      dividend: t("Claim a {amount} UNRIG dividend for term {term}.", { amount: fmt(item.amount ?? 0n, 18, 4), term: item.term }),
      auctionClaim: item.won ? t("Claim what you won on proposal {id}.", { id: item.proposal?.toString() }) : t("Claim back your bid and deposit from proposal {id}.", { id: item.proposal?.toString() }),
    }[item.kind];
  };
}

// Short headline for the guide bar; `name` is the listing's display name.
export function useTodoTitle() {
  const { t } = useT();
  return (item, name) => ({
    acceptKey: t("Accept the operating key for {name}", { name }),
    reveal: t("Reveal your sealed bid in {name}", { name }),
    recall: t("Recall vote in {name}", { name }),
    elect: t("Vote in {name}'s election", { name }),
    nominate: t("Back a candidate in {name}", { name }),
    startElection: t("{name} can elect its project lead", { name }),
    openVoting: t("Open the vote in {name}", { name }),
    countVotes: t("Count the votes in {name}", { name }),
    proposal: t("Vote on a proposal in {name}", { name }),
    carryOut: t("Carry out an approved proposal in {name}", { name }),
    dividendVote: t("Vote on {name}'s dividend", { name }),
    dividend: t("Claim your dividend from {name}", { name }),
    auctionClaim: t("Claim from {name}'s sale", { name }),
  }[item.kind]);
}
