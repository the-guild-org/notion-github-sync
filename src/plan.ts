import { Octokit } from "@octokit/core";
import { NotionToMarkdown } from "notion-to-md";
import { MdBlock } from "notion-to-md/build/types";
import {
  composeLink,
  composeSignature,
  extractPageTitle,
} from "./notion-helpers";
import {
  Discussion,
  DiscussionCreateRecord,
  DiscussionDeleteRecord,
  DiscussionUpdateRecord,
  getRepoInfo,
  Issue,
  IssueCreateRecord,
  IssueDeleteRecord,
  IssueUpdateRecord,
  Page,
} from "./utils";

export function distinguishPage(
  detectionBlock: MdBlock
):
  | { type: "issue"; repo: string }
  | { type: "discussion"; repo: string; categoryName: string }
  | null {
  if (!detectionBlock) {
    return null;
  }

  const content = detectionBlock.parent.trim().split(" ");

  if (content.length === 0) {
    return null;
  }

  const [declaration, repo, type, maybeCategory] = content;

  if (declaration !== "/github-public") {
    return null;
  }

  if (type === "issue") {
    return {
      type: "issue",
      repo,
    };
  } else if (type === "discussion") {
    return {
      type: "discussion",
      repo,
      categoryName: maybeCategory || "General",
    };
  } else {
    // this is legacy, just to support empty as discussion
    return {
      type: "discussion",
      repo,
      categoryName: type || "General",
    };
  }

  return null;
}

export async function buildUpdatePlan(
  octokit: Octokit,
  n2m: NotionToMarkdown,
  pages: Page[],
  discussions: Discussion[],
  issues: Issue[],
  headerNote: string
): Promise<{
  issues: {
    create: Array<IssueCreateRecord>;
    update: Array<IssueUpdateRecord>;
    delete: Array<IssueDeleteRecord>;
  };
  discussions: {
    create: Array<DiscussionCreateRecord>;
    update: Array<DiscussionUpdateRecord>;
    delete: Array<DiscussionDeleteRecord>;
  };
}> {
  const outputIssues: {
    create: Array<IssueCreateRecord>;
    update: Array<IssueUpdateRecord>;
    delete: Array<IssueDeleteRecord>;
  } = {
    create: [],
    update: [],
    delete: [],
  };
  const outputDiscussions: {
    create: Array<DiscussionCreateRecord>;
    update: Array<DiscussionUpdateRecord>;
    delete: Array<DiscussionDeleteRecord>;
  } = {
    create: [],
    update: [],
    delete: [],
  };

  await Promise.all(
    pages.map(async (page) => {
      const pageTitle = extractPageTitle(page);

      if (!pageTitle) {
        return;
      }

      console.info(`Building plan for page: `, pageTitle, page);
      const mdBlocks = await n2m.pageToMarkdown(page.id, 2);
      const pageAttributes = distinguishPage(mdBlocks[0]);
      const notionPageSignature = composeSignature(page.id);
      const existingDiscussion = discussions.find((v) =>
        v.body.startsWith(notionPageSignature)
      );
      const existingIssue = issues.find((v) =>
        v.body.startsWith(notionPageSignature)
      );

      if (pageAttributes === null) {
        if (existingDiscussion) {
          outputDiscussions.delete.push({
            repoId: existingDiscussion.repository.id,
            discussion: existingDiscussion,
          });
        }

        if (existingIssue) {
          outputIssues.delete.push({
            repoId: existingIssue.repository.id,
            issue: existingIssue,
          });
        }
      } else if (pageAttributes.type === "discussion") {
        const [owner, name] = pageAttributes.repo.split("/");
        const repoInfo = await getRepoInfo(octokit, name, owner);
        const category = (repoInfo.discussionCategories || []).find(
          (d: any) =>
            d.name.toLowerCase() === pageAttributes.categoryName.toLowerCase()
        );

        if (!category) {
          throw new Error(
            `Category ${pageAttributes.categoryName} not found in repo ${pageAttributes.repo}`
          );
        }

        if (existingDiscussion) {
          outputDiscussions.update.push({
            page,
            body: `${notionPageSignature}\n${headerNote}\n${composeLink(
              page
            )}\n${n2m.toMarkdownString(mdBlocks.slice(1))}`,
            title: pageTitle,
            repoId: existingDiscussion.repository.id,
            discussion: existingDiscussion,
            categoryId: category.id,
          });
        } else {
          outputDiscussions.create.push({
            page,
            body: `${notionPageSignature}\n${headerNote}\n${composeLink(
              page
            )}\n${n2m.toMarkdownString(mdBlocks.slice(1))}`,
            title: pageTitle,
            categoryId: category.id,
            repoId: repoInfo.id,
          });
        }
      } else if (pageAttributes.type === "issue") {
        if (existingIssue) {
          outputIssues.update.push({
            page,
            body: `${notionPageSignature}\n${headerNote}\n${composeLink(
              page
            )}\n${n2m.toMarkdownString(mdBlocks.slice(1))}`,
            title: pageTitle,
            repoId: existingIssue.repository.id,
            issue: existingIssue,
          });
        } else {
          const [owner, name] = pageAttributes.repo.split("/");
          const repoInfo = await getRepoInfo(octokit, name, owner);

          outputIssues.create.push({
            page,
            body: `${notionPageSignature}\n${headerNote}\n${composeLink(
              page
            )}\n${n2m.toMarkdownString(mdBlocks.slice(1))}`,
            title: pageTitle,
            repoId: repoInfo.id,
          });
        }
      }
    })
  );

  return {
    issues: outputIssues,
    discussions: outputDiscussions,
  };
}
