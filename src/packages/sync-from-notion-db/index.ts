import { PartialPageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { Env } from "../..";
import { createNotionClient } from "./utils";

export async function runSyncFromNotionDataBase(
  env: Env
): Promise<PartialPageObjectResponse[]> {
  const notion = createNotionClient({
    token: env.NOTION_TOKEN,
  });
  const libraries = await notion.queryPublishRoadmapLibraries();

  if (notion != undefined && libraries != undefined) {
    for (const library of libraries.results) {
      const tasks = await notion.getAllInfoFromDatabaseNotion(library.id, 5);
      if (!tasks) {
        console.error("Fetch data from Notion database was failed.");
        return [];
      } else {
        return tasks;
      }
    }
  } else {
    console.error("Fetch data from Notion database was failed.");
    return [];
  }
  return [];
}
