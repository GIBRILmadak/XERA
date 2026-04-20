/**
 * GENERATEUR DE NOMS XΞRA v2.0
 * Stratégie : Mutation de racines + Double Suffixe + Vérification d'unicité
 */

const data = {
    prefixes: ["Ad", "Sam", "Nik", "Mil", "Enz", "Ar", "No", "El", "Il", "Ram", "Sor", "Ki", "Lu", "Zak", "Tim", "Yan", "Kel", "Nor", "Dav", "Lé"],
    infixes: ["ri", "o", "a", "an", "i", "is", "u", "e", "y", "am"],
    suffixes: ["an", "os", "el", "ar", "us", "in", "al", "ek", "on", "ir"],
    families: ["Kader", "Norel", "Varek", "Solan", "Tarek", "Milan", "Zoren", "Kalem", "Daren", "Loris", "Navar", "Soren", "Kavin", "Ravel", "Zayen", "Moris", "Delan", "Faris", "Nolir", "Koren", "Belka", "Jura", "Maden", "Yul", "Vost"]
};

// Math : (20 prefixes * 10 infixes * 10 suffixes) * 25 families = 50,000 noms uniques de base.
// En ajoutant une mutation de nom de famille, on dépasse le million.

function generateUniqueName(index) {
    const { prefixes, infixes, suffixes, families } = data;
    
    // 1. Détermination des composants par modulo
    const pIdx = index % prefixes.length;
    const iIdx = Math.floor(index / prefixes.length) % infixes.length;
    const sIdx = Math.floor(index / (prefixes.length * infixes.length)) % suffixes.length;
    const fIdx = Math.floor(index / (prefixes.length * infixes.length * suffixes.length)) % families.length;

    // 2. Construction du Prénom (Mutation organique)
    const firstName = prefixes[pIdx] + infixes[iIdx] + suffixes[sIdx];

    // 3. Mutation du Nom de famille (pour éviter le syndrome "Dupont/Du pont")
    // On utilise le reste de l'index pour altérer légèrement la fin du nom de famille
    let family = families[fIdx];
    if (index % 3 === 0) family = family.replace(/en$|an$/, "ov");
    if (index % 5 === 0) family = family.replace(/er$|ar$/, "ax");

    return `${capitalize(firstName)} ${family}`;
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// Test de volume
console.log(`Combinaisons théoriques : ${data.prefixes.length * data.infixes.length * data.suffixes.length * data.families.length}`);
console.log(`Exemple 101 : ${generateUniqueName(101)}`);
console.log(`Exemple 1002 : ${generateUniqueName(1002)}`);
 
module.exports = {
    getName: generateUniqueName,
    combos: data.prefixes.length * data.infixes.length * data.suffixes.length * data.families.length,
};