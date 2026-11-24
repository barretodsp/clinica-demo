/** CPF mascarado para listagens: 12345678901 → ***.456.789-** */
export function maskCpf(document: string): string {
  const d = document.replace(/\D/g, '');
  if (d.length !== 11) return '***.***.***-**';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** CPF formatado completo (somente em telas do próprio paciente / laudo). */
export function formatCpf(document: string): string {
  const d = document.replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : document;
}

/** Dígitos verificadores do CPF a partir dos 9 primeiros dígitos. */
export function cpfCheckDigits(base9: string): string {
  const digits = base9.split('').map(Number);
  const dv = (nums: number[]) => {
    const sum = nums.reduce((acc, n, i) => acc + n * (nums.length + 1 - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = dv(digits);
  const d2 = dv([...digits, d1]);
  return `${d1}${d2}`;
}

/** CPF válido: 11 dígitos, não repetidos, dígitos verificadores corretos. */
export function isValidCpf(value: string): boolean {
  const d = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  return cpfCheckDigits(d.slice(0, 9)) === d.slice(9);
}
