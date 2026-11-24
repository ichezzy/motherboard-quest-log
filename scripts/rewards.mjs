/**
 * Rewards: hand them out to the party or to single characters.
 *
 * Items go into the inventory (stacked if the actor has the same item already), currency goes
 * into Daggerheart's gold slots. The quest remembers what everyone got (`rewards.received`) -
 * that is all players ever see of the rewards. A chat message tells the table.
 * Opens by itself when the GM sets a quest with rewards to "completed".
 */
import { PAGE_TYPE, CURRENCY_KEYS } from "./constants.mjs";
import { hasRewards, rewardPlan, itemLabel, currencyLabel, escapeHtml } from "./logic.mjs";

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

const DEFAULT_LABELS = { coins: "Coins", handfuls: "Handfuls", bags: "Bags", chests: "Chests" };

/**
 * The currency slots switched on in Daggerheart's Homebrew setting, with their names.
 * @returns {Array<{key: string, label: string, icon: string}>}
 */
export function currencies() {
  let currency = null;
  try {
    const id = CONFIG.DH?.id ?? game.system.id;
    const key = CONFIG.DH?.SETTINGS?.gameSettings?.Homebrew ?? "Homebrew";
    currency = game.settings.get(id, key)?.currency ?? null;
  } catch { /* another system */ }
  return CURRENCY_KEYS
    .map(key => ({ key, label: currency?.[key]?.label || DEFAULT_LABELS[key], icon: currency?.[key]?.icon || "", enabled: currency?.[key]?.enabled !== false }))
    .filter(c => c.enabled);
}

/**
 * Who can get rewards: Daggerheart's active party (if there is one) and the player characters -
 * the party's members, else every character a player owns.
 */
export function recipients() {
  const party = game.actors.party ?? null;
  const members = (party?.system.partyMembers ?? []).filter(actor => actor?.type === "character");
  const characters = members.length
    ? members
    : game.actors.filter(actor => actor.type === "character" && actor.hasPlayerOwner);
  return { party, characters };
}

/** Into the inventory: stacked onto the same item if the actor can stack it, else as copies. */
async function giveItem(actor, source, quantity) {
  const data = source.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.ownership;
  const stackable = data.system && "quantity" in data.system
    && !actor.system.metadata?.unquantifiable?.includes(data.type);
  if (stackable) {
    const same = actor.items.find(i => i.type === data.type && i.name === data.name);
    if (same) return same.update({ "system.quantity": (same.system.quantity ?? 0) + quantity });
    data.system.quantity = quantity;
    return actor.createEmbeddedDocuments("Item", [data]);
  }
  return actor.createEmbeddedDocuments("Item", Array.from({ length: quantity }, () => foundry.utils.deepClone(data)));
}

