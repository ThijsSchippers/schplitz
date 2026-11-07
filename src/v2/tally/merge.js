// Validated incoming updates and verification against complete local logs.
import { SchplitzError, MAX_MEMBERS_COMBINED, checkPayload, FLAG_LEGACY, FLAG_PROVISIONAL } from "../schema.js";
import { logOf, entryOf, putEntry, replaceLog, paymentState, foldLog, canonical } from "./log.js";

const summaryFrom = ({ s, h, n, nl, c, f, tn }) => ({ s, h, n, c, ...(nl ? { nl } : {}), ...(f ? { f } : {}), ...(tn ? { tn } : {}) });
const v1Ids = (entries) => new Set(entries.map(entry => entry.l).filter(Boolean));

/**
 * Merges a decrypted link payload into the tally. Validates it first.
 * Summaries: per writer, the highest seq wins. Entries: added if new.
 * Converted v1 history: provisional copies never override; the owner's version
 * replaces a provisional copy.
 *
 * @returns report: newEntries, involvingMe (new payments that include me),
 *   replaced (v1 copies replaced: added/removed v1 IDs), review (my v1 entries the
 *   sender lacked, or that the sender has but I deleted), conflicts.
 */
export function mergePayload(tally, payload) {
  checkPayload(payload);
  const newMembers = payload.m.filter(([id]) => !tally.members.some(m => m.id === id));
  if (tally.members.length + newMembers.length > MAX_MEMBERS_COMBINED) throw new SchplitzError("invalid-payload", "Too many members");
  for (const [id, name] of newMembers) tally.members.push({ id, name });

  const report = { newEntries: [], involvingMe: [], conflicts: [], replaced: [], review: [], newPhones: [] };
  const skip = new Set();
  // Someone writing from a new writer while an earlier phone of theirs has history: a new
  // or wiped phone. Their balance is restored by any link; older line items need a full copy.
  const hasHistory = (member) => Object.values(tally.writers).some(writer => writer.member === member && !writer.legacy && writer.summary.s > 0);
  for (const [writerId, receivedWriter] of Object.entries(payload.w)) {
    if (!tally.writers[writerId] && !(receivedWriter.fl & FLAG_LEGACY) &&
        receivedWriter.m !== tally.me.member && hasHistory(receivedWriter.m) &&
        !report.newPhones.includes(receivedWriter.m)) {
      report.newPhones.push(receivedWriter.m);
    }
  }
  const incomingV1Ids = (writerId) => new Set(payload.pl?.[writerId] ?? v1Ids(payload.e.filter(entry => entry.w === writerId)));
  for (const [writerId, receivedWriter] of Object.entries(payload.w)) {
    const incoming = summaryFrom(receivedWriter);
    const legacy = Boolean(receivedWriter.fl & FLAG_LEGACY), provisional = Boolean(receivedWriter.fl & FLAG_PROVISIONAL);
    const known = tally.writers[writerId];

    if (!known) {
      tally.writers[writerId] = { member: receivedWriter.m, summary: incoming, legacy, provisional };
      continue;
    }
    if (known.member !== receivedWriter.m) {
      report.conflicts.push({ writer: writerId, reason: "writer claimed by another member" });
      skip.add(writerId);
      continue;
    }
    if (writerId === tally.me.writer) {
      if (receivedWriter.s > known.summary.s) report.conflicts.push({ writer: writerId, reason: "someone else wrote as this phone" });
      skip.add(writerId);
      continue;
    }
    if (provisional) {
      // Someone's copy of an old v1 history never overrides what this phone has.
      skip.add(writerId);
      if (!known.provisional && known.member === tally.me.member) {
        const mine = v1Ids(logOf(tally, writerId)), theirs = incomingV1Ids(writerId);
        report.review.push({ writer: writerId,
          theyMiss: [...mine].filter(l => !theirs.has(l)),     // kept; ask me to confirm
          iDeleted: [...theirs].filter(l => !mine.has(l)) });  // stays deleted
      }
      continue;
    }
    if (known.provisional) {
      skip.add(writerId);
      if (receivedWriter.h === known.summary.h && receivedWriter.s === known.summary.s) {
        // The owner's version is exactly this phone's copy (e.g. they adopted it): keep the entries.
        known.provisional = false;
        report.replaced.push({ writer: writerId, added: [], removed: [] });
        continue;
      }
      // The owner's own version of an old v1 history replaces this phone's copy.
      const before = v1Ids(logOf(tally, writerId)), after = incomingV1Ids(writerId);
      replaceLog(tally, writerId, payload.e.filter(entry => entry.w === writerId));
      tally.writers[writerId] = { member: receivedWriter.m, summary: incoming, legacy, provisional: false };
      report.replaced.push({ writer: writerId, added: [...after].filter(l => !before.has(l)), removed: [...before].filter(l => !after.has(l)) });
      continue;
    }
    if (receivedWriter.s > known.summary.s) {
      known.summary = incoming;
    } else if (receivedWriter.s === known.summary.s && receivedWriter.h !== known.summary.h) {
      report.conflicts.push({ writer: writerId, reason: "two different histories" });
    }
  }

  for (const entry of payload.e) {
    if (skip.has(entry.w) || entryOf(tally, entry.w, entry.s)) continue;
    putEntry(tally, entry);
    report.newEntries.push(entry);
  }
  report.involvingMe = report.newEntries.filter(entry => {
    const writer = tally.writers[entry.w];
    return entry.t === "pay" && !writer.legacy && writer.member !== tally.me.member &&
      paymentState(tally, entry.w, entry.s)?.p.includes(tally.me.member);
  });
  return report;
}

/**
 * For every writer whose complete log is on this phone, recomputes its summary and
 * compares it with the one held. Returns the writers that don't match: a bug,
 * corruption, or a forged summary. A writer using entry types from a newer app
 * version can also show up here, because this version ignores those entries.
 */
export async function verify(tally) {
  const problems = [];
  for (const [writerId, { member, summary }] of Object.entries(tally.writers)) {
    const log = logOf(tally, writerId);
    if (!log.length || log.length !== summary.s || log[log.length - 1].s !== summary.s) continue;
    const ours = await foldLog(member, log);
    if (canonical(summaryFrom(ours)) !== canonical(summaryFrom(summary))) problems.push(writerId);
  }
  return problems;
}
