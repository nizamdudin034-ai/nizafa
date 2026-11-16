import { redirect } from "next/navigation";

// /academy moved to /learn (Masterclass-style restyle, 16 Nov 2026).
// The lessons, progress API and plan rules are unchanged — only the page
// moved, so old links keep working.
export default function AcademyRedirect() {
  redirect("/learn");
}
