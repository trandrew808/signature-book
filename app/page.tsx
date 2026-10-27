import { redirect } from "next/navigation";

/** The root is the team's landing: send it to the admin page. Guests only ever get event links. */
export default function Home() {
  redirect("/admin");
}
