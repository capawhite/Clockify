import { localizedRedirect } from "@/lib/i18n/server-redirect";
import { getWorkspaceContext } from "@/lib/auth/workspace";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getWorkspaceContext();
  if (!user) {
    await localizedRedirect("/login");
    throw new Error("UNREACHABLE");
  }
  if (profile?.role !== "admin") {
    await localizedRedirect("/dashboard");
    throw new Error("UNREACHABLE");
  }
  return <>{children}</>;
}
