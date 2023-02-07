import { Client } from "@notionhq/client";
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

export function createNotionClient(options: {
  token: string;
  databaseId: string;
}) {
  const notion = new Client({
    auth: options.token,
    notionVersion: "2022-06-28",
  });

  return {
    async getDataBaseNotion(propertyName: string, checkbox: boolean) {
      const databaseList = await notion.databases.query({
        page_size: 100,
        database_id: options.databaseId,
        auth: options.token,
        filter: {
          property: "object",
          and: [
            {
              property: propertyName,
              checkbox: {
                equals: checkbox,
              },
            },
          ],
        },
      });
      const list = databaseList.results || [];
      const hasNextPage = databaseList.has_more;

      return {
        list,
        hasNextPage,
      };
    },
    async getAllInfoFromDatabaseNotion(pageCount: number = 1) {
      let databaseList = [];
      const propertyName = "Visible on Roadmap?";

      for (let i = 0; i < pageCount; i++) {
        const pageData = await this.getDataBaseNotion(propertyName, true);
        databaseList.push(...pageData.list);
        const result = pageData.hasNextPage;
        if (!result) {
          break;
        }
      }
      return databaseList[0] as PageObjectResponse;
    },
    async findTasksByEffectedLibrary(libraryName: string) {
      const results = await notion.databases.query({
        database_id: options.databaseId,
        filter: {
          property: "Effected Library",
          multi_select: {
            contains: libraryName,
          },
        },
      });

      return (results.results[0] as PageObjectResponse) || null;
    },
  };
}
