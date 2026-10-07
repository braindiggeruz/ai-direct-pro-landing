// Safety for a children's audience (spec §7.4; measured in T0.1, MEASURE-30 §7).
//
// 1. The topic: a NARROW refusal list (sexual content, self-harm, drug or
//    weapon instructions, hate). Ordinary school topics pass: «Davlat
//    ramzlari», «Konstitutsiya», «Ikkinchi jahon urushi», «Amir Temur», a
//    talk on the harm of drugs. Z.ai's own refusal (1301) is the second net
//    (llm.ts). Llama Guard is not used on topics: it knows neither Uzbek nor
//    Russian. A topic that tries to write the image prompts itself
//    («… image_prompt: …», «har bir rasm …») is refused too ("prompt"): the
//    topic reaches the model, and the pictures must come from the slides.
// 2. Image prompts: WIDE word lists. A prompt with people, anything Flux
//    turns into writing, state symbols or war, the words T0.1 caught drawing
//    such things (EXTRA), a few Uzbek / transliterated Russian words, or a
//    proper name outside the list of places is dropped, and the next slide's
//    prompt is used instead (MEASURE-30 §9). Dropping, not rewriting: a
//    rewritten prompt no longer says what the slide is about. After those
//    measured stages, three more (2026-10 review): a prompt that is not
//    plain English (non-ASCII, foreign function or people words, or no
//    English function word at all), people as stems inside other words
//    (schoolgirl, toddler, teenage, farmer …) and bodies or swimwear, and
//    self-harm objects (noose, gallows, razor, pills …). The picture check
//    has no key for a self-harm object without a person, so the words are
//    the net for it.
// 3. Llama Guard 3 8B, ONE call over all prompts of a job. Any category S1–S14,
//    an unreadable answer or a failed call drops every picture of the job
//    (the text still goes out). Only the category reaches the ledger.
// 4. Flux gets the positive style tail A: it has no negative prompt, and
//    «no people, no text» drew 1.5× more people and text (MEASURE-30 §7.2).
// 5. The finished picture: the vision model answers CHECK_PROMPT_V2; any
//    true, a missing key or an unreadable answer means the picture is not
//    handed out (one redraw, then the slide goes without, spec §7.4).
// 6. A refused topic does not cost a unit; the same subject asking the same
//    topic again within 10 minutes gets the same refusal without a model
//    call (an isolate-memory cache keyed by an HMAC, no D1).
import type { Env } from "../../_types";
import { DECK_SHAPES } from "./plans";
import { TAIL_A } from "./prompts";
import { PROMPT_GUARD_MODEL } from "./pricing";
import { hex, hmacBytes } from "./sign";

// ── 1. Topics ───────────────────────────────────────────────────────────────

export type TopicCategory = "sexual" | "self_harm" | "drugs" | "weapons" | "hate" | "prompt";

export type TopicVerdict = { readonly ok: true } | { readonly ok: false; readonly category: TopicCategory };

