import { Client } from "@notionhq/client";
import { Page } from "./utils";

export function composeLink(page: Page): string {
  if ((page as any).url) {
    return `> Notion page URL: ${(page as any).url}`;
  }

  return "";
}

export function composeSignature(pageId: string): string {
  return `<!-- ${pageId} -->`;
}

export function extractPageTitle(page: Page): string | null {
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

export async function getSharedNotionPages(notion: Client) {
  const relevantPages = await notion.search({
    page_size: 100,
  });

  return relevantPages.results;
}
