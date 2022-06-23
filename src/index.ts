import { Client } from "@notionhq/client";
import { Octokit } from "@octokit/core";
import { NotionToMarkdown } from "notion-to-md";
import { MdBlock } from "notion-to-md/build/types";

export interface Env {
  NOTION_TOKEN: string;
  GH_BOT_TOKEN: string;
}

const NOTE = `\n> This page is synced automatically from [The Guild's Notion](the-guild.dev)`;

async function getBotLogin(octokit: Octokit) {
  const {
    viewer: { login },
  } = await octokit.graphql(/* GraphQL */ `
    query {
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

function composeSignature(pageId: string): string {
  return `<!-- ${pageId} -->`;
}

function extractPageTitle(page: Page): string {
  return ((page as any).properties?.title || (page as any).properties?.Title)
    ?.title[0].plain_text;
}

async function getExistingDiscussions(octokit: Octokit, login: string) {
  const discussionsByBot = await octokit.graphql(
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
      q: `author:${login}`,
    }
  );

  return (discussionsByBot as any).search.nodes as {
    title: string;
    body: string;
    id: string;
    repository: {
      id: string;
      name: string;
      owner: {
        login: string;
      };
    };
  }[];
}

type Page = Awaited<ReturnType<Client["search"]>>["results"][number];

async function shouldDeletePage(mdBlocks: MdBlock[]) {
  if (
    mdBlocks.length > 0 &&
    mdBlocks[0].parent &&
    typeof mdBlocks[0].parent === "string" &&
    mdBlocks[0].parent.trim().startsWith("/github-public")
  ) {
    return false;
  }

  return true;
}

type Discussion = Awaited<ReturnType<typeof getExistingDiscussions>>[number];

type CreateRecord = {
  page: Page;
  repoId: string;
  categoryId: string;
  title: string;
  body: string;
};

type UpdateRecord = {
  page: Page;
  discussion: Discussion;
  categoryId: string;
  repoId: string;
  title: string;
  body: string;
};

type DeleteRecord = {
  discussion: Discussion;
  repoId: string;
};

async function buildUpdatePlan(
  octokit: Octokit,
  n2m: NotionToMarkdown,
  pages: Page[],
  discussions: Discussion[]
): Promise<{
  create: Array<CreateRecord>;
  update: Array<UpdateRecord>;
  delete: Array<DeleteRecord>;
}> {
  const toCreate: Array<CreateRecord> = [];
  const toUpdate: Array<UpdateRecord> = [];
  const toDelete: Array<DeleteRecord> = [];

  for (const page of pages) {
    console.info(`Building plan for page: `, page);
    const existingDiscussion = discussions.find((v) =>
      v.body.startsWith(composeSignature(page.id))
    );

    if (existingDiscussion) {
      const mdBlocks = await n2m.pageToMarkdown(page.id, 2);
      const shouldDelete = await shouldDeletePage(mdBlocks);

      console.log(`shouldDelete?`, shouldDelete, mdBlocks);

      if (shouldDelete) {
        toDelete.push({
          repoId: existingDiscussion.repository.id,
          discussion: existingDiscussion,
        });
      } else {
        const [, repo, categoryName = "general"] = mdBlocks[0].parent
          .trim()
          .split(" ");

        if (!repo) {
          console.log(`Skipping page: `, page);
          continue;
        }

        const [owner, name] = repo.split("/");
        const repoInfo = await getRepoInfo(octokit, name, owner);
        const category = repoInfo.discussionCategories.find(
          (d: any) => d.name.toLowerCase() === categoryName.toLowerCase()
        );

        if (!category) {
          throw new Error(`Category ${categoryName} not found in repo ${repo}`);
        }

        toUpdate.push({
          page,
          body: `${composeSignature(page.id)}\n${NOTE}\n${n2m.toMarkdownString(
            mdBlocks.slice(1)
          )}`,
          title: extractPageTitle(page),
          repoId: existingDiscussion.repository.id,
          discussion: existingDiscussion,
          categoryId: category.id,
        });
      }
    } else {
      const mdBlocks = await n2m.pageToMarkdown(page.id, 2);
      const [, repo, categoryName = "general"] = mdBlocks[0].parent
        .trim()
        .split(" ");

      if (!repo) {
        console.log(`Skipping page: `, page);
        continue;
      }

      const [owner, name] = repo.split("/");
      const repoInfo = await getRepoInfo(octokit, name, owner);
      const category = repoInfo.discussionCategories.find(
        (d: any) => d.name.toLowerCase() === categoryName.toLowerCase()
      );

      if (!category) {
        throw new Error(`Category ${categoryName} not found in repo ${repo}`);
      }

      console.log(page);

      toCreate.push({
        page,
        body: `${composeSignature(page.id)}\n${NOTE}\n${n2m.toMarkdownString(
          mdBlocks.slice(1)
        )}`,
        title: extractPageTitle(page),
        categoryId: category.id,
        repoId: repoInfo.id,
      });
    }
  }

  return {
    create: toCreate,
    delete: toDelete,
    update: toUpdate,
  };
}

async function getRepoInfo(octokit: Octokit, name: string, owner: string) {
  const { repository } = await octokit.graphql(
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

  return {
    id: repository.id as string,
    discussionCategories: repository.discussionCategories.nodes as {
      id: string;
      name: string;
    }[],
  };
}

async function createDiscussion(octokit: Octokit, record: CreateRecord) {
  const createdDiscussion = await octokit.graphql(
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
async function deleteDiscussion(octokit: Octokit, record: DeleteRecord) {
  await octokit.graphql(
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
async function updateDiscussion(octokit: Octokit, record: UpdateRecord) {
  await octokit.graphql(
    /* GraphQL */ `
      mutation deleteDiscussion(
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

async function run(env: Env) {
  const notion = new Client({
    auth: env.NOTION_TOKEN,
    notionVersion: "2022-02-22",
  });
  const n2m = new NotionToMarkdown({ notionClient: notion });
  const octokit = new Octokit({ auth: env.GH_BOT_TOKEN });
  const login = await getBotLogin(octokit);
  const relevantPages = await getSharedNotionPages(notion);
  const discussions = await getExistingDiscussions(octokit, login);
  const plan = await buildUpdatePlan(octokit, n2m, relevantPages, discussions);

  console.info(`Built sync plan:`, plan);

  for (const item of plan.delete) {
    console.info(
      `Deleting discussion with id ${item.discussion.id}: "${item.discussion.title}"`
    );
    await deleteDiscussion(octokit, item);
  }

  for (const item of plan.update) {
    console.info(
      `Updating discussion with id ${item.discussion.id}: "${item.title}"`
    );
    await updateDiscussion(octokit, item);
  }

  for (const item of plan.create) {
    console.info(`Creating discussion: "${item.title}"`);
    await createDiscussion(octokit, item);
  }

  return plan;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      const plan = await run(env);

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
    await run(env);
  },
};
