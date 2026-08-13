/**
 * Language handling for the AI writing helpers (improve and generate).
 *
 * "Preserve the writer's language" was the only instruction the improve route
 * gave, and a model reads that as "reply in Malay" — which in practice comes
 * back as Bahasa Indonesia. The two languages share enough vocabulary that the
 * result looks right at a glance and reads as foreign to a Malaysian client:
 * "bisa", "kualitas", "silakan", "perusahaan", "nomor". A Malaysian agency
 * cannot send that to a customer, so language is decided here, stated to the
 * model explicitly, and repaired on the way back out.
 *
 * The same detection also decides what language a from-scratch draft is written
 * in, so generating a description for a record whose other fields are in Malay
 * does not silently switch the workspace to English.
 */

export type WritingLanguage = "malay" | "english" | "mixed";

/**
 * Function words, not content words. Nouns drift between the two languages and
 * across Malaysian mixed speech; "yang", "dengan" and "the", "with" do not.
 */
const MALAY_MARKERS = new Set([
  "yang", "dan", "untuk", "dengan", "adalah", "ialah", "ini", "itu", "kami", "kita",
  "anda", "awak", "saya", "mereka", "akan", "tidak", "tak", "boleh", "dalam", "pada",
  "dari", "daripada", "kepada", "telah", "sudah", "ada", "juga", "atau", "bagi",
  "oleh", "sebagai", "supaya", "kerana", "agar", "jangan", "perlu", "hendak", "mahu",
  "semua", "setiap", "lebih", "sangat", "seperti", "hingga", "sehingga", "apabila",
  "bila", "jika", "kalau", "tetapi", "tapi", "kena", "guna", "macam", "banyak",
  "bukan", "belum", "masih", "nak", "dah", "bagaimana", "kenapa", "mengapa", "siapa",
  "mana", "harus", "dapat", "ingin", "sila", "kepada", "supaya", "serta", "ketika",
]);

/**
 * A record snapshot is mostly labels and short values — "Jenama: Kedai Kek
 * Ratu" carries almost no function words — so generate would read a whole Malay
 * workspace as undecidable. These everyday workspace nouns, plus Malay
 * affixation, give the detector something to see in fragments.
 */
const MALAY_CONTENT = new Set([
  "pelanggan", "syarikat", "jenama", "kedai", "perkhidmatan", "harga", "tarikh", "jualan",
  "pekerja", "gaji", "cuti", "mesyuarat", "keluarga", "sesi", "gambar", "warna", "bunga",
  "makanan", "minuman", "rumah", "sekolah", "majlis", "raya", "perniagaan", "tempahan",
  "jadual", "kandungan", "wang", "bayar", "bayaran", "hantar", "sunting", "muat", "laman",
  "projek", "khidmat", "kerja", "orang", "ramai", "murah", "baharu", "percuma", "senarai",
]);

/**
 * Malay affixation. Any of these prefixes or suffixes on a word of real length
 * is a stronger signal than the equivalent guess about an unknown noun.
 */
const MALAY_AFFIX = /^(?:mem|men|meng|meny|ber|ter|pen|peng|per|ke|se)[a-z]{4,}$|[a-z]{4,}(?:kan|nya|annya)$/;

/** The English mirror: derivational endings that Malay does not produce. */
const ENGLISH_AFFIX = /^[a-z]{4,}(?:ing|tion|sion|ment|ness|ship|able|ible|ly)$/;

const ENGLISH_MARKERS = new Set([
  "the", "and", "for", "with", "is", "are", "was", "were", "this", "that", "these",
  "those", "we", "you", "they", "will", "not", "in", "on", "at", "from", "to", "of",
  "has", "have", "had", "also", "or", "by", "as", "so", "because", "should", "must",
  "can", "could", "would", "need", "want", "make", "all", "every", "more", "very",
  "like", "until", "when", "if", "but", "our", "your", "their", "it", "be", "been",
  "do", "does", "did", "a", "an", "into", "about", "than", "then", "there", "what",
  "why", "who", "which", "how", "each", "any", "some", "only", "just",
]);

/**
 * Indonesian forms and the Malaysian ones that replace them.
 *
 * Ordered most-common first: the same list writes the instruction sent to the
 * model and repairs whatever comes back, so the two can never disagree about
 * what "Malay" means here.
 */
