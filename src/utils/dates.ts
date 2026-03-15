/**
 * Utility for parsing dates in various formats commonly found in Excel files.
 */

export const parseFlexibleDate = (val: any): Date | null => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // Excel numeric date (days since 1900-01-01)
    return new Date(Date.UTC(1899, 11, val + (val > 60 ? -1 : 0)));
  }

  const s = String(val).trim();
  if (!s) return null;

  // Try native parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // Try common string formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  const parts = s.split(/[\/\-.]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0]);
    const p1 = parseInt(parts[1]);
    const p2 = parseInt(parts[2]);

    // YYYY-MM-DD
    if (p0 > 1000) return new Date(p0, p1 - 1, p2);
    // DD-MM-YYYY
    if (p2 > 1000) return new Date(p2, p1 - 1, p0);
  }

  return null;
};
