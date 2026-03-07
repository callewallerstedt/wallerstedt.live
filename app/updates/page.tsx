import { UpdatesSignupForm } from "@/components/UpdatesSignupForm";

export default function UpdatesPage() {
  return (
    <main className="song-main">
      <div className="container updates-shell">
        <section className="updates-panel" data-reveal>
          <p className="eyebrow">Updates</p>
          <h1>Get new release updates</h1>
          <p className="lead">
            Join the email list to hear about new music, upcoming releases, and other updates from Wallerstedt.
          </p>
          <UpdatesSignupForm />
        </section>
      </div>
    </main>
  );
}