const INDONESIAN_TO_MALAY: ReadonlyArray<readonly [string, string]> = [
  ["bisa", "boleh"],
  ["kualitas", "kualiti"],
  ["silakan", "sila"],
  ["silahkan", "sila"],
  ["perusahaan", "syarikat"],
  ["karyawan", "pekerja"],
  ["layanan", "perkhidmatan"],
  ["pelayanan", "perkhidmatan"],
  ["nomor", "nombor"],
  ["nomer", "nombor"],
  ["jadwal", "jadual"],
  ["biaya", "kos"],
  ["ongkos", "kos"],
  ["uang", "wang"],
  ["gratis", "percuma"],
  ["pajak", "cukai"],
  ["faktur", "invois"],
  ["kwitansi", "resit"],
  ["struk", "resit"],
  ["rekening", "akaun"],
  ["toko", "kedai"],
  ["merek", "jenama"],
  ["merk", "jenama"],
  ["kantor", "pejabat"],
  ["aktivitas", "aktiviti"],
  ["kreativitas", "kreativiti"],
  ["produktivitas", "produktiviti"],
  ["efektivitas", "keberkesanan"],
  ["prioritas", "keutamaan"],
  ["fasilitas", "kemudahan"],
  ["kapasitas", "kapasiti"],
  ["identitas", "identiti"],
  ["komunitas", "komuniti"],
  ["universitas", "universiti"],
  ["realitas", "realiti"],
  ["integritas", "integriti"],
  ["kinerja", "prestasi"],
  ["metode", "kaedah"],
  ["desain", "reka bentuk"],
  ["jaringan", "rangkaian"],
  ["pengiriman", "penghantaran"],
  ["pemesanan", "tempahan"],
  ["mengunduh", "memuat turun"],
  ["unduh", "muat turun"],
  ["mengunggah", "memuat naik"],
  ["unggah", "muat naik"],
  ["pengelolaan", "pengurusan"],
  ["mengelola", "menguruskan"],
  ["pelatihan", "latihan"],
  ["tunjangan", "elaun"],
  ["absensi", "kehadiran"],
  ["kesehatan", "kesihatan"],
  ["dokter", "doktor"],
  ["obat", "ubat"],
  ["mobil", "kereta"],
  ["ponsel", "telefon"],
  ["praktek", "praktik"],
  ["analisa", "analisis"],
  ["resiko", "risiko"],
  ["standar", "standard"],
  ["ijin", "izin"],
  ["maret", "Mac"],
  ["agustus", "Ogos"],
  // Colloquial Indonesian, which turns up when a model relaxes its register.
  ["nggak", "tidak"],
  ["enggak", "tidak"],
  ["udah", "sudah"],
  ["banget", "sangat"],
  ["gimana", "bagaimana"],
  ["kayak", "macam"],
];

/**
 * Words that are Indonesian in one sense but valid Malaysian Malay in another
 * are deliberately absent: "polisi" is a policy here, "rapat" is close/tight,
 * "pesanan" is a message. Repairing those would corrupt correct writing, which
 * is worse than leaving one foreign word in place.
 */

/** Longest first, so "mengunduh" is not half-replaced by the "unduh" rule. */
const REPAIRS = INDONESIAN_TO_MALAY.map(([from, to]) => ({
  to,
  pattern: new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"),
  length: from.length,
})).sort((a, b) => b.length - a.length);

