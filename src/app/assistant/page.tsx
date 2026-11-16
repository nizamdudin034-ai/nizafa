import { createSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-server";
import { getSessionUser } from "@/lib/auth";
import { SectionTitle } from "@/components/ui";
import AssistantChat from "@/components/AssistantChat";
import type { TrendItem } from "@/lib/trends";

export const dynamic = "force-dynamic";

/** First word of a name, or null when there is nothing usable. */
function firstName(value: string | null | undefined): string | null {
  const first = (value ?? "").trim().split(/\s+/)[0] ?? "";
  return first.length > 0 ? first : null;
}

function stripChannelSuffix(title: string): string {
  return title.replace(/\s*\|\s*[^|]+$/, "").trim();
}

export default async function AssistantPage() {
  const user = await getSessionUser();
  const configured = isSupabaseConfigured();

  let greetingName: string | null = null;
  let channelTitle: string | null = null;
  let channelAvatar: string | null = null;
  let scriptTopic: string | null = null;

  if (user && configured) {
    try {
      const supabase = createSupabaseServer();
      const { data: appUser } = await supabase
        .from("app_users")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      greetingName = firstName(appUser?.name as string | null);

      const { data: ch } = await supabase
        .from("channels")
        .select("id,title,avatar_url")
        .eq("user_id", user.id)
        .eq("role", "own")
        .order("connected_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (ch) {
        channelTitle = ch.title as string;
        channelAvatar = ch.avatar_url as string | null;
        greetingName = greetingName ?? firstName(channelTitle);
      }

      // Topic for the "Write a script" card: today's top trending topic,
      // else the latest pack's topic, else the latest video's topic.
      const { data: snap } = await supabase
        .from("trending_snapshots")
        .select("items")
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const trends = ((snap?.items ?? []) as TrendItem[]).filter(
        (t) => t && typeof t.title === "string"
      );
      if (trends[0]) scriptTopic = trends[0].title;
      if (!scriptTopic) {
        const { data: pkg } = await supabase
          .from("packages")
          .select("topic")
          .eq("kind", "package")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (pkg?.topic) scriptTopic = pkg.topic as string;
      }
      if (!scriptTopic && ch) {
        const { data: vid } = await supabase
          .from("channel_videos")
          .select("title")
          .eq("channel_id", (ch as { id: number }).id)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (vid?.title) scriptTopic = stripChannelSuffix(vid.title as string);
      }
    } catch {
      // Greeting and card topics are a bonus — the chat works without them.
    }
  }

  // Suggestion cards are localised client-side (see AssistantChat):
  // the server only supplies the script topic; titles, subs and
  // prompts come from the Assistant's language tables.
  return (
    <>
      <AssistantChat
        greetingName={greetingName}
        channelTitle={channelTitle}
        channelAvatar={channelAvatar}
        scriptTopic={scriptTopic}
      />

      <section className="section">
        <SectionTitle title="What the Assistant knows" sub="Original guidance written for Nizafa creators." />
        <div className="grid grid-3">
          {[
            ["Titles & hooks", "Write titles people click, and openings that earn the click."],
            ["Tags & descriptions", "Help YouTube understand a video — without keyword stuffing."],
            ["Thumbnails & CTR", "One-second readability, and what a low click-through rate really means."],
            ["Posting times", "Your own upload history, not a generic “best time”."],
            ["Shorts & growth", "Discovery with Shorts, subscribers with long videos."],
            ["Your channel", "Subscribers, views and your best video — from your real data."],
          ].map(([t, b]) => (
            <div className="card" key={t}>
              <h3>{t}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>{b}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
