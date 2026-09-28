/*
 * Normalisation des en-têtes XLSX pour les imports.
 *
 * Les exports écrivent des libellés traduits ("Nom complet", "Montant"…)
 * tandis que les imports cherchaient des clés anglaises ("full_name",
 * "amount"…). Un fichier exporté puis réimporté perdait donc silencieusement
 * les données. On matche désormais les en-têtes par forme normalisée
 * (minuscules + accents retirés + espaces/punctuation unifiés) et un tableau
 * d'alias FR / EN / AR.
 */

export type HeaderAliases = Record<string, string[]>

const ARABIC = "\u0600-\u06ff"

export function normalizeHeader(value: unknown): string {
  const text = String(value ?? "")
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(new RegExp(`[^a-z0-9${ARABIC}]+`, "g"), " ")
    .trim()
    .replace(/\s+/g, " ")
}

/** Indique, pour chaque clé canonique, la colonne (index 0-based) correspondante. */
export function buildColumnIndex(
  rawHeaders: string[],
  aliases: HeaderAliases,
): Record<string, number> {
  const normToCanonical = new Map<string, string>()
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const alias of [canonical, ...list]) {
      const n = normalizeHeader(alias)
      if (n && !normToCanonical.has(n)) normToCanonical.set(n, canonical)
    }
  }
  const index: Record<string, number> = {}
  rawHeaders.forEach((raw, col) => {
    const n = normalizeHeader(raw)
    const canonical = n ? normToCanonical.get(n) : undefined
    if (canonical && index[canonical] === undefined) index[canonical] = col
  })
  return index
}

/** Extrait les valeurs d'une ligne de cellules selon l'index de colonnes. */
export function canonicalValues(
  cells: unknown[],
  index: Record<string, number>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [canonical, col] of Object.entries(index)) {
    const v = cells[col]
    if (v !== undefined && v !== null && String(v) !== "") out[canonical] = v
  }
  return out
}

export const MEMBER_ALIASES: HeaderAliases = {
  name: [
    "nom complet",
    "nom & prenom",
    "nom et prenom",
    "nomprenom",
    "nom prenom",
    "fullname",
    "full name",
    "complete name",
    "الاسم الكامل",
    "الاسم",
  ],
  firstName: ["prenom", "first name", "firstname", "given name", "الاسم الاول"],
  lastName: ["nom de famille", "nom", "last name", "lastname", "family name", "surname", "اسم العائلة"],
  email: [
    "email",
    "e-mail",
    "courriel",
    "mail",
    "adresse email",
    "adresse electronique",
    "البريد الالكتروني",
    "بريد",
  ],
  phone: ["telephone", "tel", "gsm", "mobile", "portable", "numero de telephone", "الهاتف", "رقم الهاتف"],
  gender: ["genre", "sexe", "sex", "gender", "الجنس"],
  status: ["statut", "etat", "status", "الحالة"],
  birthDate: ["date de naissance", "birth date", "birthdate", "ddn", "تاريخ الميلاد"],
  address: ["adresse", "address", "العنوان"],
  emergencyContact: ["contact urgence", "contact d urgence", "contact", "emergency contact", "جهة اتصال", "جهة الاتصال"],
  emergencyPhone: [
    "telephone urgence",
    "tel urgence",
    "telephone d urgence",
    "emergency phone",
    "emergency telephone",
    "هاتف الطوارئ",
  ],
  memberNumber: ["numero membre", "num membre", "n membre", "membre no", "member number", "member no", "no", "n", "رقم العضو", "رقم"],
  lastVisit: ["derniere visite", "last visit", "derniere presence", "آخر زيارة"],
  notes: ["notes", "remarques", "remarks", "ملاحظات"],
  plan: ["plan", "type abonnement", "abonnement", "subscription", "الباقة", "نوع الاشتراك"],
  subStatus: ["statut abonnement", "subscription status", "حالة الاشتراك"],
  startDate: ["debut abon", "start date", "sub start", "بداية الاشتراك", "تاريخ البداية"],
  endDate: ["fin abon", "end date", "sub end", "نهاية الاشتراك", "تاريخ النهاية"],
  visits: ["visites", "visits", "الزيارات"],
}

export const EXPENSE_ALIASES: HeaderAliases = {
  category: ["categorie", "category", "cat", "الفئة"],
  description: ["description", "designation", "libelle", "desc", "الوصف"],
  amount: ["montant", "amount", "somme", "valeur", "prix", "المبلغ"],
  expense_date: ["date", "expense date", "date depense", "date de depense", "التاريخ"],
  notes: ["notes", "remarques", "ملاحظات"],
}

export const PAYMENT_ALIASES: HeaderAliases = {
  member_name: ["membre", "member", "client", "member name", "اسم العضو"],
  amount: ["montant", "amount", "prix", "المبلغ"],
  payment_method: [
    "methode",
    "method",
    "mode de paiement",
    "payment method",
    "methode de paiement",
    "طريقة الدفع",
  ],
  payment_date: ["date", "payment date", "date de paiement", "التاريخ"],
  notes: ["notes", "remarques", "ملاحظات"],
}

export const PRODUCT_ALIASES: HeaderAliases = {
  name: ["nom", "name", "designation", "label", "الاسم"],
  category: ["categorie", "category", "cat", "الفئة"],
  brand: ["marque", "brand", "العلامة التجارية"],
  reference: ["ref", "reference", "ref*", "المرجع"],
  price: ["price da", "prix da", "price", "prix", "السعر"],
  cost: ["cost (da)", "cost", "cout", "prix de revient", "التكلفة"],
  stock: ["stock", "quantite", "qty", "quantity", "الكمية", "المخزون"],
  stock2: ["stock 2", "stock2"],
  barcode: [
    "code barres",
    "code barr",
    "code barre",
    "codebarre",
    "code a barres",
    "barcode",
    "bar code",
    "الباركود",
  ],
  status: ["status", "statut", "etat", "الحالة"],
}