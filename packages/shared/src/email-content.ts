export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function textToHtml(text: string): string {
  return text.split(/\n\s*\n/).map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("");
}

export function renderTemplate(template: string, contact: { firstName?: string | null; company?: string | null; email?: string | null }) {
  const values: Record<string, string> = { firstName: contact.firstName || "there", company: contact.company || "your team", email: contact.email || "" };
  return template.replace(/\{\{\s*(firstName|company|email)\s*\}\}/g, (_, key: string) => values[key]);
}
