// Simple deterministic name generator producing 40x25 = 1000 unique combos
// Name generator using three combinable blocks (Prénom + Post-nom + Nom de famille)
// Blocks provided: A (first names), B (post-names / middle pieces), C (family names)
// Produces A.length * B.length * C.length unique combinations (here: 20*20*20 = 8000)
const blockA = [
    "Adri",
    "Sami",
    "Niko",
    "Milo",
    "Enzo",
    "Aris",
    "Noa",
    "Elio",
    "Ily",
    "Rami",
    "Sora",
    "Kian",
    "Luan",
    "Zaki",
    "Timo",
    "Yani",
    "Keli",
    "Nori",
    "Davi",
    "Léo",
];
const blockB = [
    "El",
    "An",
    "Is",
    "Or",
    "As",
    "En",
    "Ir",
    "On",
    "Ar",
    "Us",
    "Em",
    "Il",
    "Er",
    "Os",
    "Ai",
    "Un",
    "Ek",
    "Am",
    "In",
    "Al",
];
const blockC = [
    "Kader",
    "Norel",
    "Varek",
    "Solan",
    "Tarek",
    "Milan",
    "Zoren",
    "Kalem",
    "Daren",
    "Loris",
    "Navar",
    "Soren",
    "Kavin",
    "Ravel",
    "Zayen",
    "Moris",
    "Delan",
    "Faris",
    "Nolir",
    "Koren",
];
const combos = blockA.length * blockB.length * blockC.length;

function getName(i) {
    const idx = ((Number(i) || 1) - 1) % combos; // 0-based index
    const aLen = blockA.length;
    const bLen = blockB.length;
    const a = idx % aLen;
    const b = Math.floor(idx / aLen) % bLen;
    const c = Math.floor(idx / (aLen * bLen)) % blockC.length;

    const first = String(blockA[a] || "").trim();
    const post = String(blockB[b] || "")
        .toLowerCase()
        .trim();
    const family = String(blockC[c] || "").trim();

    // Compose: first + post (lowercased) + ' ' + family
    return `${first}${post} ${family}`;
}

function getAllNames() {
    const out = [];
    for (let ci = 0; ci < blockC.length; ci++) {
        for (let bi = 0; bi < blockB.length; bi++) {
            for (let ai = 0; ai < blockA.length; ai++) {
                const name = `${blockA[ai]}${blockB[bi].toLowerCase()} ${blockC[ci]}`;
                out.push(name);
            }
        }
    }
    return out;
}

module.exports = { getName, getAllNames, blockA, blockB, blockC, combos };
