// Amounts as people type them. A separator followed by one or two digits at the end marks the decimals, in either convention (12.50, 12,5);
// any other separator only groups thousands (10.000, 1,250, 4.500,50).
export function moneyValue(text) {
  if (/^\s*-/.test(String(text ?? ""))) return 0;
  const clean = String(text ?? "").replace(/[^\d.,]/g, "");
  const decimals = clean.match(/[.,](\d{1,2})$/);
  const whole = (decimals ? clean.slice(0, decimals.index) : clean).replace(/\D/g, "");
  if (!whole && !decimals) return 0;
  return Number(`${whole || 0}.${decimals?.[1] ?? 0}`);
}

// Still typing the decimals, so the field must not reformat under the person's fingers.
export const typingDecimals = (text) => /[.,]\d{0,2}$/.test(String(text ?? ""));
