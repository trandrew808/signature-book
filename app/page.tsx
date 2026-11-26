import { redirect } from "next/navigation";

/** Root → the studio app (landing page comes with the public launch). Guests only ever get event links. */
export default function Home() {
  redirect("/app");
}
