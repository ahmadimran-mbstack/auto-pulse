// Defines the shape of one verified pipeline run so every section reads from one place.
export type RealRun = {
  verified: boolean;
  accountLabel: string;
  date: string;
  topic: {
    title: string;
    facts: { text: string; sourceDomain: string }[];
  };
  hook: {
    style: string;
    openingLine: string;
  };
  rounds: {
    round: number;
    checkerScore: number;
    preview: string;
    revisionNote?: string;
  }[];
  finalPost: string;
  finalRound: number;
  stats?: {
    seconds: number;
    modelCalls: number;
  };
};

// Starts unverified with empty fields so no fake or invented data ever renders on the page.
export const realRun: RealRun = {
  verified: false,
  accountLabel: "",
  date: "",
  topic: {
    title: "",
    facts: [],
  },
  hook: {
    style: "",
    openingLine: "",
  },
  rounds: [],
  finalPost: "",
  finalRound: 0,
};