function words(text: string) {
  return text.toLowerCase().match(/[a-z']+/g) || [];
}

/**
 * Decides the language of a draft from every text the caller can offer — the
 * field itself first, then the surrounding record, because an empty field still
 * belongs to a record that has a language.
 */
export function detectWritingLanguage(...texts: (string | null | undefined)[]): WritingLanguage {
  let malay = 0;
  let english = 0;

  for (const text of texts) {
    if (!text) continue;
    for (const word of words(text)) {
      // Function words are the reliable evidence, so they count double; a noun
      // or an affix only breaks the tie in text too short to have grammar.
      if (MALAY_MARKERS.has(word)) malay += 2;
      else if (ENGLISH_MARKERS.has(word)) english += 2;
      else if (MALAY_CONTENT.has(word) || MALAY_AFFIX.test(word)) malay += 1;
      else if (ENGLISH_AFFIX.test(word)) english += 1;
    }
  }

  if (malay > 0 && malay >= english * 1.5) return "malay";
  if (english > 0 && english > malay * 1.5) return "english";
  // Neither side is dominant — either genuinely balanced Malay-English writing
  // or too little text to tell. Both cases want the conservative instruction
  // ("hold the draft's own balance") rather than a guess that translates the
  // user's writing for them.
  return "mixed";
}

/** Normalises whatever a client sends as a language preference. */
export function resolveWritingLanguage(
  requested: unknown,
  ...texts: (string | null | undefined)[]
): WritingLanguage {
  const value = String(requested ?? "").trim().toLowerCase();
  if (value === "malay" || value === "ms" || value === "bm") return "malay";
  if (value === "english" || value === "en") return "english";
  if (value === "mixed") return "mixed";
  return detectWritingLanguage(...texts);
}

/**
 * The vocabulary hint, grouped by the Malaysian word so the prompt spends its
 * length on distinct vocabulary instead of listing "sila" twice.
 */
function vocabularyHint(groups: number) {
  const grouped = new Map<string, string[]>();
  for (const [from, to] of INDONESIAN_TO_MALAY) {
    grouped.set(to, [...(grouped.get(to) || []), from]);
  }
  return [...grouped.entries()]
    .slice(0, groups)
    .map(([to, from]) => `${to} (not ${from.join("/")})`)
    .join(", ");
}

const MALAYSIAN_RULES = [
  "Write Bahasa Melayu Malaysia (the Malay used in Malaysia), never Bahasa Indonesia.",
  `Use Malaysian forms: ${vocabularyHint(22)}.`,
  "Malaysian usage also means anda/awak rather than kalian, and -kan/-i endings as written in Malaysia.",
  "Malaysians write with English words mixed in. Keep every English word the writer chose — follow up, client, brief, shoot, deadline, brand, platform and product names stay in English.",
  "Keep the register the writer used. Do not make casual Malay formal or textbook-like.",
];

/** Extra system-prompt lines that lock the reply to the detected language. */
export function languageDirectives(language: WritingLanguage): string[] {
  if (language === "english") {
    return [
      "Write in English — that is the language of this field and of the record around it. Do not translate it into another language.",
      "Keep Malaysian business context intact: RM amounts, local place names, SST, LHDN, EPF, SOCSO and client names stay as written.",
    ];
  }
  if (language === "malay") {
    return [
      "Write in Malay — that is the language of this field and of the record around it.",
      ...MALAYSIAN_RULES,
    ];
  }
  return [
    "This writing mixes Malay and English the way Malaysians write at work. Hold that same balance — do not translate it into one language.",
    ...MALAYSIAN_RULES,
    "Every Malay word you write must be Malaysian Malay even when the sentence around it is English.",
  ];
}

/**
 * Repairs Indonesian vocabulary that survived the instruction.
 *
 * Word-level and word-boundary only, so it corrects vocabulary without
 * rewriting sentences. Template variables are stepped over: a `{{nomor_resit}}`
 * token is a database key, not prose, and renaming it breaks the document.
 */
export function toMalaysianMalay(text: string): string {
  if (!text) return text;
  return text
    .split(/(\{\{[^}]*\}\})/g)
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // The captured {{token}} itself.
      let out = segment;
      for (const repair of REPAIRS) {
        out = out.replace(repair.pattern, (match) => matchCase(match, repair.to));
      }
      return out;
    })
    .join("");
}

/** Applies the replacement in the casing the original word was written in. */
function matchCase(original: string, replacement: string) {
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`;
  }
  return replacement;
}

/** Applies the repair wherever the text actually came back in Malay. */
export function enforceLanguage(text: string, language: WritingLanguage): string {
  if (language !== "english") return toMalaysianMalay(text);
  // English was asked for. Translating a Malay reply back is not this function's
  // job, but if the model answered in Malay anyway it should at least be
  // Malaysian Malay — for English text the repair has nothing to match.
  return detectWritingLanguage(text) === "english" ? text : toMalaysianMalay(text);
}
