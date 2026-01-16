// Fetches latest merged PR information from GitHub API

const REPO_OWNER = "50thycal";
const REPO_NAME = "party-games";

export interface PRInfo {
  prNumber: number;
  prTitle: string;
  mergedAt: string;
}

// Fallback info in case API fails
const fallbackInfo: PRInfo = {
  prNumber: 0,
  prTitle: "Unable to fetch",
  mergedAt: "",
};

export async function getLatestPR(): Promise<PRInfo> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=closed&sort=updated&direction=desc&per_page=10`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    );

    if (!response.ok) {
      console.error("GitHub API error:", response.status);
      return fallbackInfo;
    }

    const pulls = await response.json();

    // Find the first PR that was actually merged (not just closed)
    const mergedPR = pulls.find(
      (pr: { merged_at: string | null }) => pr.merged_at !== null
    );

    if (!mergedPR) {
      return fallbackInfo;
    }

    return {
      prNumber: mergedPR.number,
      prTitle: mergedPR.title,
      mergedAt: new Date(mergedPR.merged_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    };
  } catch (error) {
    console.error("Failed to fetch PR info:", error);
    return fallbackInfo;
  }
}
