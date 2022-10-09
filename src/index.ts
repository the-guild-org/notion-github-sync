import { Client } from "@notionhq/client";
import { Octokit } from "@octokit/core";
import { NotionToMarkdown } from "notion-to-md";
import { getSharedNotionPages } from "./notion-helpers";
import { buildUpdatePlan } from "./plan";
import {
  createDiscussion,
  createIssue,
  deleteDiscussion,
  deleteIssue,
  getBotLogin,
  getExistingDiscussions,
  getExistingIssues,
  updateDiscussion,
  updateIssue,
} from "./utils";

export interface Env {
  NOTION_TOKEN: string;
  GH_BOT_TOKEN: string;
  DRY_RUN?: string;
  ENABLE_FETCH?: string;
  CUSTOM_HEADER_LINK?: string;
}

async function run(env: Env) {
  const shouldExecute = !env.DRY_RUN;
  const botBrand = env.CUSTOM_HEADER_LINK ? `${env.CUSTOM_HEADER_LINK} ` : "";
  const headerNote = `> This page is synced automatically from ${botBrand}Notion`;
  const notion = new Client({
    auth: env.NOTION_TOKEN,
    notionVersion: "2022-06-28",
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
    await buildUpdatePlan(
      octokit,
      n2m,
      relevantPages,
      discussions,
      issues,
      headerNote
    );

  console.info(`Built Discussion sync plan:`, discussionsPlan);
  console.info(`Built Issues sync plan:`, issuesPlan);

  await Promise.all([
    ...discussionsPlan.delete.map(async (item) => {
      console.info(
        `Deleting discussion with id ${item.discussion.id}: "${item.discussion.title}"`
      );
      shouldExecute && (await deleteDiscussion(octokit, item));
    }),
    ...discussionsPlan.update.map(async (item) => {
      console.info(
        `Updating discussion with id ${item.discussion.id}: "${item.title}"`
      );
      shouldExecute && (await updateDiscussion(octokit, item));
    }),
    ...discussionsPlan.create.map(async (item) => {
      console.info(`Creating discussion: "${item.title}"`);
      shouldExecute && (await createDiscussion(octokit, item));
    }),
    ...issuesPlan.delete.map(async (item) => {
      console.info(
        `Deleting issue with id ${item.issue.id}: "${item.issue.title}"`
      );
      shouldExecute && (await deleteIssue(octokit, item));
    }),
    ...issuesPlan.update.map(async (item) => {
      console.info(`Updating issue with id ${item.issue.id}: "${item.title}"`);
      shouldExecute && (await updateIssue(octokit, item));
    }),
    ...issuesPlan.create.map(async (item) => {
      console.info(`Creating issue: "${item.title}"`);
      shouldExecute && (await createIssue(octokit, item));
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
    if (!env.ENABLE_FETCH) {
      return new Response(
        JSON.stringify({
          error: `Manual execution for this bot is not enabled. If you with to enable it, please set ENABLE_FETCH=1`,
        }),
        { status: 400 }
      );
    }

    try {
      const plan = await run(env);
      console.info(`Sync result:`, plan);
      return new Response(JSON.stringify({ plan }), { status: 200 });
    } catch (e) {
      console.error(`Failed to run worker:`, e);
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
    const result = await run(env);
    console.info(`Scheduled sync result: `, result);
  },
};
