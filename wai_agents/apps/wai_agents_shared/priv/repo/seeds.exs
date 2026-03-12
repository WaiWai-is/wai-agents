# WaiAgents — Seed Data
# Run: MIX_ENV=prod mix run apps/wai_agents_shared/priv/repo/seeds.exs

alias WaiAgentsShared.Repo
alias WaiAgentsAccounts
alias WaiAgentsAgents
alias WaiAgentsChat
alias WaiAgentsFeed
import Ecto.Query

IO.puts("=== WaiAgents Seed Script ===")

# ─────────────────────────────────────────────────────────────────────
# 1. Users
# ─────────────────────────────────────────────────────────────────────

IO.puts("\n--- Creating users ---")

user_attrs = [
  %{username: "alex_dev", display_name: "Alex Chen", email: "alex@openraccoon.com",
    password: "TestPass123!", bio: "Full-stack developer. Building tools that make developers' lives easier."},
  %{username: "maya_writer", display_name: "Maya Johnson", email: "maya@openraccoon.com",
    password: "TestPass123!", bio: "Content creator and copywriter. Words are my superpower."},
  %{username: "sam_designer", display_name: "Sam Rivera", email: "sam@openraccoon.com",
    password: "TestPass123!", bio: "UI/UX designer and illustrator. Making the web beautiful."},
  %{username: "jordan_student", display_name: "Jordan Park", email: "jordan@openraccoon.com",
    password: "TestPass123!", bio: "CS student. Learning something new every day."},
  %{username: "taylor_data", display_name: "Taylor Kim", email: "taylor@openraccoon.com",
    password: "TestPass123!", bio: "Data scientist. Finding stories hidden in numbers."},
  %{username: "riley_pm", display_name: "Riley Morgan", email: "riley@openraccoon.com",
    password: "TestPass123!", bio: "Product manager. Shipping great products, one sprint at a time."},
  %{username: "casey_research", display_name: "Casey Williams", email: "casey@openraccoon.com",
    password: "TestPass123!", bio: "PhD researcher in NLP. Exploring the frontiers of language AI."},
  %{username: "morgan_maker", display_name: "Morgan Lee", email: "morgan@openraccoon.com",
    password: "TestPass123!", bio: "Indie maker. I ship something new every week."},
  %{username: "avery_teacher", display_name: "Avery Thompson", email: "avery@openraccoon.com",
    password: "TestPass123!", bio: "High school CS teacher. Inspiring the next generation of coders."},
  %{username: "quinn_admin", display_name: "Quinn Davis", email: "quinn@openraccoon.com",
    password: "TestPass123!", bio: "Platform moderator. Keeping the community safe and welcoming."}
]

users =
  for attrs <- user_attrs do
    case WaiAgentsAccounts.get_user_by_username(attrs.username) do
      nil ->
        {:ok, user} = WaiAgentsAccounts.register_user(attrs)
        IO.puts("  Created user: #{user.username} (#{user.id})")
        user

      existing ->
        IO.puts("  User already exists: #{existing.username} (#{existing.id})")
        existing
    end
  end

# Make quinn_admin an admin
quinn = Enum.find(users, &(&1.username == "quinn_admin"))
if quinn.role != :admin do
  {:ok, quinn} = WaiAgentsAccounts.update_user(quinn, %{role: :admin})
  IO.puts("  Updated quinn_admin to admin role")
end

# Build a username->user lookup map
user_map = Map.new(users, fn u -> {u.username, u} end)

# ─────────────────────────────────────────────────────────────────────
# 2. Marketplace Agents (public)
# ─────────────────────────────────────────────────────────────────────

IO.puts("\n--- Creating marketplace agents ---")

