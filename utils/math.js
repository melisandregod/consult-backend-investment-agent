export const toFiniteNumber = (value) => {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

export const cleanNum = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    
    // Attempt to parse directly first (handles scientific notation like "9.79E-06")
    const directNumber = Number(val);
    if (!isNaN(directNumber)) return directNumber;

    // Fallback: strip non-numeric characters (e.g. for "$1,234.56" or "1,000")
    const cleaned = String(val).replace(/[^0-9.-]+/g, "");
    return parseFloat(cleaned) || 0;
};

export const normalizeHistoryRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.filter(r => r && r.date).map(r => ({
        ...r,
        close: toFiniteNumber(r.close),
        adjclose: toFiniteNumber(r.adjclose),
        open: toFiniteNumber(r.open),
        high: toFiniteNumber(r.high),
        low: toFiniteNumber(r.low),
        volume: toFiniteNumber(r.volume)
    }));
};

export const extractCloseSeries = (rows) => {
    return rows
        .map(r => toFiniteNumber(r.close ?? r.adjclose ?? r.open))
        .filter(v => v != null);
};

export const getClosedRows = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows.filter(r => toFiniteNumber(r?.close ?? r?.adjclose) != null);
};
