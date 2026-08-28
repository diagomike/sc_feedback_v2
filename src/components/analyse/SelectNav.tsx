"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

/** A <select> that navigates by updating one query param — used for the semester/
 *  target-group pickers on Analyse pages, which are otherwise plain Server Components. */
export default function SelectNav({
  param,
  value,
  options,
  className,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(param, v);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
