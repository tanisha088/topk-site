// The Top-K source registry. Layered deliberately: consolidators set the
// agenda, changelogs are the most actionable layer, leaderboards report
// movement, analysts supply interpretation and disagreement.
export const SOURCES = [
  // --- daily consolidators ---
  { url: 'https://news.smol.ai/',                        tier: 'consolidator' },
  { url: 'https://www.techmeme.com/feed.xml',            tier: 'consolidator' },
  { url: 'https://tldr.tech/api/rss/ai',                 tier: 'consolidator' },
  { url: 'https://aidailybrief.beehiiv.com/feed',        tier: 'consolidator' },
  { url: 'https://www.therundown.ai/feed',               tier: 'consolidator' },
  { url: 'https://www.theneurondaily.com/feed',          tier: 'consolidator' },

  // --- platform changelogs: highest actionability ---
  { url: 'https://developers.openai.com/api/docs/changelog',        tier: 'changelog' },
  { url: 'https://platform.claude.com/docs/en/release-notes/overview', tier: 'changelog' },
  { url: 'https://ai.google.dev/gemini-api/docs/changelog',         tier: 'changelog' },

  // --- leaderboards: report movement, not raw rankings ---
  { url: 'https://artificialanalysis.ai/leaderboards/models', tier: 'leaderboard' },
  { url: 'https://arena.ai/leaderboard',                      tier: 'leaderboard' },

  // --- analysts: interpretation, attribution, disagreement ---
  { url: 'https://thezvi.substack.com/feed',              tier: 'analyst' },
  { url: 'https://importai.substack.com/feed',            tier: 'analyst' },
  { url: 'https://www.interconnects.ai/feed',             tier: 'analyst' },
  { url: 'https://simonwillison.net/atom/everything/',    tier: 'analyst' },
  { url: 'https://www.oneusefulthing.org/feed',           tier: 'analyst' },
  { url: 'https://newsletter.pragmaticengineer.com/feed', tier: 'analyst' },
  { url: 'https://magazine.sebastianraschka.com/feed',    tier: 'analyst' },
  { url: 'https://www.exponentialview.co/feed',           tier: 'analyst' },
  { url: 'https://stratechery.com/feed/',                 tier: 'analyst' },
  { url: 'https://www.dwarkesh.com/feed',                 tier: 'analyst' },

  // --- critical counterweight: used to cross-check enthusiastic claims ---
  { url: 'https://garymarcus.substack.com/feed',          tier: 'counterweight' },
  { url: 'https://www.thealgorithmicbridge.com/feed',     tier: 'counterweight' },

  // --- community + research ---
  { url: 'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&hitsPerPage=30', tier: 'community' },
  { url: 'https://www.marktechpost.com/feed/',            tier: 'research' },
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', tier: 'industry' },
];
