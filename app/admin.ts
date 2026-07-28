export type AdminLevel = "none" | "admin" | "superadmin";

export type AdministrativeActor = {
  is_admin?: unknown;
  admin_level?: unknown;
  active_role?: unknown;
};

export function adminLevel(actor: AdministrativeActor): AdminLevel {
  const explicit = String(actor.admin_level ?? "");
  if (explicit === "superadmin") return "superadmin";
  if (explicit === "admin") return "admin";
  if (Number(actor.is_admin)) return "admin";
  return "none";
}

export function isAdministrator(actor: AdministrativeActor) {
  return adminLevel(actor) !== "none";
}

export function isSuperadmin(actor: AdministrativeActor) {
  return adminLevel(actor) === "superadmin";
}
