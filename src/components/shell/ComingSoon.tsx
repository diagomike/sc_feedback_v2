export default function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="p-24">
      <div className="border border-border rounded-3 bg-panel2 px-16 py-20 max-w-560">
        <div className="text-13 font-semibold">{title}</div>
        <div className="text-11.5 text-dim mt-6 leading-relaxed">
          {note ?? "This screen is being built in a later phase of the rebuild."}
        </div>
      </div>
    </div>
  );
}
