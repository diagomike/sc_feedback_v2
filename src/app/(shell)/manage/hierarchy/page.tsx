import { redirect } from "next/navigation";

/** The five admin structure screens became one (see manage/structure). Kept as a redirect
 *  so bookmarks and any link written before the merge still land somewhere useful. */
export default function HierarchyPage() {
  redirect("/manage/structure");
}
