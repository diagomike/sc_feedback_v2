export default function Forbidden() {
  return (
    <div className="p-24">
      <div className="border border-bad rounded-3 bg-badbg px-16 py-20 max-w-560">
        <div className="text-13 font-semibold text-bad">You don&apos;t have access to this screen</div>
        <div className="text-11.5 text-dim mt-6 leading-relaxed">
          Your role or your hierarchy node doesn&apos;t permit this page. If you believe this is wrong, contact
          your system administrator.
        </div>
      </div>
    </div>
  );
}
