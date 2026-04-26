import { generateClient } from "aws-amplify/data";

export const client = generateClient({ authMode: "userPool" });

// Lazy-create the User row on first call (replaces the broken postConfirmation trigger).
// Idempotent — subsequent calls find an existing row.
export async function ensureUser(userId, email) {
  const get = await client.models.User.get({ userId });
  if (get.data) return get.data;
  const create = await client.models.User.create({
    userId,
    email,
    displayName: email,
    dailyTarget: 3,
    createdAt: new Date().toISOString()
  });
  if (create.errors?.length) throw new Error(create.errors[0].message);
  return create.data;
}

export async function listMyProblems() {
  const out = await client.models.Problem.list({ limit: 1000 });
  if (out.errors?.length) throw new Error(out.errors[0].message);
  return (out.data || []).sort((a, b) => new Date(b.solvedAt) - new Date(a.solvedAt));
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
