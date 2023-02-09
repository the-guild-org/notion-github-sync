import { Client } from "@notionhq/client";
import {
  QueryDatabaseParameters,
  QueryDatabaseResponse,
} from "@notionhq/client/build/src/api-endpoints";

export type Body = Omit<QueryDatabaseParameters, "database_id">;

export function createNotionClient(options: { token: string }) {
  const notion = new Client({
    auth: options.token,
    notionVersion: "2022-06-28",
  });

  return {
    async queryPublishRoadmapLibraries() {
      const librariesID = "d90c28b1672b4cd3947cafe4b9fa338e";
      const response = await notion.databases.query({
        database_id: librariesID,
        filter: {
          property: "Publish Roadmap?",
          checkbox: {
            equals: true,
          },
        },
      });
      if (response) {
        return response;
      }
      if (!response) {
        console.error(
          `Fetch data from Notion database was failed. Database ID: ${librariesID}. - Return undefined`
        );
        return undefined;
      }
    },
    async queryInRoadmapFromMainDataBase(
      libraryId: string,
      nextCursor?: string | null | undefined
    ): Promise<QueryDatabaseResponse | undefined> {
      const databaseID = "9cd3148ef6354e19ada9f910b5a9ea57";
      const response = await notion.databases.query({
        database_id: databaseID,
        filter: {
          and: [
            {
              property: "In Roadmap?",
              checkbox: {
                equals: true,
              },
            },
            {
              property: "Effected Libraries",
              relation: {
                contains: libraryId,
              },
            },
          ],
        },
        start_cursor: nextCursor ?? undefined,
      });
      if (response) {
        console.log("Fetch data from database", response);
        const result = response as QueryDatabaseResponse;
        return result;
      } else return undefined;
    },
    async getAllInfoFromDatabaseNotion(
      libraryId: string,
      pageCount: number = 1
    ) {
      let nextCursor: string | null | undefined;
      let databaseList = [];

      for (let i = 0; i < pageCount; i++) {
        const dataBase = await this.queryInRoadmapFromMainDataBase(
          libraryId,
          nextCursor
        );
        nextCursor = dataBase?.next_cursor;
        databaseList.push(...(dataBase?.results ?? []));
        const result = dataBase?.has_more;
        if (!result) {
          break;
        }
      }
      return databaseList;
    },
  };
}
