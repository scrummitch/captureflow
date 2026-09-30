import { redirect } from "next/navigation";
import { MARKETING_SITE_URL } from "@/lib/site";

export default function Page() {
  redirect(MARKETING_SITE_URL);
}
