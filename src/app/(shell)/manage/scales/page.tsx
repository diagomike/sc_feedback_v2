import { listScales } from "@/server/scales";
import ScalesClient from "./ScalesClient";

export default async function ScalesPage() {
  const scales = await listScales();
  return <ScalesClient scales={scales} />;
}
