/**
 * When false, skip service-role workspace bootstrap in getWorkspaceContext.
 * Default true (unset) for backward compatibility.
 */
export function isServiceRoleWorkspaceBootstrapEnabled(): boolean {
  const v = process.env.ENABLE_SERVICE_ROLE_WORKSPACE_BOOTSTRAP;
  if (v == null || v === "") return true;
  const s = v.trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}
