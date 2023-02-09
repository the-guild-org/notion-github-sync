import { Env } from "../..";
import { createNotionClient } from "./utils";

export async function runSyncFromNotionDataBase(env: Env) {
  const notion = createNotionClient({
    token: env.NOTION_TOKEN,
  });

  const libraries = await notion.queryPublishRoadmapLibraries();
  console.log(
    "libraries.results",
    libraries?.results.map((v) => v.id),
    libraries?.results.map((v) => v.object)
  );

  if (libraries) {
    for (const library of libraries?.results) {
      const tasks = await notion.getAllInfoFromDatabaseNotion(library.id, 5);
      console.log(
        "library.tasks",
        tasks.map((v) => v.object),
        tasks.map((v) => v.id)
      );
      for (const task of tasks) {
        console.log("task", task);
      }
    }
  }
}
