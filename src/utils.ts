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
import { Octokit } from "@octokit/core";
import { Client } from "@notionhq/client";

export type Page = Awaited<ReturnType<Client["search"]>>["results"][number];
export type DiscussionsSearchResult = NonNullable<
  MyDiscussionsQuery["search"]["nodes"]
>[number];
export type Discussion = Extract<
  DiscussionsSearchResult,
  { __typename: "Discussion" }
>;

export type IssuesSearchResult = NonNullable<
  MyIssuesQuery["search"]["nodes"]
>[number];
export type Issue = Extract<IssuesSearchResult, { __typename: "Issue" }>;

function isDiscussion(obj: DiscussionsSearchResult): obj is Discussion {
  return obj?.__typename === "Discussion";
}

export async function getExistingDiscussions(octokit: Octokit, login: string) {
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

export async function getExistingIssues(octokit: Octokit, login: string) {
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

export type IssueCreateRecord = {
  page: Page;
  repoId: string;
  title: string;
  body: string;
};

export type IssueUpdateRecord = {
  page: Page;
  issue: Issue;
  repoId: string;
  title: string;
  body: string;
};

export type IssueDeleteRecord = {
  issue: Issue;
  repoId: string;
};

export type DiscussionCreateRecord = {
  page: Page;
  repoId: string;
  categoryId: string;
  title: string;
  body: string;
};

export type DiscussionUpdateRecord = {
  page: Page;
  discussion: Discussion;
  categoryId: string;
  repoId: string;
  title: string;
  body: string;
};

export type DiscussionDeleteRecord = {
  discussion: Discussion;
  repoId: string;
};

const repoInfoCache = new Map<
  string,
  Awaited<ReturnType<typeof getRepoInfo>>
>();

export async function getRepoInfo(
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

export async function createDiscussion(
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

export async function createIssue(octokit: Octokit, record: IssueCreateRecord) {
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

export async function deleteDiscussion(
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

export async function deleteIssue(octokit: Octokit, record: IssueDeleteRecord) {
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

export async function updateDiscussion(
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

export async function updateIssue(octokit: Octokit, record: IssueUpdateRecord) {
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

export async function getBotLogin(octokit: Octokit) {
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