agent_defs = [
  %{
    creator: "alex_dev", name: "Code Assistant", slug: "code-assistant", category: "coding",
    system_prompt: "You are an expert pair programmer and coding assistant. You write clean, well-documented, production-ready code. You explain your reasoning clearly, suggest best practices, and help debug issues efficiently. You support all major programming languages and frameworks.",
    description: "Expert pair programmer that writes clean, well-documented code and helps debug issues."
  },
  %{
    creator: "maya_writer", name: "Writing Coach", slug: "writing-coach", category: "writing",
    system_prompt: "You are a skilled writing coach and editor. You help improve grammar, tone, and structure. You adapt to different writing styles — from technical documentation to creative prose. You provide constructive feedback and specific suggestions for improvement.",
    description: "Helps with grammar, tone, and structure for any type of writing."
  },
  %{
    creator: "sam_designer", name: "Design Helper", slug: "design-helper", category: "creative",
    system_prompt: "You are a UI/UX design consultant. You provide advice on color theory, layout composition, typography, and accessibility. You help create cohesive design systems and review designs for usability issues. You stay current with modern design trends.",
    description: "UI/UX advice, color theory, layout composition, and accessibility guidance."
  },
  %{
    creator: "taylor_data", name: "Data Analyzer", slug: "data-analyzer", category: "data",
    system_prompt: "You are a data analysis expert. You help write SQL queries, Python pandas code, and create data visualizations. You explain statistical concepts clearly and help interpret data findings. You suggest appropriate analysis methods for different types of data.",
    description: "SQL, Python pandas, data visualization, and statistical analysis."
  },
  %{
    creator: "riley_pm", name: "Project Planner", slug: "project-planner", category: "productivity",
    system_prompt: "You are an experienced project manager and planning assistant. You help with sprint planning, roadmap creation, task prioritization, and resource allocation. You use frameworks like RICE, MoSCoW, and story mapping. You keep teams focused on delivering value.",
    description: "Sprint planning, roadmaps, prioritization, and team coordination."
  },
  %{
    creator: "casey_research", name: "Research Navigator", slug: "research-navigator", category: "other",
    system_prompt: "You are an academic research assistant. You help analyze research papers, conduct literature reviews, identify research gaps, and suggest methodologies. You understand citation formats, statistical methods, and academic writing conventions.",
    description: "Academic paper analysis, literature review, and research methodology guidance."
  },
  %{
    creator: "morgan_maker", name: "Fun Chat Bot", slug: "fun-chat-bot", category: "other",
    system_prompt: "You are a friendly and entertaining conversational companion. You tell jokes, share interesting trivia, play word games, and keep conversations fun and engaging. You have a warm personality and enjoy making people laugh while keeping things appropriate.",
    description: "Casual conversation, jokes, trivia, and fun word games."
  },
  %{
    creator: "avery_teacher", name: "Study Buddy", slug: "study-buddy", category: "education",
    system_prompt: "You are a patient and encouraging tutor. You explain complex concepts in simple terms, create practice problems, and adapt your teaching style to each student. You cover computer science, math, and science topics. You celebrate progress and encourage curiosity.",
    description: "Tutoring, concept explanations, practice problems, and study strategies."
  }
]

agents =
  for a <- agent_defs do
    creator = Map.fetch!(user_map, a.creator)
    case WaiAgentsAgents.get_agent_by_slug(a.slug) do
      nil ->
        {:ok, agent} = WaiAgentsAgents.create_agent(%{
          creator_id: creator.id,
          name: a.name,
          slug: a.slug,
          description: a.description,
          system_prompt: a.system_prompt,
          category: a.category,
          visibility: :public,
          temperature: 0.7,
          max_tokens: 4096
        })
        IO.puts("  Created agent: #{agent.name} (#{agent.id})")
        agent

      existing ->
        IO.puts("  Agent already exists: #{existing.name} (#{existing.id})")
        existing
    end
  end

agent_map = Map.new(agents, fn a -> {a.slug, a} end)

# ─────────────────────────────────────────────────────────────────────
# 3. Conversations + Messages
# ─────────────────────────────────────────────────────────────────────

IO.puts("\n--- Creating conversations ---")

