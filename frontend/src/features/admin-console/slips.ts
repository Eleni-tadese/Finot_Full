// Printable login slips for students registered by the bulk import. Built in the browser from the answers of the
// server; the passwords are not stored anywhere else, so this is the only copy.

export interface Credential {
  row: number;
  name: string;
  email: string;
  password: string;
  department?: string;
  phone?: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** A full page of slips (8 per A4 sheet, with cut lines) ready for the browser's Print. */
export function slipsHtml(list: Credential[], graceDays: number, loginUrl: string): string {
  const until = new Date(Date.now() + graceDays * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const slip = (c: Credential) => `
    <div class="slip">
      <div class="top"><span class="logo">F</span><b>Finot</b><span class="small">Gibi Gubae fellowship</span></div>
      <div class="name">${esc(c.name)}</div>
      <table>
        <tr><td>Website</td><td>${esc(loginUrl)}</td></tr>
        <tr><td>Email</td><td class="mono">${esc(c.email)}</td></tr>
        <tr><td>Password</td><td class="mono big">${esc(c.password)}</td></tr>
      </table>
      <div class="note">Keep this slip. It works until <b>${esc(until)}</b>. Before then, sign in, complete your profile, and add your own real email and a new password.</div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Finot login slips</title><style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Arial, "Noto Sans Ethiopic", sans-serif; color: #111827; }
    .bar { padding: 12px 16px; background: #fff7e0; border-bottom: 1px solid #fde68a; font-size: 14px; }
    .bar button { margin-left: 12px; padding: 6px 14px; border-radius: 8px; border: 1px solid #1e3a8a; background: #1e3a8a; color: #fff; cursor: pointer; }
    .sheet { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 66mm; page-break-inside: avoid; }
    .slip { border: 1px dashed #6b7280; padding: 5mm 6mm; display: flex; flex-direction: column; justify-content: space-between; break-inside: avoid; overflow: hidden; }
    .top { display: flex; align-items: center; gap: 6px; color: #1e3a8a; }
    .logo { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #fbbf24; color: #1e3a8a; font-weight: 800; }
    .small { margin-left: auto; font-size: 10px; color: #6b7280; }
    .name { font-size: 15px; font-weight: 700; }
    table { border-collapse: collapse; width: 100%; font-size: 12px; }
    td { padding: 2px 0; vertical-align: top; }
    td:first-child { width: 22mm; color: #6b7280; }
    .mono { font-family: Consolas, "Courier New", monospace; font-weight: 700; word-break: break-all; }
    .big { font-size: 16px; letter-spacing: 1px; }
    .note { font-size: 9.5px; color: #374151; line-height: 1.35; }
    @media print { .bar { display: none; } }
  </style></head><body>
  <div class="bar">${list.length} slips. Print on A4 (8 per page), cut along the dashed lines, and hand one to each student.
    <button onclick="window.print()">Print</button></div>
  <div class="sheet">${list.map(slip).join("")}</div></body></html>`;
}

/** CSV with a BOM so Excel shows Amharic names correctly. */
export function credentialsCsv(list: Credential[]): string {
  const q = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Name", "Login email", "Password", "Department", "Phone"].map(q).join(",")];
  list.forEach((c) => lines.push([c.name, c.email, c.password, c.department, c.phone].map(q).join(",")));
  return "﻿" + lines.join("\r\n");
}
