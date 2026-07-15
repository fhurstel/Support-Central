// Generates a lightweight SVG "receipt paper" data URL so seeded receipts and
// PDF uploads have something to show in the detail image pane without bundling
// binary assets. Real uploads use the actual file's data URL instead.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function receiptPaperDataUrl(opts: {
  vendor: string;
  amount: number;
  currency?: string;
  date?: string;
}): string {
  const { vendor, amount } = opts;
  const symbol = opts.currency === 'EUR' ? '€' : opts.currency === 'GBP' ? '£' : '$';
  const total = `${symbol}${amount.toFixed(2)}`;
  const lines = [
    { label: 'Item 1', value: (amount * 0.55).toFixed(2) },
    { label: 'Item 2', value: (amount * 0.3).toFixed(2) },
    { label: 'Item 3', value: (amount * 0.15).toFixed(2) },
  ];
  const rows = lines
    .map(
      (l, i) =>
        `<text x="26" y="${150 + i * 26}" font-family="monospace" font-size="13" fill="#3B3B33">${esc(
          l.label,
        )}</text><text x="274" y="${150 + i * 26}" text-anchor="end" font-family="monospace" font-size="13" fill="#3B3B33">${l.value}</text>`,
    )
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380" viewBox="0 0 300 380">
    <rect width="300" height="380" fill="#F1F4F3"/>
    <rect x="20" y="20" width="260" height="340" rx="4" fill="#FFFEFA" stroke="#E8E4D8"/>
    <text x="150" y="58" text-anchor="middle" font-family="monospace" font-size="16" font-weight="bold" fill="#3B3B33">${esc(
      vendor.toUpperCase(),
    )}</text>
    <text x="150" y="80" text-anchor="middle" font-family="monospace" font-size="10" fill="#8A897C">${esc(
      opts.date ?? '',
    )}</text>
    <line x1="26" y1="100" x2="274" y2="100" stroke="#C9C5B4" stroke-dasharray="3 3"/>
    ${rows}
    <line x1="26" y1="240" x2="274" y2="240" stroke="#C9C5B4" stroke-dasharray="3 3"/>
    <text x="26" y="270" font-family="monospace" font-size="15" font-weight="bold" fill="#3B3B33">TOTAL</text>
    <text x="274" y="270" text-anchor="end" font-family="monospace" font-size="15" font-weight="bold" fill="#3B3B33">${total}</text>
    <line x1="26" y1="290" x2="274" y2="290" stroke="#C9C5B4" stroke-dasharray="3 3"/>
    <text x="150" y="320" text-anchor="middle" font-family="monospace" font-size="10" fill="#8A897C">VISA ****4821 · THANK YOU</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
