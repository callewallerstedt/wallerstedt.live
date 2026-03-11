import type { Metadata } from "next";
import Image from "next/image";

import { getSiteContent } from "@/lib/site-content";

export const metadata: Metadata = {
  title: "Learn Piano",
  description: "A draft page about Wallerstedt's practical way of learning piano by ear, repetition, and habit.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function LearnPage() {
  const siteContent = await getSiteContent();
  const signupHref = `mailto:${siteContent.contactEmail}?subject=Learn%20Piano%20Signup`;
  const contactHref = `mailto:${siteContent.contactEmail}?subject=Learn%20Piano%20Question`;

  return (
    <main className="learn-page">
      <section className="section learn-intro">
        <div className="container">
          <header className="learn-header" data-reveal>
            <p className="eyebrow">Learn Piano</p>
            <h1>A simple way to learn piano that actually feels human.</h1>
            <p className="learn-dek">
              This is not about formal lessons, sheet music, or pretending the process is neat. It is about learning by
              listening, repeating, messing up, trying again, and slowly getting better until playing starts to feel
              natural.
            </p>
            <div className="learn-header__actions">
              <a className="button button--primary" href={signupHref}>
                Sign up today
              </a>
            </div>
          </header>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <article className="learn-article" data-reveal>
            <figure className="learn-figure">
              <div className="learn-figure__media">
                <Image src="/media/artist-about.jpg" alt="Wallerstedt at the piano." fill sizes="(max-width: 900px) 100vw, 860px" />
              </div>
              <figcaption>The way I learned piano was never formal. It was just consistent.</figcaption>
            </figure>

            <div className="learn-prose">
              <p className="learn-lead-paragraph">
                I never took a single formal piano lesson in my life. I cannot read sheet music. I simply play, and if it
                sounds good, I am happy.
              </p>

              <blockquote className="learn-pullquote">
                <p>For me, piano was never about doing it the proper way. It was about wanting it badly enough to keep going.</p>
              </blockquote>

              <h2>How it started</h2>
              <p>
                Everything started on an old Casio keyboard. A kid in my class could play a song on the keyboard at school,
                and I remember being jealous. I wanted to do that too. The same day I went home, my mom helped me set up
                our old keyboard and showed me how it worked.
              </p>
              <p>
                Then I practiced for hours. Trust me, it did not sound good. I was furious that it did not work instantly.
                My fingers would not do what I wanted them to do, and I was only around eight or nine years old at the
                time, so my hands were tiny too. Nothing felt natural yet.
              </p>
              <p>
                Days, weeks, and months went by, and I kept playing anyway. After a week or two I had learned the same song
                that the other kid was playing, but by that point I had already forgotten why I started. The important part
                was not the song anymore. The important part was realizing that I could actually learn.
              </p>

              <h2>The first real breakthrough</h2>
              <p>
                One of the next songs I set out to learn was &quot;Wake Me Up&quot; by Avicii. That was a much bigger step. All
                of a sudden I had to use both hands, and that changed everything. It took longer, it was frustrating, and I
                remember spending hours and days trying to record myself playing it.
              </p>
              <p>
                I was never satisfied. I always messed up one note, or I would forget what to play in the middle, or the
                recording just did not feel good enough. But after many hours I finally did it. I played the full chorus
                with both hands and recorded it, and that felt huge to me.
              </p>
              <p>
                That is still how I think about learning piano. You do not need everything at once. You just need enough
                patience to stay with one hard thing until it becomes possible.
              </p>

              <h2>When it became a habit</h2>
              <p>
                After a few years, my mom realized this was not just some one-time hobby. I was not going to play piano for
                one weekend and stop. I was actually enjoying it. So we bought a better keyboard, a Yamaha P-115, with a
                more realistic sound, a sustain pedal, and a playing feel that was much closer to a real piano.
              </p>
              <p>
                Since then I have played almost every day. Sometimes that meant one minute, sometimes it meant three hours.
                It honestly did not matter that much. What mattered was that I kept at it long enough for it to become a
                habit.
              </p>
              <p>
                Like a lot of other teens, I also got into video games. My dad was not a huge fan of me spending four hours
                in front of the computer, so we made a rule: fifteen minutes of piano equaled one hour of screen time. So
                naturally, I played a lot of piano.
              </p>

              <figure className="learn-figure learn-figure--secondary">
                <div className="learn-figure__media">
                  <Image
                    src="/media/artist-portrait.jpg"
                    alt="Portrait of Wallerstedt."
                    fill
                    sizes="(max-width: 900px) 100vw, 760px"
                  />
                </div>
                <figcaption>At some point, daily practice stops feeling forced and starts feeling like part of you.</figcaption>
              </figure>

              <h2>The piano that changed everything</h2>
              <p>
                Fast forward to 2019 and we were fortunate enough to get a Yamaha GC2 grand piano. That is where I recorded
                my first videos for TikTok. It sounded great, but after around six months I realized I wanted something
                softer, older, and a little more personal.
              </p>
              <p>
                So I went on Facebook Marketplace and found an old upright piano that someone was giving away for free. I
                got my dad and our neighbor to help carry it, and we picked it up the next day. That piano was a Bannerman
                London upright.
              </p>
              <p>
                After I tuned it, I recorded my first TikTok with the new piano, and it got more views than any of my
                previous videos. The next one did well too. That is when I understood that the sound of that piano was
                special. It felt softer, warmer, and less generic than the grand piano.
              </p>
              <p>
                The old upright I got for free ended up changing everything for me. It is also the piano I recorded all my
                pieces on.
              </p>

              <h2>What this course is really about</h2>
              <p>
                This course is not about turning you into a formal classical pianist. It is about helping you sit down and
                actually learn songs in a practical way. I want to show you the process I use, how I approach a new song,
                how I break difficult parts into smaller pieces, and how I stay consistent enough to improve.
              </p>
              <p>
                I also want this to feel personal. If you join, I will help you directly by responding to questions and
                giving advice wherever I can. That part matters to me. I do not want this to feel distant or automated.
              </p>
              <p>
                If you want to learn to read sheet music, this course is probably not for you. But if you want to learn by
                ear, build confidence, understand how to practice songs in a real way, and make piano feel enjoyable
                instead of intimidating, then I think I can genuinely help.
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <section className="learn-offer" data-reveal>
            <p className="eyebrow">The Course</p>
            <h2>What you get if you join</h2>
            <p className="learn-offer__intro">
              I want to keep this affordable and useful, so for now I would price it at <strong>$59</strong>.
            </p>
            <ul className="learn-offer-list">
              <li>My exact process for learning new songs by ear.</li>
              <li>How I practice difficult sections and build coordination between both hands.</li>
              <li>Advice on how to stay consistent without making practice feel miserable.</li>
              <li>Personal help from me when you have questions or feel stuck.</li>
            </ul>
            <p className="learn-offer__note">
              The goal is simple: help you enjoy piano more, improve faster, and keep going long enough to become good.
            </p>
            <div className="button-row">
              <a className="button button--primary" href={signupHref}>
                Sign up today
              </a>
              <a className="button button--ghost" href={contactHref}>
                Contact
              </a>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
