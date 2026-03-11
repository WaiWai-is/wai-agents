/**
 * WaiAgents — TypeScript Backend Seed Data
 * Run: pnpm --filter @wai-agents/api db:seed
 */

import { randomUUID } from 'node:crypto';
import { sql } from './connection.js';
import { hashPassword } from '../modules/auth/auth.service.js';

async function seed() {
  console.log('=== WaiAgents Seed Script ===');

  // ─────────────────────────────────────────────────────────────────
  // 1. Users
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Creating users ---');

  const userAttrs = [
    { username: 'alex_dev', display_name: 'Alex Chen', email: 'alex@openraccoon.com', bio: 'Full-stack developer. Building tools that make developers\' lives easier.' },
    { username: 'maya_writer', display_name: 'Maya Johnson', email: 'maya@openraccoon.com', bio: 'Content creator and copywriter. Words are my superpower.' },
    { username: 'sam_designer', display_name: 'Sam Rivera', email: 'sam@openraccoon.com', bio: 'UI/UX designer and illustrator. Making the web beautiful.' },
    { username: 'jordan_student', display_name: 'Jordan Park', email: 'jordan@openraccoon.com', bio: 'CS student. Learning something new every day.' },
    { username: 'taylor_data', display_name: 'Taylor Kim', email: 'taylor@openraccoon.com', bio: 'Data scientist. Finding stories hidden in numbers.' },
    { username: 'riley_pm', display_name: 'Riley Morgan', email: 'riley@openraccoon.com', bio: 'Product manager. Shipping great products, one sprint at a time.' },
    { username: 'casey_research', display_name: 'Casey Williams', email: 'casey@openraccoon.com', bio: 'PhD researcher in NLP. Exploring the frontiers of language AI.' },
    { username: 'morgan_maker', display_name: 'Morgan Lee', email: 'morgan@openraccoon.com', bio: 'Indie maker. I ship something new every week.' },
    { username: 'avery_teacher', display_name: 'Avery Thompson', email: 'avery@openraccoon.com', bio: 'High school CS teacher. Inspiring the next generation of coders.' },
    { username: 'quinn_admin', display_name: 'Quinn Davis', email: 'quinn@openraccoon.com', bio: 'Platform moderator. Keeping the community safe and welcoming.' },
  ];

  const passwordHash = await hashPassword('TestPass123!');
  const userMap: Record<string, string> = {};

  for (const u of userAttrs) {
    const existing = await sql`SELECT id FROM users WHERE username = ${u.username} LIMIT 1`;
    if (existing.length > 0) {
      userMap[u.username] = (existing[0] as Record<string, unknown>)['id'] as string;
      console.log(`  User already exists: ${u.username}`);
      continue;
    }

    const id = randomUUID();
    const role = u.username === 'quinn_admin' ? 'admin' : 'user';
    const now = new Date().toISOString();

    await sql`
      INSERT INTO users (id, username, email, display_name, bio, role, inserted_at, updated_at)
      VALUES (${id}, ${u.username}, ${u.email}, ${u.display_name}, ${u.bio}, ${role}, ${now}, ${now})
    `;

    await sql`
      INSERT INTO user_credentials (id, user_id, password_hash, inserted_at, updated_at)
      VALUES (${randomUUID()}, ${id}, ${passwordHash}, ${now}, ${now})
    `;

    userMap[u.username] = id;
    console.log(`  Created user: ${u.username} (${id})`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 2. Marketplace Agents (public)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Creating marketplace agents ---');

  const agentDefs = [
    {
      creator: 'alex_dev', name: 'Code Assistant', slug: 'code-assistant', category: 'coding',
      system_prompt: 'You are an expert pair programmer and coding assistant. You write clean, well-documented, production-ready code. You explain your reasoning clearly, suggest best practices, and help debug issues efficiently. You support all major programming languages and frameworks.',
      description: 'Expert pair programmer that writes clean, documented code and helps debug issues.',
    },
    {
      creator: 'maya_writer', name: 'Writing Coach', slug: 'writing-coach', category: 'writing',
      system_prompt: 'You are a skilled writing coach and editor. You help improve grammar, tone, and structure. You adapt to different writing styles — from technical documentation to creative prose. You provide constructive feedback and specific suggestions for improvement.',
      description: 'Helps with grammar, tone, and structure for any type of writing.',
    },
    {
      creator: 'sam_designer', name: 'Design Helper', slug: 'design-helper', category: 'creative',
      system_prompt: 'You are a UI/UX design consultant. You provide advice on color theory, layout composition, typography, and accessibility. You help create cohesive design systems and review designs for usability issues. You stay current with modern design trends.',
      description: 'UI/UX advice, color theory, layout composition, and accessibility guidance.',
    },
    {
      creator: 'taylor_data', name: 'Data Analyzer', slug: 'data-analyzer', category: 'data',
      system_prompt: 'You are a data analysis expert. You help write SQL queries, Python pandas code, and create data visualizations. You explain statistical concepts clearly and help interpret data findings. You suggest appropriate analysis methods for different types of data.',
      description: 'SQL, Python pandas, data visualization, and statistical analysis.',
    },
    {
      creator: 'riley_pm', name: 'Project Planner', slug: 'project-planner', category: 'productivity',
      system_prompt: 'You are an experienced project manager and planning assistant. You help with sprint planning, roadmap creation, task prioritization, and resource allocation. You use frameworks like RICE, MoSCoW, and story mapping. You keep teams focused on delivering value.',
      description: 'Sprint planning, roadmaps, prioritization, and team coordination.',
    },
    {
      creator: 'casey_research', name: 'Research Navigator', slug: 'research-navigator', category: 'other',
      system_prompt: 'You are an academic research assistant. You help analyze research papers, conduct literature reviews, identify research gaps, and suggest methodologies. You understand citation formats, statistical methods, and academic writing conventions.',
      description: 'Academic paper analysis, literature review, and research methodology guidance.',
    },
    {
      creator: 'morgan_maker', name: 'Fun Chat Bot', slug: 'fun-chat-bot', category: 'other',
      system_prompt: 'You are a friendly and entertaining conversational companion. You tell jokes, share interesting trivia, play word games, and keep conversations fun and engaging. You have a warm personality and enjoy making people laugh while keeping things appropriate.',
      description: 'Casual conversation, jokes, trivia, and fun word games.',
    },
    {
      creator: 'avery_teacher', name: 'Study Buddy', slug: 'study-buddy', category: 'education',
      system_prompt: 'You are a patient and encouraging tutor. You explain complex concepts in simple terms, create practice problems, and adapt your teaching style to each student. You cover computer science, math, and science topics. You celebrate progress and encourage curiosity.',
      description: 'Tutoring, concept explanations, practice problems, and study strategies.',
    },
  ];

  const agentMap: Record<string, string> = {};

  for (const a of agentDefs) {
    const existing = await sql`SELECT id FROM agents WHERE slug = ${a.slug} LIMIT 1`;
    if (existing.length > 0) {
      agentMap[a.slug] = (existing[0] as Record<string, unknown>)['id'] as string;
      console.log(`  Agent already exists: ${a.name}`);
      continue;
    }

    const id = randomUUID();
    const creatorId = userMap[a.creator];
    const now = new Date().toISOString();

    await sql`
      INSERT INTO agents (id, creator_id, name, slug, description, system_prompt, model, category, visibility, tools, mcp_servers, metadata, inserted_at, updated_at)
      VALUES (${id}, ${creatorId}, ${a.name}, ${a.slug}, ${a.description}, ${a.system_prompt}, 'claude-sonnet-4-6', ${a.category}, 'public', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, ${now}, ${now})
    `;

    // Create SOUL core memories
    const soulBlocks = [
      { label: 'identity', content: `I am ${a.name}. ${a.description}` },
      { label: 'rules', content: '- Be helpful and honest.\n- Stay on topic.\n- Cite sources when making factual claims.' },
      { label: 'priorities', content: '1. Helpfulness\n2. Accuracy\n3. Safety' },
      { label: 'preferences', content: 'Respond clearly and concisely. Use examples when helpful.' },
    ];

    for (const block of soulBlocks) {
      await sql`
        INSERT INTO agent_core_memories (id, agent_id, block_label, content, inserted_at, updated_at)
        VALUES (${randomUUID()}, ${id}, ${block.label}, ${block.content}, ${now}, ${now})
      `;
    }

    agentMap[a.slug] = id;
    console.log(`  Created agent: ${a.name} (${id})`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 3. Conversations + Messages
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Creating conversations ---');

  async function createConversation(
    attrs: { type: string; title: string | null; creator_id: string; agent_id?: string },
    members: Array<{ user_id: string; role: string }>,
    msgs: Array<{ sender_id: string; sender_type: string; text: string }>,
  ) {
    // Check existing
    if (attrs.title) {
      const existing = await sql`
        SELECT id FROM conversations WHERE creator_id = ${attrs.creator_id} AND title = ${attrs.title} LIMIT 1
      `;
      if (existing.length > 0) {
        console.log(`  Conversation already exists: ${attrs.title}`);
        return;
      }
    }

    const convId = randomUUID();
    const now = new Date().toISOString();

    await sql`
      INSERT INTO conversations (id, type, title, creator_id, agent_id, metadata, inserted_at, updated_at)
      VALUES (${convId}, ${attrs.type}, ${attrs.title}, ${attrs.creator_id}, ${attrs.agent_id ?? null}, '{}'::jsonb, ${now}, ${now})
    `;

    // Add members
    for (const m of members) {
      await sql`
        INSERT INTO conversation_members (id, conversation_id, user_id, role, joined_at)
        VALUES (${randomUUID()}, ${convId}, ${m.user_id}, ${m.role}, ${now})
        ON CONFLICT DO NOTHING
      `;
    }

    // Insert messages
    const nowDate = new Date(now);
    let lastTs = now;
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const ts = new Date(nowDate.getTime() - (msgs.length - i) * 60_000).toISOString();
      const content = JSON.stringify([{ type: 'text', text: msg.text }]);

      await sql`
        INSERT INTO messages (id, conversation_id, sender_id, sender_type, type, content, metadata, created_at)
        VALUES (${randomUUID()}, ${convId}, ${msg.sender_id}, ${msg.sender_type}, 'text', ${content}::jsonb, '{}'::jsonb, ${ts})
      `;
      lastTs = ts;
    }

    // Update last_message_at
    await sql`UPDATE conversations SET last_message_at = ${lastTs}, updated_at = ${lastTs} WHERE id = ${convId}`;

    console.log(`  Created conversation: ${attrs.title ?? attrs.type} (${convId})`);
  }

  const alex = userMap['alex_dev'];
  const maya = userMap['maya_writer'];
  const sam = userMap['sam_designer'];
  const jordan = userMap['jordan_student'];
  const riley = userMap['riley_pm'];
  const morgan = userMap['morgan_maker'];
  const avery = userMap['avery_teacher'];

  // DM: Alex ↔ Maya
  await createConversation(
    { type: 'dm', title: 'Alex & Maya', creator_id: alex },
    [{ user_id: alex, role: 'owner' }, { user_id: maya, role: 'member' }],
    [
      { sender_id: alex, sender_type: 'user', text: "Hey Maya! I've been thinking about building a blog-writing agent. Would you be interested in collaborating?" },
      { sender_id: maya, sender_type: 'user', text: 'That sounds awesome! I could help design the writing prompts and style guidelines.' },
      { sender_id: alex, sender_type: 'user', text: "Perfect. I'll set up the agent config and we can iterate on the system prompt together." },
      { sender_id: maya, sender_type: 'user', text: "Looking forward to it! Send me a draft when you have something and I'll review the tone and structure." },
    ],
  );

  // DM: Jordan ↔ Avery
  await createConversation(
    { type: 'dm', title: 'Jordan & Avery', creator_id: jordan },
    [{ user_id: jordan, role: 'owner' }, { user_id: avery, role: 'member' }],
    [
      { sender_id: jordan, sender_type: 'user', text: 'Hey Avery, I\'m stuck on the recursion homework. Can binary search really be implemented recursively?' },
      { sender_id: avery, sender_type: 'user', text: 'Absolutely! Think of it this way: each recursive call narrows the search space by half. The base case is when left > right.' },
      { sender_id: jordan, sender_type: 'user', text: 'Oh that makes sense! So the midpoint check decides which half to recurse into. Thanks!' },
    ],
  );

  // Group: Maker Squad
  await createConversation(
    { type: 'group', title: 'Maker Squad', creator_id: morgan },
    [{ user_id: morgan, role: 'owner' }, { user_id: alex, role: 'member' }, { user_id: sam, role: 'member' }],
    [
      { sender_id: morgan, sender_type: 'user', text: 'Who\'s in for a weekend hackathon? I want to build something with the agent API.' },
      { sender_id: alex, sender_type: 'user', text: 'I\'m in! I\'ve been wanting to try chaining multiple agents together for a code review pipeline.' },
      { sender_id: sam, sender_type: 'user', text: 'Count me in too. I can design the UI while you two handle the backend.' },
      { sender_id: morgan, sender_type: 'user', text: 'Let\'s do it Saturday 10am. I\'ll set up the repo and share the link.' },
    ],
  );

  // Agent: Jordan + Study Buddy
  await createConversation(
    { type: 'agent', title: 'Study Buddy', creator_id: jordan, agent_id: agentMap['study-buddy'] },
    [{ user_id: jordan, role: 'owner' }],
    [
      { sender_id: jordan, sender_type: 'user', text: 'Can you explain how recursion works? I keep getting stack overflow errors.' },
      { sender_id: agentMap['study-buddy'], sender_type: 'agent', text: 'Great question! Recursion is when a function calls itself to solve smaller subproblems. The key ingredients are:\n\n1. **Base case** — a condition where the function stops calling itself\n2. **Recursive case** — the function calls itself with a simpler input\n\nStack overflows happen when there\'s no base case, or the input doesn\'t get smaller.' },
      { sender_id: jordan, sender_type: 'user', text: 'Yes please! Give me something to practice with.' },
    ],
  );

  // Agent: Riley + Project Planner
  await createConversation(
    { type: 'agent', title: 'Project Planner', creator_id: riley, agent_id: agentMap['project-planner'] },
    [{ user_id: riley, role: 'owner' }],
    [
      { sender_id: riley, sender_type: 'user', text: 'I need help planning a 2-week sprint for our mobile app team. We have 5 developers and about 20 backlog items.' },
      { sender_id: agentMap['project-planner'], sender_type: 'agent', text: "I'd love to help with that! Let's use a structured approach:\n\n1. **Capacity planning** — 5 devs × 10 days × ~6 productive hours = 300 dev-hours\n2. **Story point estimation** — Let's categorize your 20 items as S/M/L\n3. **Priority ranking** — Use RICE scoring\n\nCan you share your top 5 highest-priority backlog items?" },
    ],
  );

  // ─────────────────────────────────────────────────────────────────
  // 4. Feed Items
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Creating feed items ---');

  const feedDefs = [
    { creator: 'alex_dev', agent_slug: 'code-assistant', title: 'Code Assistant — Your AI Pair Programmer', description: 'Meet Code Assistant: a pair programmer that writes clean, documented code across all major languages.' },
    { creator: 'maya_writer', agent_slug: 'writing-coach', title: 'Writing Coach — Polish Your Prose', description: 'Whether you\'re writing docs, blog posts, or marketing copy, Writing Coach helps you nail the tone.' },
    { creator: 'sam_designer', agent_slug: 'design-helper', title: 'Design Helper — UI/UX at Your Fingertips', description: 'Get instant design feedback, color palette suggestions, and accessibility audits.' },
    { creator: 'taylor_data', agent_slug: 'data-analyzer', title: 'Data Analyzer — From Raw Data to Insights', description: 'Stop struggling with SQL and pandas. Data Analyzer helps you query, transform, and visualize data.' },
    { creator: 'avery_teacher', agent_slug: 'study-buddy', title: 'Study Buddy — Learn Anything, Your Way', description: 'A patient tutor that adapts to your learning style. Great for CS, math, and science.' },
    { creator: 'morgan_maker', agent_slug: 'fun-chat-bot', title: 'Fun Chat Bot — Your Daily Dose of Joy', description: 'Need a break? Fun Chat Bot tells jokes, shares trivia, and plays word games.' },
  ];

  for (const fd of feedDefs) {
    const creatorId = userMap[fd.creator];
    const agentId = agentMap[fd.agent_slug];

    const existing = await sql`
      SELECT id FROM feed_items WHERE creator_id = ${creatorId} AND reference_id = ${agentId} LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`  Feed item already exists for ${fd.agent_slug}`);
      continue;
    }

    // Ensure feed_item_reference exists
    await sql`
      INSERT INTO feed_item_references (id, reference_id, reference_type, exists_flag, inserted_at, updated_at)
      VALUES (${randomUUID()}, ${agentId}, 'agent', true, NOW(), NOW())
      ON CONFLICT (reference_id, reference_type) DO NOTHING
    `;

    const viewCount = Math.floor(Math.random() * 36) + 15;
    const likeCount = Math.floor(Math.random() * 16) + 5;

    await sql`
      INSERT INTO feed_items (id, creator_id, type, reference_id, reference_type, title, description, quality_score, trending_score, view_count, like_count, inserted_at, updated_at)
      VALUES (${randomUUID()}, ${creatorId}, 'agent_showcase', ${agentId}, 'agent', ${fd.title}, ${fd.description}, 0.8, 0.5, ${viewCount}, ${likeCount}, NOW(), NOW())
    `;

    console.log(`  Created feed item: ${fd.title}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 5. Agent Ratings
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Creating agent ratings ---');

  const ratingDefs = [
    { rater: 'jordan_student', agent_slug: 'study-buddy', rating: 5, review: 'Explains things so clearly!' },
    { rater: 'riley_pm', agent_slug: 'project-planner', rating: 4, review: 'Great for sprint planning' },
    { rater: 'maya_writer', agent_slug: 'code-assistant', rating: 5, review: 'Writes clean, well-documented code' },
    { rater: 'alex_dev', agent_slug: 'writing-coach', rating: 4, review: 'Really improved my documentation' },
    { rater: 'morgan_maker', agent_slug: 'data-analyzer', rating: 5, review: 'Perfect for quick data exploration' },
    { rater: 'sam_designer', agent_slug: 'fun-chat-bot', rating: 4, review: 'Always cheers me up' },
  ];

  for (const rd of ratingDefs) {
    const raterId = userMap[rd.rater];
    const agentId = agentMap[rd.agent_slug];

    await sql`
      INSERT INTO agent_ratings (id, agent_id, user_id, rating, review, inserted_at)
      VALUES (${randomUUID()}, ${agentId}, ${raterId}, ${rd.rating}, ${rd.review}, NOW())
      ON CONFLICT (agent_id, user_id) DO NOTHING
    `;

    // Update agent rating_sum and rating_count
    await sql`
      UPDATE agents SET
        rating_sum = COALESCE(rating_sum, 0) + ${rd.rating},
        rating_count = COALESCE(rating_count, 0) + 1
      WHERE id = ${agentId}
    `;

    console.log(`  ${rd.rater} rated ${rd.agent_slug}: ${rd.rating}/5`);
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. User Follows
  // ─────────────────────────────────────────────────────────────────
  console.log('\n--- Creating user follows ---');

  const followDefs = [
    { follower: 'jordan_student', following: 'avery_teacher' },
    { follower: 'jordan_student', following: 'alex_dev' },
    { follower: 'maya_writer', following: 'alex_dev' },
    { follower: 'alex_dev', following: 'maya_writer' },
    { follower: 'sam_designer', following: 'morgan_maker' },
    { follower: 'morgan_maker', following: 'sam_designer' },
    { follower: 'riley_pm', following: 'alex_dev' },
  ];

  for (const f of followDefs) {
    const followerId = userMap[f.follower];
    const followingId = userMap[f.following];

    await sql`
      INSERT INTO user_follows (id, follower_id, following_id, inserted_at)
      VALUES (${randomUUID()}, ${followerId}, ${followingId}, NOW())
      ON CONFLICT (follower_id, following_id) DO NOTHING
    `;

    console.log(`  ${f.follower} → ${f.following}`);
  }

  console.log('\n=== Seed complete! ===');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
