import { Client } from "@notionhq/client";
import { Octokit } from "@octokit/core";
import { NotionToMarkdown } from "notion-to-md";
import { MdBlock } from "notion-to-md/build/types";
import {
  CreateDiscussionMutation,
  CreateIssueMutation,
  CurrentUserQuery,
  DeleteDiscussionMutation,
  DeleteIssueMutation,
  MyDiscussionsQuery,
  MyIssuesQuery,
  RepositoryQuery,
  UpdateDiscussionMutation,
  UpdateIssueMutation,
} from "./types";

export interface Env {
  NOTION_TOKEN: string;
  GH_BOT_TOKEN: string;
}

const HEADER_NOTE = `> This page is synced automatically from [The Guild's](https://the-guild.dev) Notion`;

async function getBotLogin(octokit: Octokit) {
  const {
    viewer: { login },
  } = await octokit.graphql<CurrentUserQuery>(/* GraphQL */ `
    query currentUser {
      viewer {
        login
      }
    }
  `);

  return login;
}

async function getSharedNotionPages(notion: Client) {
  const relevantPages = await notion.search({
    page_size: 100,
  });

  return relevantPages.results;
}

function composeLink(page: Page): string {
  if ((page as any).url) {
    return `> Notion page URL: ${(page as any).url}`;
  }

  return "";
}

function composeSignature(pageId: string): string {
  return `<!-- ${pageId} -->`;
}

function extractPageTitle(page: Page): string | null {
  const pageTitleProps =
    (page as any).properties?.title || (page as any).properties?.Title;

  if (!pageTitleProps) {
    return null;
  }

  try {
    const titleRecord = pageTitleProps.title?.[0];
    if (!titleRecord) {
      return null;
    }

    return titleRecord.plain_text || null;
  } catch (e) {
    console.error("failed on pageTitleProps", page);

    return null;
  }
}

type DiscussionsSearchResult = NonNullable<
  MyDiscussionsQuery["search"]["nodes"]
>[number];
type Discussion = Extract<
  DiscussionsSearchResult,
  { __typename: "Discussion" }
>;

type IssuesSearchResult = NonNullable<MyIssuesQuery["search"]["nodes"]>[number];
type Issue = Extract<IssuesSearchResult, { __typename: "Issue" }>;

function isDiscussion(obj: DiscussionsSearchResult): obj is Discussion {
  return obj?.__typename === "Discussion";
}

async function getExistingDiscussions(octokit: Octokit, login: string) {
  const discussionsByBot = await octokit.graphql<MyDiscussionsQuery>(
    /* GraphQL */ `
      query myDiscussions($q: String!) {
        search(type: DISCUSSION, query: $q, first: 100) {
          nodes {
            __typename
            ... on Discussion {
              title
              body
              repository {
                id
                owner {
                  login
                }
                name
              }
              author {
                login
              }
              id
            }
          }
        }
      }
    `,
    {
      q: `author:${login} -repo:the-guild-org/crisp-chats`,
    }
  );

  return (discussionsByBot.search.nodes || []).filter(isDiscussion);
}

function isIssue(obj: IssuesSearchResult): obj is Issue {
  return obj?.__typename === "Issue";
}

async function getExistingIssues(octokit: Octokit, login: string) {
  const issuesByBot = await octokit.graphql<MyIssuesQuery>(
    /* GraphQL */ `
      query myIssues($q: String!) {
        search(type: ISSUE, query: $q, first: 100) {
          nodes {
            __typename
            ... on Issue {
              title
              body
              repository {
                id
                owner {
                  login
                }
                name
              }
              author {
                login
              }
              id
            }
          }
        }
      }
    `,
    {
      q: `author:${login} -repo:the-guild-org/crisp-chats`,
    }
  );

  return (issuesByBot.search.nodes || []).filter(isIssue);
}

type Page = Awaited<ReturnType<Client["search"]>>["results"][number];

