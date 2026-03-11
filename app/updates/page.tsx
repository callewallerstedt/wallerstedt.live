import { UpdatesSignupForm } from "@/components/UpdatesSignupForm";

export default function UpdatesPage() {
  return (
    <main className="updates-page">
      <section className="updates-panel updates-panel--standalone" data-reveal>
        <p className="eyebrow">Updates</p>
        <h1>Get new release updates</h1>
        <p className="lead">
          Join the email list to hear about new music, upcoming releases, and other updates from Wallerstedt.
        </p>
        <UpdatesSignupForm />
        <p className="updates-note">No spam. Unsubscribe anytime. I only send emails when there is something worth sharing.</p>
      </section>
    </main>
  );
}