# Helper to create a conversation, add members, and insert messages
defmodule SeedHelpers do
  alias WaiAgentsShared.Repo
  alias WaiAgentsChat.{Conversation, ConversationMember, Message}
  import Ecto.Query

  def find_or_create_conversation(attrs, members, messages) do
    # Check if conversation with this title already exists for the creator
    existing =
      case attrs[:title] do
        nil -> nil
        title ->
          Repo.one(
            from c in Conversation,
              where: c.creator_id == ^attrs.creator_id and c.title == ^title,
              limit: 1
          )
      end

    case existing do
      nil ->
        {:ok, conv} = WaiAgentsChat.create_conversation(attrs)
        IO.puts("  Created conversation: #{conv.title || conv.type} (#{conv.id})")

        # Add members
        for {user_id, role} <- members do
          WaiAgentsChat.add_member(%{
            conversation_id: conv.id,
            user_id: user_id,
            role: role,
            joined_at: DateTime.utc_now()
          })
        end

        # Insert messages
        last_ts = insert_messages(conv.id, messages)

        # Update last_message_at
        if last_ts do
          conv
          |> Conversation.changeset(%{last_message_at: last_ts})
          |> Repo.update!()
        end

        conv

      existing ->
        IO.puts("  Conversation already exists: #{existing.title || existing.type} (#{existing.id})")
        existing
    end
  end

  def insert_messages(conversation_id, messages) do
    messages
    |> Enum.with_index()
    |> Enum.reduce(nil, fn {msg, idx}, _acc ->
      ts = DateTime.add(DateTime.utc_now(), -(length(messages) - idx) * 60, :second)

      %Message{}
      |> Message.changeset(%{
        conversation_id: conversation_id,
        sender_id: msg.sender_id,
        sender_type: msg.sender_type,
        type: :text,
        content: %{"text" => msg.text}
      })
      |> Ecto.Changeset.put_change(:created_at, ts)
      |> Repo.insert!()

      ts
    end)
  end
end

alex = user_map["alex_dev"]
maya = user_map["maya_writer"]
sam = user_map["sam_designer"]
jordan = user_map["jordan_student"]
riley = user_map["riley_pm"]
morgan = user_map["morgan_maker"]
avery = user_map["avery_teacher"]

study_buddy = agent_map["study-buddy"]
project_planner = agent_map["project-planner"]

# DM: Alex ↔ Maya
SeedHelpers.find_or_create_conversation(
  %{type: :dm, title: "Alex & Maya", creator_id: alex.id},
  [{alex.id, :owner}, {maya.id, :member}],
  [
    %{sender_id: alex.id, sender_type: :human, text: "Hey Maya! I've been thinking about building a blog-writing agent. Would you be interested in collaborating?"},
    %{sender_id: maya.id, sender_type: :human, text: "That sounds awesome! I could help design the writing prompts and style guidelines."},
    %{sender_id: alex.id, sender_type: :human, text: "Perfect. I'll set up the agent config and we can iterate on the system prompt together."},
    %{sender_id: maya.id, sender_type: :human, text: "Looking forward to it! Send me a draft when you have something and I'll review the tone and structure."}
  ]
)

# DM: Jordan ↔ Avery
SeedHelpers.find_or_create_conversation(
  %{type: :dm, title: "Jordan & Avery", creator_id: jordan.id},
  [{jordan.id, :owner}, {avery.id, :member}],
  [
    %{sender_id: jordan.id, sender_type: :human, text: "Hey Avery, I'm stuck on the recursion homework. Can binary search really be implemented recursively?"},
    %{sender_id: avery.id, sender_type: :human, text: "Absolutely! Think of it this way: each recursive call narrows the search space by half. The base case is when left > right."},
    %{sender_id: jordan.id, sender_type: :human, text: "Oh that makes sense! So the midpoint check decides which half to recurse into. Thanks!"}
  ]
)

