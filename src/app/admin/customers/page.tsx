import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createServiceClient();
  const { data: customers } = await admin
    .from("customers")
    .select("id, name, email, created_at")
    .order("name");

  const { data: asins } = await admin
    .from("asins")
    .select("id, customer_id, asin, title");

  return (
    <>
      <NavBar email={user.email!} isAdmin={true} />
      <CustomersClient customers={customers || []} asins={asins || []} />
    </>
  );
}
