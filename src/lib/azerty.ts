const AZERTY_TO_DIGIT: Record<string, string> = {
  "&": "1",
  "é": "2",
  "É": "2",
  '"': "3",
  "'": "4",
  "(": "5",
  "-": "6",
  "è": "7",
  "È": "7",
  "_": "8",
  "ç": "9",
  "Ç": "9",
  "à": "0",
  "À": "0",
}

export function azertyToDigits(input: string): string {
  let out = ""
  for (const ch of input) {
    if (ch >= "0" && ch <= "9") {
      out += ch
      continue
    }
    const mapped = AZERTY_TO_DIGIT[ch]
    if (mapped) out += mapped
  }
  return out
}