# Group: Maker Squad
SeedHelpers.find_or_create_conversation(
  %{type: :group, title: "Maker Squad", creator_id: morgan.id},
  [{morgan.id, :owner}, {alex.id, :member}, {sam.id, :member}],
  [
    %{sender_id: morgan.id, sender_type: :human, text: "Who's in for a weekend hackathon? I want to build something with the agent API."},
    %{sender_id: alex.id, sender_type: :human, text: "I'm in! I've been wanting to try chaining multiple agents together for a code review pipeline."},
    %{sender_id: sam.id, sender_type: :human, text: "Count me in too. I can design the UI while you two handle the backend."},
    %{sender_id: morgan.id, sender_type: :human, text: "Let's do it Saturday 10am. I'll set up the repo and share the link."}
  ]
)

# Agent: Jordan + Study Buddy
SeedHelpers.find_or_create_conversation(
  %{type: :agent, title: "Study Buddy", creator_id: jordan.id, agent_id: study_buddy.id},
  [{jordan.id, :owner}],
  [
    %{sender_id: jordan.id, sender_type: :human, text: "Can you explain how recursion works? I keep getting stack overflow errors."},
    %{sender_id: jordan.id, sender_type: :agent, text: "Great question! Recursion is when a function calls itself to solve smaller subproblems. The key ingredients are:\n\n1. **Base case** — a condition where the function stops calling itself\n2. **Recursive case** — the function calls itself with a simpler input\n\nStack overflows happen when there's no base case, or the input doesn't get smaller. For example:\n\n```python\ndef factorial(n):\n    if n <= 1:  # base case\n        return 1\n    return n * factorial(n - 1)  # recursive case\n```\n\nWould you like to try a practice problem?"},
    %{sender_id: jordan.id, sender_type: :human, text: "Yes please! Give me something to practice with."}
  ]
)

# Agent: Riley + Project Planner
SeedHelpers.find_or_create_conversation(
  %{type: :agent, title: "Project Planner", creator_id: riley.id, agent_id: project_planner.id},
  [{riley.id, :owner}],
  [
    %{sender_id: riley.id, sender_type: :human, text: "I need help planning a 2-week sprint for our mobile app team. We have 5 developers and about 20 backlog items."},
    %{sender_id: riley.id, sender_type: :agent, text: "I'd love to help with that! Let's use a structured approach:\n\n1. **Capacity planning** — 5 devs × 10 days × ~6 productive hours = 300 dev-hours\n2. **Story point estimation** — Let's categorize your 20 items as S/M/L\n3. **Priority ranking** — Use RICE scoring (Reach, Impact, Confidence, Effort)\n\nCan you share your top 5 highest-priority backlog items? I'll help you estimate and sequence them."}
  ]
)

# ─────────────────────────────────────────────────────────────────────
# 4. Feed Items
# ─────────────────────────────────────────────────────────────────────

IO.puts("\n--- Creating feed items ---")

feed_defs = [
  %{creator: "alex_dev", agent_slug: "code-assistant",
    title: "Code Assistant — Your AI Pair Programmer",
    description: "Meet Code Assistant: a pair programmer that writes clean, documented code across all major languages. Try it for debugging, code reviews, or building from scratch."},
  %{creator: "maya_writer", agent_slug: "writing-coach",
    title: "Writing Coach — Polish Your Prose",
    description: "Whether you're writing docs, blog posts, or marketing copy, Writing Coach helps you nail the tone, fix grammar, and structure your ideas clearly."},
  %{creator: "sam_designer", agent_slug: "design-helper",
    title: "Design Helper — UI/UX at Your Fingertips",
    description: "Get instant design feedback, color palette suggestions, and accessibility audits. Design Helper knows modern design trends and best practices."},
  %{creator: "taylor_data", agent_slug: "data-analyzer",
    title: "Data Analyzer — From Raw Data to Insights",
    description: "Stop struggling with SQL and pandas. Data Analyzer helps you query, transform, and visualize data with clear explanations of statistical methods."},
  %{creator: "avery_teacher", agent_slug: "study-buddy",
    title: "Study Buddy — Learn Anything, Your Way",
    description: "A patient tutor that adapts to your learning style. Great for CS, math, and science. Includes practice problems and step-by-step explanations."},
  %{creator: "morgan_maker", agent_slug: "fun-chat-bot",
    title: "Fun Chat Bot — Your Daily Dose of Joy",
    description: "Need a break? Fun Chat Bot tells jokes, shares trivia, and plays word games. Perfect for unwinding between coding sessions."}
]

