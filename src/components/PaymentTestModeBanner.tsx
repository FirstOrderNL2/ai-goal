const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;

export function PaymentTestModeBanner() {
  if (!clientToken?.startsWith("pk_test_")) return null;
  return (
    <div className="w-full bg-orange-100 border-b border-orange-300 px-4 py-2 text-center text-xs text-orange-800">
      Payments are in test mode. Use card{" "}
      <code className="font-mono">4242 4242 4242 4242</code>, any future expiry, any CVC.
    </div>
  );
}
