"use client";

import type { ScopeInfo } from "@/server/scope";

export default function StatusBar({
  scope,
  minN,
  campaign,
}: {
  scope: ScopeInfo | null;
  minN: number;
  campaign?: string;
}) {
  return (
    <div className="bg-top text-topfg flex items-center gap-8 md:gap-12 px-10 text-10.5 flex-none min-w-0 overflow-hidden">
      {scope && (
        <>
          <span className="opacity-85 whitespace-nowrap flex-none max-w-[45vw] md:max-w-none overflow-hidden text-ellipsis">
            {scope.name}
            <span className="hidden sm:inline">
              {" "}
              · level {scope.level}
              {scope.isLeaf ? " · leaf" : ""}
            </span>
          </span>
          <span className="opacity-45 whitespace-nowrap flex-none">|</span>
        </>
      )}
      <span className="opacity-85 whitespace-nowrap flex-none">min-N {minN}</span>
      {campaign && (
        <>
          <span className="opacity-45 whitespace-nowrap flex-none hidden lg:inline">|</span>
          <span className="opacity-85 whitespace-nowrap flex-none hidden lg:inline">{campaign}</span>
        </>
      )}
      <div className="flex-1 min-w-8" />
      <span className="opacity-70 whitespace-nowrap overflow-hidden text-ellipsis min-w-0">
        <span className="hidden lg:inline">
          Responses are anonymous to every viewer · identities stored only for de-duplication
        </span>
        <span className="lg:hidden">Responses are anonymous</span>
      </span>
    </div>
  );
}