for fd <- feed_defs do
  creator = Map.fetch!(user_map, fd.creator)
  agent = Map.fetch!(agent_map, fd.agent_slug)

  # Check if feed item already exists for this agent
  existing = Repo.one(
    from fi in WaiAgentsFeed.FeedItem,
      where: fi.creator_id == ^creator.id and fi.reference_id == ^agent.id,
      limit: 1
  )

  if existing do
    IO.puts("  Feed item already exists for #{agent.name}")
  else
    # Ensure feed_item_reference exists
    alias WaiAgentsFeed.FeedItemReference
    ref_exists = Repo.one(
      from r in FeedItemReference,
        where: r.reference_id == ^agent.id and r.reference_type == :agent,
        limit: 1
    )

    unless ref_exists do
      %FeedItemReference{}
      |> FeedItemReference.changeset(%{reference_id: agent.id, reference_type: :agent})
      |> Repo.insert!()
    end

    # Insert feed item directly (bypass quality pipeline for seeds)
    view_count = Enum.random(15..50)
    like_count = Enum.random(5..20)

    %WaiAgentsFeed.FeedItem{}
    |> WaiAgentsFeed.FeedItem.changeset(%{
      creator_id: creator.id,
      type: :agent_showcase,
      reference_id: agent.id,
      reference_type: :agent,
      title: fd.title,
      description: fd.description
    })
    |> Ecto.Changeset.put_change(:quality_score, 0.8)
    |> Ecto.Changeset.put_change(:trending_score, 0.5)
    |> Ecto.Changeset.put_change(:view_count, view_count)
    |> Ecto.Changeset.put_change(:like_count, like_count)
    |> Repo.insert!()

    IO.puts("  Created feed item: #{fd.title}")
  end
end

# ─────────────────────────────────────────────────────────────────────
# 5. Agent Ratings
# ─────────────────────────────────────────────────────────────────────

IO.puts("\n--- Creating agent ratings ---")

rating_defs = [
  %{rater: "jordan_student", agent_slug: "study-buddy", rating: 5, review: "Explains things so clearly!"},
  %{rater: "riley_pm", agent_slug: "project-planner", rating: 4, review: "Great for sprint planning"},
  %{rater: "maya_writer", agent_slug: "code-assistant", rating: 5, review: "Writes clean, well-documented code"},
  %{rater: "alex_dev", agent_slug: "writing-coach", rating: 4, review: "Really improved my documentation"},
  %{rater: "morgan_maker", agent_slug: "data-analyzer", rating: 5, review: "Perfect for quick data exploration"},
  %{rater: "sam_designer", agent_slug: "fun-chat-bot", rating: 4, review: "Always cheers me up"}
]

for rd <- rating_defs do
  rater = Map.fetch!(user_map, rd.rater)
  agent = Map.fetch!(agent_map, rd.agent_slug)

  case WaiAgentsAgents.rate_agent(%{
    agent_id: agent.id,
    user_id: rater.id,
    rating: rd.rating,
    review: rd.review
  }) do
    {:ok, _} -> IO.puts("  #{rd.rater} rated #{agent.name}: #{rd.rating}/5")
    {:error, _} -> IO.puts("  Rating already exists: #{rd.rater} → #{agent.name}")
  end
end

IO.puts("\n=== Seed complete! ===")
