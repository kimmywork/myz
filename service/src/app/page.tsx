import Link from "next/link";

export default function Home() {
  return (
    <section className="space-y-10 rounded-3xl border border-white/10 bg-white/5 p-10 text-white shadow-xl shadow-black/20">
      <h1 className="text-3xl font-semibold tracking-tight">MyZ Annotator Sync Service</h1>
      <p className="max-w-3xl text-base text-white/70">
        Welcome to the management portal for MyZ Annotator. Use this space to
        register new accounts, review recent synchronization runs, and inspect
        the data collected from the browser extension. The portal exposes the
        same APIs that the extension uses, enabling you to test flows end to end
        directly from the browser.
      </p>
      <div className="grid gap-6 md:grid-cols-3">
        <FeatureCard
          title="Register"
          description="Create a new account, validate captcha, and trigger email verification in a single guided flow."
          href="/register"
        />
        <FeatureCard
          title="Log In"
          description="Authenticate with your verified email or an OAuth provider to receive sync tokens."
          href="/login"
        />
        <FeatureCard
          title="Dashboard"
          description="Inspect sync history, audit stored payloads, and trigger manual refreshes once authenticated."
          href="/dashboard"
        />
      </div>
    </section>
  );
}

type FeatureCardProps = {
  title: string;
  description: string;
  href: string;
};

function FeatureCard({ title, description, href }: FeatureCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-white/40 hover:bg-white/10"
    >
      <h2 className="text-xl font-semibold text-white group-hover:text-white">
        {title}
      </h2>
      <p className="mt-3 text-sm text-white/60 group-hover:text-white/80">
        {description}
      </p>
    </Link>
  );
}
