const base = "http://localhost:3000";

const login = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "demo@mailpilot.dev", password: "demo1234" })
});
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
console.log("login", login.status, cookie.length > 0 ? "cookie ok" : "no cookie");

const csv = `name,email,company\nAli Khan,ali.khan+test@example.com,Acme\nSara Ahmed,sara.ahmed+test@example.com,Beta Corp\n`;
const form = new FormData();
form.set("file", new File([csv], "test.csv", { type: "text/csv" }));
form.set("mapping", JSON.stringify({ name: "name", email: "email", company: "company" }));
form.set("listId", "");

const started = Date.now();
const imp = await fetch(`${base}/api/contacts/import`, { method: "POST", headers: { cookie }, body: form });
console.log("import", imp.status, `(${Date.now() - started}ms)`, await imp.text());

await new Promise((r) => setTimeout(r, 3000));
const list = await fetch(`${base}/api/contacts?search=ali.khan%2Btest`, { headers: { cookie } });
console.log("lookup", list.status, (await list.text()).slice(0, 400));
