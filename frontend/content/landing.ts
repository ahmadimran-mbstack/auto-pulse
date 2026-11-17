// Stores all editable landing page copy for the three new sections in one file.
export interface PipelineNodeCopy {
  numeral: string;
  name: string;
  description: string;
  genericChip: string;
  targetHref: string;
  isHuman?: boolean;
  humanTag?: string;
}

// Copy for the Pipeline Map section right after the three facts row.
export const pipelineCopy = {
  pill: "The pipeline",
  headline: "Four agents work on every post before you see it.",
  subline: "Each agent has one job. If a draft isn’t good enough, it goes around again.",
  loopCaption: "Back to the writer until the score is under 15 out of 100",
  nodes: [
    {
      numeral: "01",
      name: "Topic finder",
      description:
        "Reads your profile and recent posts, then searches the web for a topic you haven’t covered.",
      genericChip: "Topic and sources",
      targetHref: "#feature-topic-finder",
    },
    {
      numeral: "02",
      name: "Hook strategist",
      description: "Chooses how the post opens.",
      genericChip: "Hook style",
      targetHref: "#feature-drafter",
    },
    {
      numeral: "03",
      name: "Writer",
      description: "Writes the full draft in your voice.",
      genericChip: "Opening lines",
      targetHref: "#feature-drafter",
    },
    {
      numeral: "04",
      name: "AI-writing checker",
      description:
        "Scores the draft and sends it back until the score is under 15 out of 100.",
      genericChip: "Score per round",
      targetHref: "#feature-checker",
    },
    {
      numeral: "05",
      name: "You approve",
      description:
        "Approve by email or in Slack. Nothing goes live before this.",
      genericChip: "Email or Slack",
      targetHref: "#feature-approval",
      isHuman: true,
      humanTag: "You",
    },
  ] satisfies PipelineNodeCopy[],
};

// Copy for the One Real Run section after the feature rows.
export const realRunCopy = {
  pill: "One real run",
  headline: "See what one post actually took.",
  subline: "One real run from our own account, shortened.",
  caption: "Shortened for length. Text and scores are exactly as produced.",
  stages: [
    { id: "topic", number: "01", label: "Topic" },
    { id: "hook", number: "02", label: "Hook" },
    { id: "rounds", number: "03", label: "Rounds" },
    { id: "final", number: "04", label: "Final post" },
  ] as const,
  passedFirstRound: "Passed on the first round",
  thresholdLabel: "Threshold: 15",
  showAllFacts: "Show all",
  showFewerFacts: "Show less",
  showMore: "Show more",
  showLess: "Show less",
  showFullPost: "Show full post",
  hideFullPost: "Show less",
};

// Copy for the Who It's For section after the real run.
export interface AudienceCardCopy {
  id: string;
  icon: "rocket" | "layers" | "briefcase";
  title: string;
  description: string;
  exampleLabel: string;
  exampleTopic: string;
}

export const whoItsForCopy = {
  headline: "Made for people who know their field and don’t have time to post.",
  ctaLabel: "Get started",
  ctaHref: "/auth/sign-up",
  cards: [
    {
      id: "founders",
      icon: "rocket",
      title: "Founders and operators",
      description:
        "You build the product, so you are the best person to talk about it.",
      exampleLabel: "Example topic",
      exampleTopic: "Why we dropped our free plan",
    },
    {
      id: "leaders",
      icon: "layers",
      title: "Engineering and product leaders",
      description:
        "You know why things work and why they fail. Your network learns from that.",
      exampleLabel: "Example topic",
      exampleTopic: "What broke when our task queue outgrew its first design",
    },
    {
      id: "consultants",
      icon: "briefcase",
      title: "Consultants and freelancers",
      description:
        "Your next client is reading LinkedIn. Show how you think.",
      exampleLabel: "Example topic",
      exampleTopic: "The question I now ask every client in the first call",
    },
  ] satisfies AudienceCardCopy[],
};

