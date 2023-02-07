import { Client } from "@notionhq/client";

type GetDataBaseNotionProps = {
  notion: Client;
  databaseId: string;
  token: string;
  propertyName: string;
  checkbox: boolean;
};

export async function getDataBaseNotion({
  notion,
  databaseId,
  token,
  propertyName,
  checkbox,
}: GetDataBaseNotionProps) {
  const databaseList = await notion.databases.query({
    page_size: 100,
    database_id: databaseId,
    auth: token,
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

  const list = (databaseList.results || []).map((v) => v);
  const hasNextPage = databaseList.has_more;

  return {
    list,
    hasNextPage,
  };
}

export async function getAllInfoFromDatabaseNotion(
  notion: Client,
  databaseId: string,
  token: string,
  checkbox: boolean = true,
  pageCount: number = 1
) {
  let databaseList = [];
  const propertyName = "Visible on Roadmap?";

  for (let i = 0; i < pageCount; i++) {
    const pageData = await getDataBaseNotion({
      notion,
      databaseId,
      token,
      propertyName,
      checkbox,
    });
    databaseList.push(...pageData.list);
    const result = pageData.hasNextPage;
    if (!result) {
      break;
    }
  }
  return databaseList;
}
