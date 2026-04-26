import { generateClient } from "aws-amplify/data";

export const client = generateClient({ authMode: "userPool" });

// Lazy-create the User row on first call (replaces the postConfirmation trigger).
// Resilient to a row that exists at this userId but isn't visible to the current
// caller (e.g. a postConfirmation-Lambda-written row without an owner field — the
// AppSync owner-filter then returns null on `get`, but `create` still fails its
// `attribute_not_exists(userId)` conditional). We treat that case as "row exists,
// just couldn't read it" and fall back to defaults so the UI can render.
export async function ensureUser(userId, email) {
  const initialGet = await client.models.User.get({ userId });
  if (initialGet.data) return initialGet.data;

  const create = await client.models.User.create({
    userId,
    email,
    displayName: email,
    dailyTarget: 3,
    createdAt: new Date().toISOString()
  });
  if (create.data) return create.data;

  // Create failed. If it's a conditional / already-exists error, the row is in
  // DDB but we can't see it. Re-fetch once (in case of read-after-write lag),
  // then return synthetic defaults rather than blocking the app.
  const errorMsg = create.errors?.[0]?.message ?? "";
  const looksLikeExists = /conditional|already exists|attribute_not_exists/i.test(errorMsg);
  if (looksLikeExists) {
    const reGet = await client.models.User.get({ userId });
    if (reGet.data) return reGet.data;
    console.warn("ensureUser: row exists at userId but unreadable; using defaults", create.errors);
    return { userId, email, displayName: email, dailyTarget: 3 };
  }

  throw new Error(errorMsg || "ensureUser: create failed");
}

// `solutions` is an AWSJSON field in the schema. Depending on amplify-js client
// behavior it may come back as a string or an object — normalize to object so
// `CodeBlock` can do `solutions[lang]`.
function normalizeProblem(p) {
  if (!p) return p;
  let s = p.solutions;
  if (typeof s === "string") {
    try { s = JSON.parse(s); } catch { s = null; }
  }
  return { ...p, solutions: s };
}

export async function listMyProblems() {
  const out = await client.models.Problem.list({ limit: 1000 });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  const items = (out.data || []).map(normalizeProblem);
  return items.sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
}

export async function updateMyDailyTarget(userId, dailyTarget) {
  const out = await client.models.User.update({ userId, dailyTarget });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}

export async function updateProblemTags(id, tags) {
  const out = await client.models.Problem.update({ id, tags });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}

export async function exportMyData() {
  const out = await client.mutations.exportMyData();
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return out.data;
}