/** Lower case, NFC, one apostrophe sign, single spaces: what the lists below match. */
export function screeningText(text: string): string {
  return text.normalize("NFC").toLowerCase().replace(/[‘’'`ʻʼ]/g, "'").replace(/\s+/g, " ").trim();
}

const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
const words = (list: readonly string[]) => new RegExp(`${START}(?:${list.join("|")})`, "u");
const wholeWords = (list: readonly string[]) => new RegExp(`${START}(?:${list.join("|")})${END}`, "u");

/** Explicit sexual content: always refused. «Jinsiy tarbiya», «Ko‘payish tizimi» pass. */
const SEXUAL: readonly RegExp[] = [
  words(["porn", "порн", "erotik", "erotic", "эрот", "hentai", "nsfw", "интим", "jinsiy aloqa", "половой акт", "половые сношени"]),
  wholeWords(["sex", "sexy", "sexual\\p{L}*", "seks", "seksual\\p{L}*", "секс", "секси", "сексуальн\\p{L}*", "xxx", "nude", "naked", "nudity", "обнажен\\p{L}*", "обнажён\\p{L}*", "голая", "голые"]),
];

/** Self-harm and suicide, whatever the framing: not a subject for a generated deck for children. */
const SELF_HARM: readonly RegExp[] = [
  words([
    "suitsid", "suicid", "суицид", "самоубийств", "самоповрежд", "self[- ]?harm", "селфхарм",
    "o'z joniga qasd", "o'zini o'ldir", "o'zini jarohatla", "покончить с собой", "убить себя", "kill (?:myself|yourself)",
  ]),
  // The objects of it (a noose drawn for a children's deck), whole words only.
  wholeWords(["noose", "nooses", "osilish", "petlya", "verevka", "висельн\\p{L}*"]),
];

/**
 * A topic that writes the image prompts itself instead of naming a subject:
 * «Yozgi ta‘til. image_prompt: …», «Har bir rasm: …», «каждый промпт …».
 */
const PROMPT_STEERING: readonly RegExp[] = [
  /image[\s_-]*prompt/u,
  new RegExp(`${START}(?:prompt|promt|промпт)\\p{L}*\\s*[:=]`, "u"),
  // «Har bir rasm: …», «every image should …», «каждый промпт — …»; «Har bir rasmning tarixi» is a topic.
  new RegExp(
    `${START}(?:har bir|each|every|all|каждый|каждой|каждая|kazhdyj|kazhdoj)\\s+(?:image|picture|rasm|surat|prompt|promt|промпт|картинк|изображени|kartink)\\p{L}*`
      + `\\s*(?:[:=—–-]|(?:should|must|kerak|bo'lsin|bo'ladi|должн|пусть|show)${END})`,
    "u",
  ),
];

const DRUG_TERMS = words([
  "narkotik", "giyohvand", "kokain", "geroin", "marixuana", "marihuana", "marijuana", "gashish", "hashish", "nasha",
  "amfetamin", "metamfetamin", "ekstazi", "ecstasy", "lsd", "spays", "наркот", "кокаин", "героин", "марихуан", "гашиш",
  "амфетамин", "метамфетамин", "мефедрон", "экстази", "спайс", "cocaine", "heroin", "cannabis",
]);
/** Short English names, whole words only («methods» is no drug). */
const DRUG_WORDS = wholeWords(["meth", "weed", "drugs?"]);
/** How to make, get or use: the instruction that turns a drug topic into a refusal. */
const DRUG_HOW = words([
  "tayyorla", "yasa", "sotib ol", "qayerdan", "yetishtir", "retsept", "qanday (?:chek|ich|qabul|tayyorla|yasa|iste'mol)", "iste'mol qilish (?:usul|yo'l)",
  "как (?:сделать|приготовить|изготовить|купить|достать|употреблять|курить|вырастить|колоть)", "где (?:купить|взять|достать)",
  "рецепт", "синтез", "своими руками", "в домашних условиях",
  "how to (?:make|cook|buy|get|grow|use|smoke|inject)", "where to buy", "recipe", "synthes",
]);
/** Drug-shop slang is refused on its own. */
const DRUG_ALWAYS = words(["закладк", "zakladk"]);

const WEAPON_TERMS = words([
  "bomba", "portlovchi", "qurol", "to'pponcha", "granata", "porox", "molotov",
  "бомб", "взрывчат", "взрывн", "оружи", "пистолет", "обрез", "гранат", "порох", "самопал",
]);
/** English ones, whole words only («gunoh», «guncha» are Uzbek words). */
const WEAPON_WORDS = wholeWords(["bombs?", "explosives?", "guns?", "weapons?", "grenades?", "gunpowder", "pipe bombs?", "rifles?", "pistols?"]);
/** Making it: «Qurol-yarog‘ tarixi» passes, «bomba yasash» does not. */
const WEAPON_HOW = words([
  "yasa", "tayyorla", "uyda", "qanday yasa",
  "как (?:сделать|изготовить|собрать|приготовить)", "изготовлени", "своими руками", "в домашних условиях", "самодельн",
  "how to (?:make|build|craft|assemble)", "homemade", "diy",
]);

/** Slurs and praise of hatred, narrow on purpose: history and «terrorizmga qarshi kurash» pass. */
const HATE: readonly RegExp[] = [
  wholeWords(["жид\\p{L}*", "хач\\p{L}*", "чурк\\p{L}*", "нигер\\p{L}*", "ниггер\\p{L}*", "черномаз\\p{L}*", "узкоглаз\\p{L}*", "nigger\\p{L}*", "nigga\\p{L}*", "kike\\p{L}*", "faggot\\p{L}*"]),
  words([
    "слава гитлеру", "sieg heil", "zig heil", "гитлер (?:был прав|прав|герой|молодец)", "hitler (?:haqli|qahramon|was right)",
    "нацизм (?:хорошо|прав)", "уничтожить (?:евреев|русских|узбеков|таджиков|казахов|киргизов|армян|цыган)",
  ]),
  new RegExp(`${START}\\p{L}+lar(?:ni)? o'lsin${END}`, "u"),
];

/**
 * «… haqida taqdimot tayyorlash» is how people ask for a deck, not for a
 * recipe: the making of the deck itself is taken out before the «how to
 * make» lists are read.
 */
const MAKING_THE_DECK = new RegExp(
  `${START}(?:taqdimot|slayd|prezentatsiya|referat|plakat|ma'ruza|презентаци\\p{L}*|доклад\\p{L}*|плакат\\p{L}*|presentation|slides?)\\s+`
    + `(?:tayyorla\\p{L}*|yasa\\p{L}*|сделать|подготовить|составить|make|making|prepare)`,
  "gu",
);

/**
 * The narrow topic check (spec §7.4 item 1). A refusal carries only its
 * category: the endpoint answers 422 topic_refused {category} with no content.
 */
export function screenTopic(topic: string): TopicVerdict {
  const text = screeningText(topic);
  const asked = text.replace(MAKING_THE_DECK, " ");
  if (SEXUAL.some((pattern) => pattern.test(text))) return { ok: false, category: "sexual" };
  if (SELF_HARM.some((pattern) => pattern.test(text))) return { ok: false, category: "self_harm" };
  if (DRUG_ALWAYS.test(text) || ((DRUG_TERMS.test(text) || DRUG_WORDS.test(text)) && DRUG_HOW.test(asked)))
    return { ok: false, category: "drugs" };
  if ((WEAPON_TERMS.test(text) || WEAPON_WORDS.test(text)) && WEAPON_HOW.test(asked)) return { ok: false, category: "weapons" };
  if (HATE.some((pattern) => pattern.test(text))) return { ok: false, category: "hate" };
  if (PROMPT_STEERING.some((pattern) => pattern.test(text))) return { ok: false, category: "prompt" };
  return { ok: true };
}

/** The topic as the input MAC and the refusal cache see it: NFC, trimmed, single spaces, lower case (spec §2.4). */
export function normalizeTopic(topic: string): string {
  return topic.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

// ── 6. Refusals remembered for 10 minutes ────────────────────────────────────

export const REFUSAL_TTL_MS = 600_000;

/** Isolate memory only: lost on a new isolate, never written to D1. */
export class RefusalCache {
  private readonly entries = new Map<string, { category: string; until: number }>();

  constructor(private readonly ttlMs = REFUSAL_TTL_MS, private readonly maxEntries = 2000) {}

  get(key: string, now = Date.now()): string | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.until <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.category;
  }

  set(key: string, category: string, now = Date.now()): void {
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      // Oldest first: a Map iterates in insertion order.
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { category, until: now + this.ttlMs });
  }

  get size(): number {
    return this.entries.size;
  }
}

export const topicRefusals = new RefusalCache();

/** The cache key of (subject, topic): 32 hex of HMAC(GPT_IDENTITY_SECRET, "studio-refusal-v1:" …). Never the topic itself. */
export async function refusalKey(secret: string, subject: string, topic: string): Promise<string> {
  return hex(await hmacBytes(secret, `studio-refusal-v1:${subject}\n${normalizeTopic(topic)}`)).slice(0, 32);
}

// ── 2. Image prompts ────────────────────────────────────────────────────────

// measure30.py, verbatim: each word may take -s / -es.
const PEOPLE = "man|men|woman|women|boy|girl|person|people|face|portrait|crowd|soldier|king|president|poet|ruler|emperor|sultan|scholar|scientist|student|pupil|child|children|kid|teacher|warrior|statue|monument|silhouette|hand|hands";
const TEXTY = "map|chalkboard|blackboard|diagram|chart|arrow|label|sign|poster|book page|text|letters|caption|screen|whiteboard|infographic|manuscript|page|scroll|newspaper|calendar|clock|coin|banknote|keyboard|calculator|book";
const STATE = "flag|coat of arms|emblem|anthem|election|war|battle|army|weapon|gun|sword|tank";
/** images_summary.py EXTRA: words whose pictures broke the rules in T0.1 (artillery, museum portraits, lettered blocks, shop signs …). */
const EXTRA = "block|blocks|tile|tiles|cube|cubes|scrabble|scale|scales|store|shop|supermarket|market|bazaar|museum|street|streets|square|city|town|crowd|artillery|cannon|cannons|helmet|helmets|military|missile|rifle|bomb|soldiers?|army|uniform|factory|workers?|classroom|laboratory|lab";
/** Uzbek and transliterated Russian words for the same things, should a prompt slip out of English. */
const TRANSLIT = "odam|odamlar|inson|ayol|erkak|bola|bolalar|o'quvchi|talaba|o'qituvchi|shoir|askar|podshoh|haykal|bayroq|gerb|qurol|xarita|yozuv|kitob|urush|chelovek|lyudi|zhenshchina|muzhchina|rebenok|deti|soldat|oruzhie|karta|tekst";

const F_PEOPLE = new RegExp(`\\b(${PEOPLE})(e?s)?\\b`, "i");
const F_TEXT = new RegExp(`\\b(${TEXTY})(e?s)?\\b`, "i");
const F_STATE = new RegExp(`\\b(${STATE})(e?s)?\\b`, "i");
const F_EXTRA = new RegExp(`\\b(${EXTRA})\\b`, "i");
const F_TRANSLIT = new RegExp(`(?<![\\p{L}'])(${TRANSLIT})(?![\\p{L}'])`, "iu");

/**
 * Capitalised words a prompt may carry: measure30.py PLACES (places and sky
 * objects) plus the region's own places. Any other capitalised word after
 * the first is a proper name, and a name draws its person, its sign or its
 * flag (T0.1's last violation was a flag at the Neva, «Saint Petersburg»).
 */
export const PROMPT_PLACES: ReadonlySet<string> = new Set([
  "Uzbekistan", "Samarkand", "Bukhara", "Khiva", "Tashkent", "Registan", "Silk", "Road", "Central", "Asia", "Asian",
  "Amu", "Syr", "Darya", "Aral", "Sea", "Kyzylkum", "Fergana", "Valley", "Earth", "Sun", "Moon", "Mars", "Jupiter",
  "Saturn", "Venus", "Mercury", "Uranus", "Neptune", "Herat", "Shahrisabz", "Ak-Saray", "Chorvoq", "Tian", "Shan", "I",
  "Tien", "Kyrgyzstan", "Tajikistan", "Kazakhstan", "Turkmenistan", "Karakalpakstan", "Zarafshan", "Chimgan", "Pamir",
  "Nukus", "Termez", "Kokand", "Andijan", "Namangan",
]);

/** Places named after a person, allowed only as the whole name (never «Amir» alone). */
export const PROMPT_PLACE_NAMES: readonly string[] = ["Gur-e Amir", "Gur-e-Amir", "Gur Emir", "Bibi-Khanym", "Bibi Khanym"];

// The stages after the measured ones (2026-10 review). Words are matched in
// lower case; a stem may sit inside another word («schoolgirl», «babysitter»).

/** English words nearly every English prompt of more than two words has. */
const ENGLISH_GLUE = new Set(
  ("a an the of on in at by to from with without into onto over under above below beneath behind beside between among around across "
    + "along against near through toward towards up down out off inside outside within during for and or as its their this that these those is are")
    .split(" "),
);
/** Function and people words of the other Latin-script languages a prompt could slip into (fr, es, it, pt, de, tr, uz). */
const FOREIGN = new RegExp(
  `(?<![a-z])(?:${[
    "une?", "les?", "la", "des", "du", "sur", "avec", "dans", "et", "femmes?", "hommes?", "filles?", "gar[cç]ons?", "enfants?", "nue?s?", "b[ée]b[ée]s?", "plage",
    "el", "los", "las", "una", "con", "y", "en", "mujer(?:es)?", "hombres?", "ni[nñ][oa]s?", "desnud[oa]s?", "playa",
    "il", "della?", "sulla", "donna", "donne", "uomo", "uomini", "bambin[oiae]", "nud[oaie]", "spiaggia",
    "uma?", "com", "mulher(?:es)?", "crian[cç]as?", "praia",
    "der", "das", "und", "mit", "eine?", "einen", "frau(?:en)?", "m[aä]nner", "kinder", "m[aä]dchen", "nackt\\w*",
    "bir", "ve", "kad[ıi]n", "[cç]ocuk\\w*", "[cç]plak", "plaj",
    "va", "bilan", "ustida", "ichida", "qiz\\w*", "o'?g'?il\\w*", "yalang'?och\\w*", "dengiz", "sohil\\w*",
  ].join("|")})(?![a-z])`,
  "i",
);
/** People as stems (inside other words too), and a person by their work. */
const PEOPLE_STEMS = new RegExp(
  [
    "girl", "boy(?!cott)", "child", "toddler", "infant", "bab(?:y|ies)", "(?<![a-z])lad(?:y|ies)(?!bug|bird)", "female", "human", "people", "person",
    "(?<![a-z])teen", "(?<![a-z])kids?(?![a-z])", "(?<![a-z])males?(?![a-z])", "(?<![a-z])bod(?:y|ies)(?![a-z])", "(?<![a-z])figures?(?![a-z])",
    "famil(?:y|ies)", "mother(?!board)", "father", "(?<![a-z])parents?(?![a-z])", "grand(?:ma|pa|mother|father|parent)", "daughter", "(?<![a-z])sons?(?![a-z])", "brother", "sister",
    "farmer", "fisher(?:man|men)", "crafts(?:man|men)", "horse(?:man|men)", "(?<![a-z])potters?(?![a-z])", "weaver", "merchant", "trader", "shepherd",
    "herder", "hunter", "builder", "(?<![a-z])miners?(?![a-z])", "sailor", "doctor", "(?<![a-z])nurses?(?![a-z])", "astronaut", "(?<![a-z])pilots?(?![a-z])",
    "(?<![a-z])chefs?(?![a-z])", "(?<![a-z])bakers?(?![a-z])", "blacksmith", "artisan", "dancer", "musician", "athlete", "(?<![a-z])players?(?![a-z])", "villager",
    "citizen", "tourist", "travel+er", "pilgrim", "(?<![a-z])monks?(?![a-z])", "priest", "(?<![a-z])imams?(?![a-z])", "(?<![a-z])nomads?(?![a-z])",
    "(?<![a-z])riders?(?![a-z])", "knight", "(?<![a-z])guards?(?![a-z])", "police", "officer", "(?<![a-z])judges?(?![a-z])", "(?<![a-z])brides?(?![a-z])",
    "(?<![a-z])grooms?(?![a-z])", "(?<![a-z])mumm(?:y|ies)(?![a-z])", "(?<![a-z])dolls?(?![a-z])",
  ].join("|"),
  "i",
);
/** Bodies, nudity, swimwear and bathing. */
const EXPOSURE = new RegExp(
  ["nude", "naked", "nudity", "(?<![a-z])nue?s?(?![a-z])", "topless", "bikini", "swim", "underwear", "lingerie", "bath", "(?<!meteor )shower",
    "breast", "sexy", "sensual", "erotic", "(?<![a-z])kiss"].join("|"),
  "i",
);
/** Self-harm objects: the picture check has no key for them when no person is drawn. */
const SELF_HARM_OBJECTS = new RegExp(
  ["noose", "gallows", "hangman", "hanging rope", "rope (?:loop|knot) hang", "razor", "(?:knife|sharp) blades?", "scalpel", "(?<![a-z])pills?(?![a-z])",
    "tablets? (?:spill|scatter|pile)", "overdose", "syringe", "suicid", "self[- ]?harm", "(?<![a-z])wrists?(?![a-z])", "poison"].join("|"),
  "i",
);

export type PromptDrop =
  | "empty"
  | "people"
  | "text"
  | "state"
  | "extra"
  | "translit"
  | "proper_name"
  | "not_english"
  | "people_stem"
  | "exposure"
  | "self_harm";

/** A prompt the English lists can read: printable ASCII, no foreign words, and English glue when it is longer than two words. */
function plainEnglish(text: string): boolean {
  if (!/^[\x20-\x7E]+$/.test(text)) return false;
  const lower = text.toLowerCase();
  if (FOREIGN.test(lower)) return false;
  const words = lower.match(/[a-z]+/g) ?? [];
  return words.length <= 2 || words.some((word) => ENGLISH_GLUE.has(word));
}

/**
 * Why the image prompt is dropped, or null when it may be drawn. The first
 * seven stages are the measured ones, in MEASURE-30 §7.5's order (their
 * counts are pinned by the tests); the last four come after them.
 */
export function imagePromptDrop(prompt: string): PromptDrop | null {
  const text = prompt.trim();
  if (!text) return "empty";
  if (F_PEOPLE.test(text)) return "people";
  if (F_TEXT.test(text)) return "text";
  if (F_STATE.test(text)) return "state";
  if (F_EXTRA.test(text)) return "extra";
  if (F_TRANSLIT.test(text.replace(/[‘’`ʻʼ]/g, "'"))) return "translit";
  const named = PROMPT_PLACE_NAMES.reduce((rest, place) => rest.split(place).join("place"), text);
  const tokens = named.match(/[A-Za-z][\w-]*/g) ?? [];
  if (tokens.some((word, i) => i > 0 && /^[A-Z]/.test(word) && !PROMPT_PLACES.has(word))) return "proper_name";
  if (PEOPLE_STEMS.test(text)) return "people_stem";
  if (EXPOSURE.test(text)) return "exposure";
  if (SELF_HARM_OBJECTS.test(text)) return "self_harm";
  // Last: a prompt the English lists above cannot read is dropped whatever it says.
  if (!plainEnglish(text)) return "not_english";
  return null;
}

/**
 * The prompts to draw: in slide order, the first `cap` that pass
 * imagePromptDrop (a dropped one gives its place to the next slide).
 */
export function pickImagePrompts(
  slides: ReadonlyArray<{ readonly index: number; readonly imagePrompt: string }>,
  cap: number,
): Array<{ index: number; prompt: string }> {
  const picked: Array<{ index: number; prompt: string }> = [];
  for (const slide of slides) {
    if (picked.length >= cap) break;
    if (imagePromptDrop(slide.imagePrompt) === null) picked.push({ index: slide.index, prompt: slide.imagePrompt.trim() });
  }
  return picked;
}

/** What Flux is asked: the prompt plus the positive style tail A. */
export function fluxPrompt(prompt: string): string {
  return `${prompt}${TAIL_A}`;
}

/** Pictures, timing and redraws of a job (MEASURE-30 §0, §7.1; spec §7.5). */
export const IMAGE_RULES = {
  /** Handed out at most: 2 free, 8 full. */
  perDeck: { free: DECK_SHAPES.free.images, full: DECK_SHAPES.full.images },
  /** Flux calls in flight per job. */
  concurrency: 4,
  /** After the outline is ready, pictures not drawn by then are skipped (one outage took a deck to 249 s). */
  deadlineAfterOutlineMs: 35_000,
  /** One Flux call. */
  fluxTimeoutMs: 20_000,
  /** A failed or refused picture is redrawn once, then the slide goes without one. */
  redraws: 1,
  steps: 4,
} as const;

// ── 3. Llama Guard over a job's prompts ──────────────────────────────────────

/** The part of the AI binding this file uses; env.AI fits it (aiRunner). */
export interface AiRunner {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** env.AI as an AiRunner, or null when the binding is missing. */
export function aiRunner(env: Pick<Env, "AI">): AiRunner | null {
  return env.AI ?? null;
}

/** The single Llama Guard request for every prompt of a job (as measured: a numbered list). */
export function guardInput(prompts: readonly string[]): { messages: Array<{ role: "user"; content: string }>; max_tokens: number } {
  const list = prompts.map((prompt, i) => `${i + 1}. ${prompt}`).join("\n");
  return { messages: [{ role: "user", content: `Image prompts for a school presentation:\n${list}` }], max_tokens: 20 };
}

export type GuardVerdict = { readonly safe: true } | { readonly safe: false; readonly categories: readonly string[] };

/**
 * Llama Guard's answer: "safe", or "unsafe" and a line of categories
 * ("S1,S10"); either as text ({response: "\n\nsafe"}, as measured) or as
 * {response: {safe, categories}}. Null when it is neither.
 */
export function parseGuard(result: unknown): GuardVerdict | null {
  const response = typeof result === "object" && result !== null ? (result as { response?: unknown }).response : undefined;
  if (typeof response === "object" && response !== null && typeof (response as { safe?: unknown }).safe === "boolean") {
    const { safe, categories } = response as { safe: boolean; categories?: unknown };
    if (safe) return { safe: true };
    const list = Array.isArray(categories) ? categories.filter((item): item is string => typeof item === "string") : [];
    return { safe: false, categories: list.map((item) => item.trim().toUpperCase()).filter((item) => /^S(?:[1-9]|1[0-4])$/.test(item)) };
  }
  if (typeof response !== "string") return null;
  const lines = response.trim().split(/\s*\n\s*/);
  const head = lines[0]?.toLowerCase();
  if (head === "safe") return { safe: true };
  if (head !== "unsafe") return null;
  const categories = (lines.slice(1).join(",").match(/\bS(?:1[0-4]|[1-9])\b/g) ?? []).map((item) => item.toUpperCase());
  return { safe: false, categories: [...new Set(categories)] };
}

export const GUARD_TIMEOUT_MS = 10_000;

export type PromptGuardResult =
  | { readonly ok: true }
  /** reason: "safety_S1"… (the first category), "safety_unknown", or "guard_unavailable". Never a prompt. */
  | { readonly ok: false; readonly reason: string };

/**
 * One Llama Guard call over all prompts of a job. Fails closed: no binding,
 * an error, a timeout or an unreadable answer drop the pictures too.
 */
export async function guardImagePrompts(ai: AiRunner | null, prompts: readonly string[], timeoutMs = GUARD_TIMEOUT_MS): Promise<PromptGuardResult> {
  if (!prompts.length) return { ok: true };
  if (!ai) return { ok: false, reason: "guard_unavailable" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const result = await Promise.race([ai.run(PROMPT_GUARD_MODEL, guardInput(prompts)), timeout]);
    if (result === "timeout") return { ok: false, reason: "guard_unavailable" };
    const verdict = parseGuard(result);
    if (!verdict) return { ok: false, reason: "guard_unavailable" };
    if (verdict.safe) return { ok: true };
    return { ok: false, reason: verdict.categories.length ? `safety_${verdict.categories[0]}` : "safety_unknown" };
  } catch {
    return { ok: false, reason: "guard_unavailable" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ── 5. The finished picture ─────────────────────────────────────────────────

export const IMAGE_VERDICT_KEYS = ["person", "face", "text", "flag", "weapon", "nudity", "blood"] as const;
export type ImageVerdict = Readonly<Record<(typeof IMAGE_VERDICT_KEYS)[number], boolean>>;

/**
 * The check model's answer to CHECK_PROMPT_V2: the first {…} in the text,
 * with every key present and boolean. Anything else is null (not handed out).
 */
export function parseImageVerdict(text: unknown): ImageVerdict | null {
  if (typeof text !== "string") return null;
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return null;
  let value: unknown;
  try {
    value = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const verdict: Record<string, boolean> = {};
  for (const key of IMAGE_VERDICT_KEYS) {
    if (typeof raw[key] !== "boolean") return null;
    verdict[key] = raw[key] as boolean;
  }
  return verdict as ImageVerdict;
}

/** A picture may be handed out only with a readable verdict that is false on every key. */
export function imageSafe(verdict: ImageVerdict | null): boolean {
  return verdict !== null && IMAGE_VERDICT_KEYS.every((key) => !verdict[key]);
}
