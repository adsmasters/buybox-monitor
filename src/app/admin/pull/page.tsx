import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import PullClient from "./PullClient";

export default async function PullPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createServiceClient();
  const { data: customers } = await admin
    .from("customers")
    .select("id, name")
    .order("name");

  const { data: logs } = await admin
    .from("pull_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  return (
    <>
      <NavBar email={user.email!} isAdmin={true} />
      <PullClient customers={customers || []} logs={logs || []} />
    </>
  );
}
