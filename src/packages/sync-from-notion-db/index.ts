import { Client } from "@notionhq/client";
import { Env } from "../..";
import { createNotionClient } from "./utils";

export function runSyncFromNotionDataBase(env: Env, databaseId: string) {
  const notion = createNotionClient({
    databaseId: databaseId,
    token: env.NOTION_TOKEN,
  });

  // 1. Fetch all tasks from Notion database - Visible on Roadmap? = true
  const dataBaseList = notion.getAllInfoFromDatabaseNotion();
  // 2. Sort tasks by Effected Library

  // 3. Searche GitHub for the issues/discussion, and creates/updates it on GitHub
}
