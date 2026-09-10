import { redirect } from "next/navigation";

/** `/dev` alone is not a song slug — send people to the Live preview. */
export default function DevIndexPage() {
  redirect("/dev/voice");
}
