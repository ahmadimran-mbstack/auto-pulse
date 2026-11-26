export async function isServerAdmin(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const backendBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${backendBase}/api/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return Boolean(data?.is_admin);
  } catch {
    return false;
  }
}