/** The dialog's form: one picker per item and per currency. */
function dialogContent(rewards, money, { party, characters }) {
  const option = (value, label, selected) =>
    `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
  const actorOptions = fallback => [party, ...characters].filter(Boolean)
    .map(actor => option(actor.id, actor.name, actor.id === fallback)).join("");
  const first = party?.id ?? characters[0]?.id;

  const rows = [];
  for (const item of rewards.items) {
    rows.push(`<div class="form-group">
      <label><img class="mql-reward-img" src="${escapeHtml(item.img || "icons/svg/item-bag.svg")}" alt=""> ${escapeHtml(itemLabel(item))}</label>
      <select name="item.${item.id}">${actorOptions(first)}</select>
    </div>`);
  }
  for (const c of money) {
    const amount = rewards.currency[c.key];
    if (!(amount > 0)) continue;
    const split = characters.length ? option("split", L("MQL.HandOut.Split"), !party) : "";
    rows.push(`<div class="form-group">
      <label>${c.icon ? `<i class="${escapeHtml(c.icon)}" inert></i> ` : ""}${amount} ${escapeHtml(c.label)}</label>
      <select name="currency.${c.key}">${party ? option(party.id, party.name, true) : ""}${split}${characters.map(a => option(a.id, a.name, false)).join("")}</select>
    </div>`);
  }
  const text = rewards.text?.trim()
    ? `<p class="mql-hand-out-text"><strong>${L("MQL.HandOut.AlsoTell")}</strong> ${escapeHtml(rewards.text)}</p>` : "";
  return `<p class="hint">${L("MQL.HandOut.Hint")}</p>${rows.join("")}${text}`;
}

/**
 * Hand out the rewards of a quest (GM only, once).
 * @param {JournalEntryPage} page
 */
export async function handOutRewards(page) {
  if (!game.user.isGM) return;
  const rewards = page.system.rewards;
  if (rewards.handedOut) {
    ui.notifications.warn("MQL.HandOut.Already", { localize: true });
    return;
  }
  if (!hasRewards(rewards)) {
    ui.notifications.warn("MQL.HandOut.Nothing", { localize: true });
    return;
  }
  const who = recipients();
  const needsActor = rewards.items.length || Object.values(rewards.currency).some(n => n > 0);
  if (needsActor && !who.party && !who.characters.length) {
    ui.notifications.warn("MQL.HandOut.NoRecipients", { localize: true });
    return;
  }

  const money = currencies();
  let data = null;
  try {
    data = await foundry.applications.api.DialogV2.input({
      window: { title: F("MQL.HandOut.Title", { quest: page.name }), icon: "fa-solid fa-gift" },
      position: { width: 460 },
      classes: ["mql-hand-out"],
      content: dialogContent(rewards, money, who),
      ok: { label: L("MQL.HandOut.Give"), icon: "fa-solid fa-gift" },
      rejectClose: false
    });
  } catch {
    return;
  }
  if (!data) return;
  const form = foundry.utils.expandObject(data);

  const plan = rewardPlan(rewards, { items: form.item ?? {}, currency: form.currency ?? {} }, {
    party: who.party?.id ?? null,
    characters: who.characters.map(a => a.id)
  });

  const received = [];
  for (const [actorId, share] of plan) {
    const actor = game.actors.get(actorId);
    if (!actor) continue;
    const given = [];
    for (const item of share.items) {
      const source = item.uuid ? await fromUuid(item.uuid) : null;
      if (!source) {
        ui.notifications.warn(F("MQL.HandOut.Missing", { name: item.name }));
        continue;
      }
      await giveItem(actor, source, item.quantity);
      given.push(itemLabel(item));
    }
    if (Object.keys(share.currency).length) {
      const update = {};
      for (const [key, amount] of Object.entries(share.currency)) {
        update[`system.gold.${key}`] = (actor.system.gold?.[key] ?? 0) + amount;
      }
      await actor.update(update);
      given.push(currencyLabel(share.currency, money));
    }
    if (given.length) received.push({ actor: actor.name, text: given.join(", ") });
  }

  await page.update({ "system.rewards.handedOut": true, "system.rewards.received": received });

  const lines = received.map(r => `<li><strong>${escapeHtml(r.actor)}:</strong> ${escapeHtml(r.text)}</li>`).join("");
  const text = rewards.text?.trim() ? `<p>${escapeHtml(rewards.text)}</p>` : "";
  await ChatMessage.implementation.create({
    speaker: { alias: L("MQL.Title") },
    content: `<div class="mql-chat-rewards"><h3><i class="fa-solid fa-gift" inert></i> ${escapeHtml(F("MQL.HandOut.Chat", { quest: page.name }))}</h3>${lines ? `<ul>${lines}</ul>` : ""}${text}</div>`
  });
}

/** Let the rewards be handed out again (e.g. after a mistake - nothing is taken back). */
export function resetHandOut(page) {
  if (!game.user.isGM) return;
  return page.update({ "system.rewards.handedOut": false, "system.rewards.received": [] });
}

export function registerRewards() {
  // Completed with rewards left: open the hand-out right away (only for the GM who did it).
  Hooks.on("updateJournalEntryPage", (page, changes, options, userId) => {
    if (page.type !== PAGE_TYPE || userId !== game.user.id || !game.user.isGM) return;
    if (changes.system?.status !== "completed") return;
    const rewards = page.system.rewards;
    if (!rewards.handedOut && hasRewards(rewards)) handOutRewards(page);
  });
}
