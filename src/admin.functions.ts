import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getUserFromToken(accessToken: string) {
  const sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await sb.auth.getUser(accessToken);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user;
}

export const ensureBackofficeUser = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken: string; companyId: string; email: string; fullName?: string | null; phone?: string | null }) => d)
  .handler(async ({ data }) => {
    const actor = await getUserFromToken(data.accessToken);
    const companyId = data.companyId;
    const email = data.email.trim().toLowerCase();

    if (!companyId) throw new Error("Company required");
    if (!email) throw new Error("Email required");

    const [{ data: roles }, { data: ownedCompanies }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("role, company_id").eq("user_id", actor.id),
      supabaseAdmin.from("companies").select("id").eq("owner_user_id", actor.id),
    ]);

    const authorized =
      (roles ?? []).some((role) => role.role === "super_admin") ||
      (roles ?? []).some((role) => role.role === "admin" && role.company_id === companyId) ||
      (ownedCompanies ?? []).some((company) => company.id === companyId);

    if (!authorized) throw new Error("Not authorized to create staff for this company");

    const { data: existingId, error: lookupError } = await supabaseAdmin.rpc("find_user_id_by_email", { _email: email });
    if (lookupError) throw lookupError;
    if (existingId) return { userId: existingId as string, created: false };

    const tempPassword = `${crypto.randomUUID().replace(/-/g, "")}Aa1!`;
    const fullName = data.fullName?.trim() || email.split("@")[0].replace(/[-_.]+/g, " ");
    const phone = data.phone?.trim() || undefined;

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone ?? "",
      },
    });

    if (createError) throw createError;
    if (!createdUser.user?.id) throw new Error("Could not create account");

    return { userId: createdUser.user.id, created: true };
  });