type IssueCreateRecord = {
  page: Page;
  repoId: string;
  title: string;
  body: string;
};

type IssueUpdateRecord = {
  page: Page;
  issue: Issue;
  repoId: string;
  title: string;
  body: string;
};

type IssueDeleteRecord = {
  issue: Issue;
  repoId: string;
};

type DiscussionCreateRecord = {
  page: Page;
  repoId: string;
  categoryId: string;
  title: string;
  body: string;
};

type DiscussionUpdateRecord = {
  page: Page;
  discussion: Discussion;
  categoryId: string;
  repoId: string;
  title: string;
  body: string;
};

type DiscussionDeleteRecord = {
  discussion: Discussion;
  repoId: string;
};

function distinguishPage(
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

async function buildUpdatePlan(
  octokit: Octokit,
  n2m: NotionToMarkdown,
  pages: Page[],
  discussions: Discussion[],
  issues: Issue[]
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
            body: `${notionPageSignature}\n${HEADER_NOTE}\n${composeLink(
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
            body: `${notionPageSignature}\n${HEADER_NOTE}\n${composeLink(
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
            body: `${notionPageSignature}\n${HEADER_NOTE}\n${composeLink(
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
            body: `${notionPageSignature}\n${HEADER_NOTE}\n${composeLink(
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

const repoInfoCache = new Map<
  string,
  Awaited<ReturnType<typeof getRepoInfo>>
>();

async function getRepoInfo(
  octokit: Octokit,
  name: string,
  owner: string
): Promise<{
  id: string;
  discussionCategories: ({
    __typename?: "DiscussionCategory" | undefined;
    id: string;
    name: string;
  } | null)[];
}> {
  const key = `${owner}/${name}`;

  if (repoInfoCache.has(key)) {
    return repoInfoCache.get(key)!;
  }

  const { repository } = await octokit.graphql<RepositoryQuery>(
    /* GraphQL */ `
      query repository($name: String!, $owner: String!) {
        repository(name: $name, owner: $owner, followRenames: true) {
          id
          discussionCategories(first: 50) {
            nodes {
              id
              name
            }
          }
        }
      }
    `,
    {
      name,
      owner,
    }
  );

  const result = {
    id: repository!.id,
    discussionCategories: repository?.discussionCategories.nodes || [],
  };

  repoInfoCache.set(key, result);

  return result;
}

async function createDiscussion(
  octokit: Octokit,
  record: DiscussionCreateRecord
) {
  await octokit.graphql<CreateDiscussionMutation>(
    /* GraphQL */ `
      mutation createDiscussion(
        $repoId: ID!
        $title: String!
        $body: String!
        $categoryId: ID!
      ) {
        createDiscussion(
          input: {
            repositoryId: $repoId
            title: $title
            body: $body
            categoryId: $categoryId
          }
        ) {
          clientMutationId
          discussion {
            id
            title
            url
          }
        }
      }
    `,
    {
      repoId: record.repoId,
      categoryId: record.categoryId,
      title: record.title,
      body: record.body,
    }
  );
}

async function createIssue(octokit: Octokit, record: IssueCreateRecord) {
  await octokit.graphql<CreateIssueMutation>(
    /* GraphQL */ `
      mutation createIssue($repoId: ID!, $title: String!, $body: String!) {
        createIssue(
          input: { repositoryId: $repoId, title: $title, body: $body }
        ) {
          clientMutationId
          issue {
            id
            title
            url
          }
        }
      }
    `,
    {
      repoId: record.repoId,
      title: record.title,
      body: record.body,
    }
  );
}

async function deleteDiscussion(
  octokit: Octokit,
  record: DiscussionDeleteRecord
) {
  await octokit.graphql<DeleteDiscussionMutation>(
    /* GraphQL */ `
      mutation deleteDiscussion($id: ID!) {
        deleteDiscussion(input: { id: $id }) {
          __typename
        }
      }
    `,
    {
      id: record.discussion.id,
    }
  );
}

async function deleteIssue(octokit: Octokit, record: IssueDeleteRecord) {
  await octokit.graphql<DeleteIssueMutation>(
    /* GraphQL */ `
      mutation deleteIssue($id: ID!) {
        deleteIssue(input: { issueId: $id }) {
          __typename
        }
      }
    `,
    {
      id: record.issue.id,
    }
  );
}

async function updateDiscussion(
  octokit: Octokit,
  record: DiscussionUpdateRecord
) {
  await octokit.graphql<UpdateDiscussionMutation>(
    /* GraphQL */ `
      mutation updateDiscussion(
        $id: ID!
        $title: String!
        $body: String!
        $categoryId: ID!
      ) {
        updateDiscussion(
          input: {
            discussionId: $id
            title: $title
            body: $body
            categoryId: $categoryId
          }
        ) {
          __typename
        }
      }
    `,
    {
      id: record.discussion.id,
      categoryId: record.categoryId,
      title: record.title,
      body: record.body,
    }
  );
}

async function updateIssue(octokit: Octokit, record: IssueUpdateRecord) {
  await octokit.graphql<UpdateIssueMutation>(
    /* GraphQL */ `
      mutation updateIssue($id: ID!, $title: String!, $body: String!) {
        updateIssue(input: { id: $id, title: $title, body: $body }) {
          __typename
        }
      }
    `,
    {
      id: record.issue.id,
      title: record.title,
      body: record.body,
    }
  );
}

async function run(env: Env) {
  const notion = new Client({
    auth: env.NOTION_TOKEN,
    notionVersion: "2022-02-22",
  });
  const n2m = new NotionToMarkdown({ notionClient: notion });
  const octokit = new Octokit({ auth: env.GH_BOT_TOKEN });
  const login = await getBotLogin(octokit);
  const [relevantPages, discussions, issues] = await Promise.all([
    getSharedNotionPages(notion),
    getExistingDiscussions(octokit, login),
    getExistingIssues(octokit, login),
  ]);
  console.log("existing issues found:", issues);
  const { discussions: discussionsPlan, issues: issuesPlan } =
    await buildUpdatePlan(octokit, n2m, relevantPages, discussions, issues);

  console.info(`Built Discussion sync plan:`, discussionsPlan);
  console.info(`Built Issues sync plan:`, issuesPlan);

  await Promise.all([
    ...discussionsPlan.delete.map(async (item) => {
      console.info(
        `Deleting discussion with id ${item.discussion.id}: "${item.discussion.title}"`
      );
      await deleteDiscussion(octokit, item);
    }),
    ...discussionsPlan.update.map(async (item) => {
      console.info(
        `Updating discussion with id ${item.discussion.id}: "${item.title}"`
      );
      await updateDiscussion(octokit, item);
    }),
    ...discussionsPlan.create.map(async (item) => {
      console.info(`Creating discussion: "${item.title}"`);
      await createDiscussion(octokit, item);
    }),
    ...issuesPlan.delete.map(async (item) => {
      console.info(
        `Deleting issue with id ${item.issue.id}: "${item.issue.title}"`
      );
      await deleteIssue(octokit, item);
    }),
    ...issuesPlan.update.map(async (item) => {
      console.info(`Updating issue with id ${item.issue.id}: "${item.title}"`);
      await updateIssue(octokit, item);
    }),
    ...issuesPlan.create.map(async (item) => {
      console.info(`Creating issue: "${item.title}"`);
      await createIssue(octokit, item);
    }),
  ]);

  return {
    discussionsPlan,
    issuesPlan,
  };
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      const plan = await run(env);
      console.info(`Sync result:`, plan);
      return new Response(JSON.stringify({ plan }), { status: 200 });
    } catch (e) {
      console.error(e);
      return new Response(
        JSON.stringify({
          error: (e as Error).message,
        }),
        {
          status: 500,
        }
      );
    }
  },
  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    console.info(`Scheduled sync result: `, await run(env));
  },
};
