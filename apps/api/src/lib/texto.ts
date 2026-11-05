// Para comparar texto sin tildes ni mayúsculas ("Puré" coincide con "pure").
// Los caracteres especiales se dejan tal cual: se buscan como texto literal.
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
